// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/security";
import { PartnerError } from "@/lib/partners/errors";
import { body, familyErrorResponse, invalid, requireUser } from "@/lib/family/http";
import { asaasActiveFor, asaasDeps } from "@/lib/bank/asaas/deps";
import { currentSubaccount, openSubaccount, refreshSubaccountStatus, subaccountView } from "@/lib/bank/asaas/onboarding";
import { logAsaasUnavailable } from "@/lib/bank/asaas/provisioning-log";

const NO_STORE = { "Cache-Control": "no-store" };

/** GET /api/bank/accounts — situação da subconta no banco parceiro (sem dados sensíveis). */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    if (!asaasActiveFor(user.id)) return NextResponse.json({ provider: null }, { headers: NO_STORE });
    const deps = asaasDeps();
    return NextResponse.json({ provider: "asaas", subaccount: subaccountView(await currentSubaccount(user.id, deps)) }, { headers: NO_STORE });
  } catch (error) {
    return familyErrorResponse(error, "Erro ao consultar a conta no PRX BANK.");
  }
}

const schema = z.object({ action: z.enum(["open", "refresh"]).default("open") });

/**
 * POST /api/bank/accounts
 *   open     cria a subconta no Asaas com os dados do KYC aprovado (idempotente)
 *   refresh  consulta a aprovação no Asaas (caso o webhook tenha se perdido)
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    if (!asaasActiveFor(user.id)) {
      await logAsaasUnavailable(user.id);
      throw new PartnerError("A ativação de contas ainda não está disponível neste ambiente.", 503);
    }
    const rate = checkRateLimit(`bank_accounts_${user.id}`, 6, 300);
    if (!rate.allowed) throw new PartnerError(`Muitas tentativas. Tente em ${rate.resetInSeconds}s.`, 429);
    const parsed = schema.safeParse(await body(req));
    if (!parsed.success) invalid(parsed.error.issues);
    const deps = asaasDeps();
    const subaccount = parsed.data.action === "refresh" ? await refreshSubaccountStatus(user.id, deps) : await openSubaccount(user.id, deps);
    return NextResponse.json({ success: true, subaccount }, { headers: NO_STORE });
  } catch (error) {
    return familyErrorResponse(error, "Não foi possível abrir a conta no PRX BANK.");
  }
}
