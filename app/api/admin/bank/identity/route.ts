// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse, readJson, requireAdmin } from "@/lib/partners/http";
import { firstIssue } from "@/lib/partners/types";
import { recordAdminAction } from "@/lib/admin/audit";
import { pageParams } from "@/lib/admin/paging";
import { DOCUMENT_KINDS, DOCUMENT_LABEL } from "@/lib/family/types";
import { approveReceivedDocuments, requestResubmission, reviewDocument } from "@/lib/kyc/identity";
import { IDENTITY_FILTERS, identityDetail, identityQueue, type IdentityFilter } from "@/lib/kyc/identity-admin";
import { reviewBankKyc } from "@/lib/kyc/service";
import { FamilyError } from "@/lib/family/service";

const NO_STORE = { "Cache-Control": "no-store, private" };

/**
 * GET /api/admin/bank/identity
 *   ?id=…                       ficha completa (dados, documentos, histórico)
 *   ?status=&q=&page=&pageSize= fila paginada com busca por nome, e-mail ou CPF
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const params = req.nextUrl.searchParams;
    const id = params.get("id");
    if (id) {
      const detail = await identityDetail(id.slice(0, 80));
      if (!detail) throw new PartnerError("Abertura não encontrada.", 404);
      return NextResponse.json({ success: true, detail }, { headers: NO_STORE });
    }
    const raw = params.get("status") ?? "pending";
    const status = (IDENTITY_FILTERS as readonly string[]).includes(raw) ? (raw as IdentityFilter) : "pending";
    const { page, pageSize } = pageParams(params, 20);
    const result = await identityQueue(status, params.get("q") ?? "", page, pageSize);
    return NextResponse.json({ success: true, ...result, page, pageSize }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao carregar a análise de identidade.");
  }
}

const id = z.string().trim().min(1).max(80);
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("review_document"), id, kind: z.enum(DOCUMENT_KINDS), decision: z.enum(["approve", "reject"]), reason: z.string().max(280).default("") }),
  z.object({ action: z.literal("approve_documents"), id }),
  z.object({ action: z.literal("request_resubmission"), id, note: z.string().max(300).default("") }),
  z.object({ action: z.literal("approve"), id, note: z.string().max(500).default("") }),
  z.object({ action: z.literal("reject"), id, note: z.string().max(500) }),
]);

/**
 * POST /api/admin/bank/identity — decisões da análise (sempre explícitas e auditadas).
 *   review_document       aprova ou recusa um documento (recusa com motivo)
 *   approve_documents     aprova de uma vez os documentos recebidos (o admin conferiu todos)
 *   request_resubmission  pede à pessoa o reenvio dos recusados
 *   approve               aprova a identidade: a subconta é criada no Asaas e os documentos seguem para a análise dele
 *   reject                recusa a abertura (motivo obrigatório; a pessoa pode enviar de novo)
 */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 400);
    const body = parsed.data;
    const reviewer = admin.email || admin.sub;
    let summary: string;

    switch (body.action) {
      case "review_document":
        await reviewDocument(body.id, body.kind, body.decision, body.reason, reviewer);
        summary = `Identidade: ${DOCUMENT_LABEL[body.kind]} ${body.decision === "approve" ? "aprovado" : `recusado (${body.reason.trim()})`}`;
        break;
      case "approve_documents":
        await approveReceivedDocuments(body.id, reviewer);
        summary = "Identidade: documentos recebidos aprovados";
        break;
      case "request_resubmission":
        await requestResubmission(body.id, body.note, reviewer);
        summary = "Identidade: reenvio pedido";
        break;
      case "approve":
      case "reject": {
        const decided = await reviewBankKyc(body.id, body.action, body.note, reviewer);
        summary = body.action === "approve" ? `Identidade aprovada: ${decided.fullName}` : `Abertura recusada: ${decided.fullName} (${body.note.trim()})`;
        if (body.action === "approve") {
          // O Asaas pede 15 s entre a criação da subconta e a consulta dos documentos: o envio roda depois da resposta.
          const { asaasActiveFor } = await import("@/lib/bank/asaas/deps");
          if (asaasActiveFor(decided.userId)) {
            const { scheduleDocumentSync } = await import("@/lib/bank/asaas/schedule");
            scheduleDocumentSync(decided.userId);
          }
        }
        break;
      }
    }

    await recordAdminAction(admin, { action: `bank.identity_${body.action}`, targetType: "bank_kyc", targetId: body.id, summary }, req);
    return NextResponse.json({ success: true, detail: await identityDetail(body.id) }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof FamilyError && error.status < 500) return NextResponse.json({ error: error.message, code: error.code ?? null }, { status: error.status });
    return errorResponse(error, "Não foi possível registrar a decisão.");
  }
}

/** A aprovação abre a subconta no Asaas e agenda o envio dos documentos depois da resposta. */
export const maxDuration = 60;
