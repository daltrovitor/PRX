// Hello World
import { AsaasError } from "@/lib/asaas/errors";
import { asaasChecklist, type AsaasEnvironment } from "@/lib/asaas/config";
import { errorMessage } from "@/lib/errors";
import type { AsaasDeps } from "@/lib/bank/asaas/deps";
import { getAsaasBankStore } from "@/lib/bank/asaas/store";
import type { AsaasBankStore, ProvisioningLogEntry } from "@/lib/bank/asaas/types";

/**
 * Cada envio do cadastro do PRX BANK ao Asaas fica para o admin, nunca para o
 * membro: tabela bank_provisioning_log (Supabase) e linha "[prx-bank:abertura]"
 * nos logs da Vercel. O membro só recebe mensagens genéricas.
 */

/** Texto completo do erro para o admin (status e código do Asaas quando houver). */
export function describeError(err: unknown): string {
  if (err instanceof AsaasError) return `Asaas ${err.status}${err.code ? ` ${err.code}` : ""}${err.ambiguous ? " (sem resposta)" : ""}: ${err.message}`;
  return errorMessage(err, "erro desconhecido");
}

async function record(store: AsaasBankStore, entry: ProvisioningLogEntry): Promise<void> {
  const line = `[prx-bank:abertura] ${entry.step} ${entry.outcome} user=${entry.userId} env=${entry.environment}${entry.asaasAccountId ? ` asaas=${entry.asaasAccountId}` : ""}${entry.detail ? ` · ${entry.detail}` : ""}`;
  if (entry.outcome === "sent") console.info(line);
  else console.error(line);
  await store.logProvisioning(entry);
}

export function logProvisioning(deps: AsaasDeps, entry: Omit<ProvisioningLogEntry, "environment">): Promise<void> {
  return record(deps.store, { ...entry, environment: deps.client.environment });
}

/** Asaas desligado no servidor: o cadastro foi aprovado, mas nada foi enviado. */
export function logAsaasUnavailable(userId: string): Promise<void> {
  const environment: AsaasEnvironment = (process.env.ASAAS_ENVIRONMENT ?? "").trim().toLowerCase() === "production" ? "production" : "sandbox";
  // O texto de cada item diz o que fazer (o rótulo mostra o valor atual, que confundia: "ASAAS_ENVIRONMENT = sandbox").
  const pending = asaasChecklist()
    .filter((c) => !c.ok)
    .map((c) => c.hint ?? c.label);
  const detail = `Asaas desligado no servidor; nada foi enviado.${pending.length ? ` Ajustar na Vercel: ${pending.join(" ")}` : ""}`.slice(0, 1000);
  return record(getAsaasBankStore(), { userId, environment, step: "account", outcome: "blocked", asaasAccountId: null, detail });
}
