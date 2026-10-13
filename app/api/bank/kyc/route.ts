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
import { currentAuditContext, withAsaasAudit } from "@/lib/asaas/audit";
import { bankLog } from "@/lib/asaas/log";
import { isSandboxMode, usesSupabaseBank } from "@/lib/bank/repository";
import { logAsaasUnavailable, logDeferred } from "@/lib/bank/asaas/provisioning-log";

const NO_STORE = { "Cache-Control": "no-store" };

/** O envio dos documentos roda depois da resposta (15 s após a criação da subconta). */
export const maxDuration = 60;

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
 * Com o banco parceiro ligado, a abertura é aprovada pelas regras do PRX, a
 * subconta é criada no Asaas na mesma hora e os documentos seguem 15 s depois
 * (regra do Asaas), após a resposta; se o Asaas falhar, a aba PRX BANK oferece
 * "Abrir conta" com os dados salvos e a conciliação tenta de novo. Com o banco
 * desligado neste deploy, a abertura fica salva em andamento: nada é aprovado
 * sem poder seguir ao banco, e o membro não precisa reenviar.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const rate = checkRateLimit(`bank_kyc_${user.id}`, 5, 300);
    if (!rate.allowed) throw new PartnerError(`Muitas tentativas. Tente em ${rate.resetInSeconds}s.`, 429);
    const parsed = bankKycSchema.safeParse(await body(req));
    if (!parsed.success) invalid(parsed.error.issues);
    const bankOffline = usesSupabaseBank(user.id) && !isSandboxMode() && !asaasActiveFor(user.id);
    // Uma correlação para o cadastro, a abertura no Asaas e cada chamada à API (logs da Vercel e asaas_api_requests).
    return await withAsaasAudit({ userId: user.id }, async () => {
      const app = await submitBankKyc(user, parsed.data, { ip: clientIp(req), userAgent: req.headers.get("user-agent") ?? "" }, new Date(), {
        allowRedo: await canRedo(user.id),
        forward: !bankOffline,
      });
      bankLog("info", "bank.kyc", {
        correlationId: currentAuditContext().correlationId,
        step: "kyc.submit",
        outcome: app.status,
        userId: user.id,
        localId: app.id,
        detail: bankOffline ? "banco parceiro desligado neste deploy: abertura salva em andamento, nada enviado" : null,
      });
      // O resultado do envio ao Asaas fica para o admin (bank_provisioning_log, asaas_api_requests e logs da Vercel), não para o membro.
      if (app.status === "approved" && asaasActiveFor(user.id)) {
        try {
          const { ensureAsaasCustomerAndAccount } = await import("@/lib/bank/asaas/onboarding");
          await ensureAsaasCustomerAndAccount(user.id);
          const { scheduleDocumentSync } = await import("@/lib/bank/asaas/schedule");
          scheduleDocumentSync(user.id);
        } catch (err) {
          logDeferred(user.id, "abertura.conta", err);
        }
      } else if (bankOffline) {
        await logAsaasUnavailable(user.id);
      }
      return NextResponse.json({ success: true, kyc: await bankKycState(user.id), providerError: null }, { headers: NO_STORE });
    });
  } catch (error) {
    return familyErrorResponse(error, "Não foi possível enviar a abertura de conta.");
  }
}
