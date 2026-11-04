// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/security";
import { PartnerError } from "@/lib/partners/errors";
import { clientIp } from "@/lib/partners/http";
import { bankKycSchema } from "@/lib/kyc/types";
import { kycPrefill, withAccountIdentity } from "@/lib/kyc/prefill";
import { bankKycState, submitBankKyc } from "@/lib/kyc/service";
import { body, familyErrorResponse, invalid, requireUser } from "@/lib/family/http";
import { bankLog } from "@/lib/bank/log";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * GET /api/bank/kyc — situação da abertura do PRX BANK e o que a conta já sabe
 * (prefill: CPF, nascimento, nome, celular e a última abertura), para a tela
 * não pedir de novo. Só para o próprio membro, sem cache.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const [kyc, prefill] = await Promise.all([bankKycState(user.id), kycPrefill(user)]);
    return NextResponse.json({ kyc, prefill }, { headers: NO_STORE });
  } catch (error) {
    return familyErrorResponse(error, "Erro ao carregar a abertura de conta.");
  }
}

/**
 * POST /api/bank/kyc — abertura da conta PRX BANK (KYC bancário). Tudo é
 * validado aqui no servidor (zod + regras antifraude + idade/liberação), nunca
 * só na tela. A abertura fica em análise pela PRX: a equipe confere cada
 * documento e a selfie e aprova explicitamente (Admin → PRX BANK → Identidade).
 * Só então a abertura segue ao banco parceiro. Envio repetido devolve a mesma abertura em análise.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const rate = checkRateLimit(`bank_kyc_${user.id}`, 5, 300);
    if (!rate.allowed) throw new PartnerError(`Muitas tentativas. Tente em ${rate.resetInSeconds}s.`, 429);
    const parsed = bankKycSchema.safeParse(await body(req));
    if (!parsed.success) invalid(parsed.error.issues);
    // CPF e nascimento da conta (cadastro conferido na Receita) valem mais que os da tela: pedidos uma vez só.
    const input = withAccountIdentity(parsed.data, await kycPrefill(user));
    // Sem conta aberta no banco parceiro (nenhum provedor ligado), refazer a abertura é sempre possível.
    const app = await submitBankKyc(user, input, { ip: clientIp(req), userAgent: req.headers.get("user-agent") ?? "" }, new Date(), { allowRedo: true });
    bankLog("info", "bank.kyc", {
      step: "kyc.submit",
      outcome: app.status,
      userId: user.id,
      localId: app.id,
      detail: "abertura em análise pela PRX: nada vai ao banco parceiro antes da aprovação do admin",
    });
    return NextResponse.json({ success: true, kyc: await bankKycState(user.id), providerError: null }, { headers: NO_STORE });
  } catch (error) {
    return familyErrorResponse(error, "Não foi possível enviar a abertura de conta.");
  }
}
