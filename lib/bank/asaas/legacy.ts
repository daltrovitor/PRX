// Hello World
import type { BankAccountRecord } from "@/lib/bank/repository";
import type { AsaasDeps } from "@/lib/bank/asaas/deps";
import { currentSubaccount } from "@/lib/bank/asaas/subaccount";

/**
 * Contas criadas antes do Asaas deste ambiente (sandbox: saldo, cartão e
 * agência fictícios) não valem com dinheiro real. Enquanto o espelho não
 * estiver ligado à subconta atual, ele volta a "em ativação" e passa a seguir
 * a subconta. Conta bloqueada pela PRX continua bloqueada.
 * Devolve true quando mexeu na conta (quem chamou relê o espelho).
 */
export async function reconcileLegacyAccount(userId: string, account: BankAccountRecord, deps: AsaasDeps): Promise<boolean> {
  if (account.status === "blocked") return false;
  const sub = await currentSubaccount(userId, deps);
  const realId = sub?.asaasAccountId ?? null;
  if (realId && account.providerAccountId === realId) return false;

  const leftovers =
    account.status !== "pending_activation" || account.balance !== 0 || Boolean(account.agency || account.accountNumber || account.virtualCard || account.activatedAt || account.providerAccountId);
  if (!leftovers && !realId) return false;

  await deps.mirror.resetAccount(userId);
  if (sub && realId) {
    await deps.mirror.linkAccount(userId, { providerAccountId: realId, agency: sub.agency, accountNumber: sub.accountNumber });
    if (sub.status === "active") await deps.mirror.setAccountStatus(userId, "active", deps.now().toISOString());
  }
  return true;
}
