// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/security";
import { PartnerError } from "@/lib/partners/errors";
import { familyErrorResponse, requireUser } from "@/lib/family/http";
import { asaasActiveFor, asaasDeps } from "@/lib/bank/asaas/deps";
import { subaccountDocuments, syncOnboardingDocuments, uploadSubaccountDocument } from "@/lib/bank/asaas/documents";
import { currentSubaccount } from "@/lib/bank/asaas/subaccount";
import { describeError } from "@/lib/bank/asaas/provisioning-log";

const NO_STORE = { "Cache-Control": "no-store" };

async function member(req: NextRequest) {
  const user = await requireUser(req);
  if (!asaasActiveFor(user.id)) throw new PartnerError("A ativação de contas ainda não está disponível neste ambiente.", 503);
  return user;
}

/**
 * GET /api/bank/accounts/documents — documentos que o banco parceiro ainda pede.
 * Na primeira visita depois da criação, envia antes o que o PRX já tem.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await member(req);
    const deps = asaasDeps();
    const sub = await currentSubaccount(user.id, deps);
    if (sub?.asaasAccountId && sub.apiKeySealed && !sub.documentsSyncedAt) {
      await syncOnboardingDocuments(user.id, deps).catch((err: unknown) => console.warn("[prx-bank:abertura] documentos adiados:", describeError(err)));
    }
    return NextResponse.json(await subaccountDocuments(user.id, deps), { headers: NO_STORE });
  } catch (error) {
    return familyErrorResponse(error, "Erro ao consultar os documentos.");
  }
}

/**
 * POST /api/bank/accounts/documents
 *   JSON { action: "forward_kyc" }      envia o que o PRX já tem (frente e verso num PDF, certidão);
 *                                       responde wait (ms) se a subconta tem menos de 15 s
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
    const result = await syncOnboardingDocuments(user.id, deps);
    const sent = result.state === "done" ? result.sent : 0;
    const wait = result.state === "wait" ? result.retryInMs : null;
    return NextResponse.json({ success: true, sent, wait, ...(await subaccountDocuments(user.id, deps)) }, { headers: NO_STORE });
  } catch (error) {
    return familyErrorResponse(error, "Não foi possível enviar o documento.");
  }
}
