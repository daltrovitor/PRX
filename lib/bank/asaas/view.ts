// Hello World
import { errorMessage } from "@/lib/errors";
import type { BankProviderView, PixKey } from "@/lib/prx/bank";
import { asaasActiveFor, asaasDeps } from "@/lib/bank/asaas/deps";
import { currentSubaccount, subaccountView } from "@/lib/bank/asaas/onboarding";
import { providerPixKeys } from "@/lib/bank/asaas/cash-in";
import { providerBalance } from "@/lib/bank/asaas/statement";

/**
 * O que a aba PRX BANK mostra direto do banco parceiro. Cada parte falha
 * sozinha: sem o Asaas (ou sem a migração), a aba segue com o espelho local.
 */
export interface ProviderSnapshot {
  provider: BankProviderView;
  /** Chaves registradas no DICT pela subconta (null = usar o espelho). */
  pixKeys: PixKey[] | null;
  /** Saldo oficial no Asaas (null = usar o último saldo em cache). */
  balance: number | null;
}

/** Parte opcional da visão: falha vira null e um aviso no log. */
async function optional<T>(label: string, task: Promise<T>): Promise<T | null> {
  try {
    return await task;
  } catch (err) {
    console.warn(`[bank] ${label} do banco parceiro indisponível:`, errorMessage(err));
    return null;
  }
}

export async function providerSnapshot(userId: string): Promise<ProviderSnapshot | null> {
  if (!asaasActiveFor(userId)) return null;
  try {
    const deps = asaasDeps();
    const sub = subaccountView(await currentSubaccount(userId, deps));
    const provider: BankProviderView = { name: "asaas", environment: deps.client.environment, state: sub.state, rejectReason: sub.rejectReason };
    if (sub.state !== "active") return { provider, pixKeys: null, balance: null };
    const [pixKeys, balance] = await Promise.all([optional("chaves Pix", providerPixKeys(userId, deps)), optional("saldo", providerBalance(userId, deps))]);
    return { provider, pixKeys, balance };
  } catch (err) {
    console.warn("[bank] banco parceiro indisponível na visão da conta:", errorMessage(err));
    return null;
  }
}
