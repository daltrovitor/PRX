// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/security";
import { PartnerError } from "@/lib/partners/errors";
import { familyErrorResponse, requireUser } from "@/lib/family/http";
import { asaasActiveFor, asaasDeps } from "@/lib/bank/asaas/deps";
import { forwardKycDocuments, subaccountDocuments, uploadSubaccountDocument } from "@/lib/bank/asaas/documents";

const NO_STORE = { "Cache-Control": "no-store" };

async function member(req: NextRequest) {
  const user = await requireUser(req);
  if (!asaasActiveFor(user.id)) throw new PartnerError("A ativação de contas ainda não está disponível neste ambiente.", 503);
  return user;
}

/** GET /api/bank/accounts/documents — documentos que o banco parceiro ainda pede. */
export async function GET(req: NextRequest) {
  try {
    const user = await member(req);
    return NextResponse.json(await subaccountDocuments(user.id, asaasDeps()), { headers: NO_STORE });
  } catch (error) {
    return familyErrorResponse(error, "Erro ao consultar os documentos.");
  }
}

/**
 * POST /api/bank/accounts/documents
 *   JSON { action: "forward_kyc" }      reaproveita a frente e o verso enviados no KYC do PRX
 *   multipart { groupId, file }         envia um documento pendente (JPG, PNG ou PDF, até 10 MB)
 */
export async function POST(req: NextRequest) {
  try {
    const user = await member(req);
    const rate = checkRateLimit(`bank_docs_${user.id}`, 10, 300);
    if (!rate.allowed) throw new PartnerError(`Muitas tentativas. Tente em ${rate.resetInSeconds}s.`, 429);
    const deps = asaasDeps();

    if ((req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
      const form = await req.formData().catch(() => null);
      const groupId = form?.get("groupId");
      const file = form?.get("file");
      if (typeof groupId !== "string" || !(file instanceof File)) throw new PartnerError("Escolha o arquivo do documento.", 422);
      await uploadSubaccountDocument(user.id, groupId, file, deps);
      return NextResponse.json({ success: true, ...(await subaccountDocuments(user.id, deps)) }, { headers: NO_STORE });
    }

    const json = (await req.json().catch(() => null)) as { action?: unknown } | null;
    if (json?.action !== "forward_kyc") throw new PartnerError("Ação inválida.", 400);
    const sent = await forwardKycDocuments(user.id, deps);
    return NextResponse.json({ success: true, sent, ...(await subaccountDocuments(user.id, deps)) }, { headers: NO_STORE });
  } catch (error) {
    return familyErrorResponse(error, "Não foi possível enviar o documento.");
  }
}
