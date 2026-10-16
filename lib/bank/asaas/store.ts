// Hello World
import { supabaseAdmin } from "@/lib/supabase/client";
import { MemoryAsaasBankStore } from "@/lib/bank/asaas/store-memory";
import { SupabaseAsaasBankStore } from "@/lib/bank/asaas/store-supabase";
import type { AsaasBankStore } from "@/lib/bank/asaas/types";

/**
 * Espelho do Asaas no Supabase (migração 20261001_prx_asaas_baas.sql):
 * subcontas, log de webhooks, avisos do banco e pedidos de saída. O saldo
 * oficial vem sempre do Asaas; aqui fica o que a PRX precisa para conciliar.
 */

export type * from "@/lib/bank/asaas/types";

let override: AsaasBankStore | null = null;

/** Supabase em produção; memória em desenvolvimento e nos testes. */
export function getAsaasBankStore(): AsaasBankStore {
  if (override) return override;
  return supabaseAdmin ? new SupabaseAsaasBankStore(supabaseAdmin) : MemoryAsaasBankStore.shared();
}

/** Só para testes: troca o armazenamento. */
export function setAsaasBankStoreForTests(store: AsaasBankStore | null): void {
  override = store;
}
