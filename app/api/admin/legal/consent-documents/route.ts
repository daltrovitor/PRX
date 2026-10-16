// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse, readJson, requireAdmin } from "@/lib/partners/http";
import { firstIssue } from "@/lib/partners/types";
import { recordAdminAction } from "@/lib/admin/audit";
import { activateConsentDocument, activeConsentDocument, approveConsentDocument, createConsentDocument, listConsentDocuments } from "@/lib/live/consent-documents";

const NO_STORE = { "Cache-Control": "no-store, private" };

/** GET /api/admin/legal/consent-documents — versões do termo da liberação do responsável e a vigente. */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const [versions, active] = await Promise.all([listConsentDocuments(), activeConsentDocument()]);
    return NextResponse.json({ success: true, versions, active }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao carregar os documentos.");
  }
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), data: z.unknown() }),
  z.object({ action: z.literal("activate"), id: z.string().trim().min(1).max(80) }),
  z.object({ action: z.literal("approve"), id: z.string().trim().min(1).max(80), note: z.string().max(1000), confirmed: z.literal(true, { error: "Confirme que o jurídico aprovou esta versão." }) }),
]);

/**
 * POST /api/admin/legal/consent-documents
 *   create    nova versão (texto e link do certificado), ainda não vigente
 *   activate  passa a valer para as próximas liberações
 *   approve   registra a aprovação jurídica (quem, quando, parecer)
 */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 400);
    const body = parsed.data;
    const actor = admin.email || admin.sub;
    if (body.action === "create") {
      const doc = await createConsentDocument(body.data, actor);
      await recordAdminAction(admin, { action: "legal.consent_doc_created", targetType: "consent_document", targetId: doc.id ?? "", summary: `Termo do responsável: versão ${doc.version}` }, req);
      return NextResponse.json({ success: true, document: doc }, { status: 201, headers: NO_STORE });
    }
    if (body.action === "activate") await activateConsentDocument(body.id);
    else await approveConsentDocument(body.id, body.note, actor);
    await recordAdminAction(admin, { action: `legal.consent_doc_${body.action === "activate" ? "activated" : "approved"}`, targetType: "consent_document", targetId: body.id, summary: body.action === "activate" ? "Versão vigente trocada" : `Aprovação jurídica: ${body.note}` }, req);
    return NextResponse.json({ success: true }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao salvar o documento.");
  }
}
