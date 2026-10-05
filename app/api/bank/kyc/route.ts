// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/security";
import { PartnerError } from "@/lib/partners/errors";
import { clientIp } from "@/lib/partners/http";
import { bankKycSchema } from "@/lib/kyc/types";
import { bankKycState, submitBankKyc } from "@/lib/kyc/service";
import { body, familyErrorResponse, invalid, requireUser } from "@/lib/family/http";
import { asaasActiveFor } from "@/lib/bank/asaas/deps";
import { getAsaasBankStore } from "@/lib/bank/asaas/store";
import { readAsaasConfig } from "@/lib/asaas/config";
import { errorMessage } from "@/lib/errors";

const NO_STORE = { "Cache-Control": "no-store" };

/** GET /api/bank/kyc — situação da abertura do PRX BANK (sem dados pessoais). */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    return NextResponse.json({ kyc: await bankKycState(user.id) }, { headers: NO_STORE });
  } catch (error) {
    return familyErrorResponse(error, "Erro ao carregar a abertura de conta.");
  }
}

/** Dá para refazer a abertura enquanto a conta não existe no banco parceiro deste ambiente. */
async function canRedo(userId: string): Promise<boolean> {
  const config = readAsaasConfig();
  if (!config) return true;
  const sub = await getAsaasBankStore()
    .getSubaccount(userId)
    .catch(() => null);
  return !(sub?.asaasAccountId && sub.environment === config.environment);
}

/**
 * POST /api/bank/kyc — abertura da conta PRX BANK (KYC bancário). Tudo é
 * validado aqui no servidor (zod + regras antifraude), nunca só na tela.
 * Aprovada a abertura, a subconta é criada no Asaas na mesma hora e recebe os
 * documentos; se o Asaas falhar, a aba PRX BANK tenta de novo.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const rate = checkRateLimit(`bank_kyc_${user.id}`, 5, 300);
    if (!rate.allowed) throw new PartnerError(`Muitas tentativas. Tente em ${rate.resetInSeconds}s.`, 429);
    const parsed = bankKycSchema.safeParse(await body(req));
    if (!parsed.success) invalid(parsed.error.issues);
    const app = await submitBankKyc(user, parsed.data, { ip: clientIp(req), userAgent: req.headers.get("user-agent") ?? "" }, new Date(), { allowRedo: await canRedo(user.id) });
    let providerError: string | null = null;
    if (app.status === "approved" && asaasActiveFor(user.id)) {
      try {
        const { ensureAsaasCustomerAndAccount } = await import("@/lib/bank/asaas/onboarding");
        await ensureAsaasCustomerAndAccount(user.id);
      } catch (err) {
        providerError = errorMessage(err, "O banco parceiro não respondeu. Tentamos de novo quando você abrir o PRX BANK.");
        console.warn("[kyc] abertura no Asaas adiada:", providerError);
      }
    }
    return NextResponse.json({ success: true, kyc: await bankKycState(user.id), providerError }, { headers: NO_STORE });
  } catch (error) {
    return familyErrorResponse(error, "Não foi possível enviar a abertura de conta.");
  }
}
