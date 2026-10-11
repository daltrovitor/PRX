// Hello World
import { PartnerError } from "@/lib/partners/errors";
import { decryptSecret } from "@/lib/asaas/secrets";
import { ACTIVATION_REQUIRED } from "@/lib/prx/bank";
import type { AsaasDeps } from "@/lib/bank/asaas/deps";
import type { Subaccount, SubaccountKycStatus, SubaccountStatus } from "@/lib/bank/asaas/types";

/**
 * Subconta do membro neste ambiente do Asaas e a chave dela (aberta só para a
 * chamada). Base de todos os serviços do PRX BANK com o Asaas.
 */

export interface SubaccountView {
  state: "none" | "provisioning" | SubaccountStatus;
  kycStatus: SubaccountKycStatus | null;
  rejectReason: string | null;
}

export function subaccountView(sub: Subaccount | null): SubaccountView {
  if (!sub) return { state: "none", kycStatus: null, rejectReason: null };
  if (!sub.asaasAccountId) return { state: sub.provisioningStartedAt ? "provisioning" : "none", kycStatus: null, rejectReason: null };
  return { state: sub.status, kycStatus: sub.kycStatus, rejectReason: sub.rejectReason };
}

/**
 * Subconta deste ambiente do Asaas. Uma aberta em outro ambiente (o sandbox,
 * antes da produção) não vale aqui: o membro abre outra, e ela é substituída.
 */
export async function currentSubaccount(userId: string, deps: AsaasDeps): Promise<Subaccount | null> {
  const sub = await deps.store.getSubaccount(userId);
  return sub && sub.environment !== deps.client.environment ? null : sub;
}

/** Só vale o que aconteceu depois da subconta deste ambiente existir (antes, era dinheiro de teste). */
export function sinceSubaccount(sub: Subaccount, iso: string): boolean {
  return Date.parse(iso) >= Date.parse(sub.createdAt);
}

/** Subconta criada no Asaas cuja chave se perdeu: a equipe gera outra (painel admin), o membro só aguarda. */
export const SUBACCOUNT_KEY_MISSING = "Sua conta está sendo finalizada pela equipe PRX. Tente de novo em algumas horas.";

/** Subconta já criada no Asaas, com a apiKey aberta só para a chamada. */
export async function requireSubaccount(userId: string, deps: AsaasDeps): Promise<{ sub: Subaccount; apiKey: string }> {
  const sub = await currentSubaccount(userId, deps);
  if (!sub?.asaasAccountId) throw new PartnerError("Abra sua conta no PRX BANK primeiro.", 409);
  if (!sub.apiKeySealed) throw new PartnerError(SUBACCOUNT_KEY_MISSING, 503);
  return { sub, apiKey: decryptSecret(sub.apiKeySealed) };
}

/** Subconta aprovada pelo Asaas: só ela movimenta dinheiro. */
export async function requireActiveSubaccount(userId: string, deps: AsaasDeps): Promise<{ sub: Subaccount; apiKey: string }> {
  const found = await requireSubaccount(userId, deps);
  if (found.sub.status === "blocked") throw new PartnerError("Conta bloqueada. Fale com o suporte PRX.", 403);
  if (found.sub.status !== "active") throw new PartnerError(ACTIVATION_REQUIRED, 409);
  return found;
}
