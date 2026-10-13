// Hello World
import { AsaasError } from "@/lib/asaas/errors";
import { asaasChecklist, type AsaasEnvironment } from "@/lib/asaas/config";
import { errorMessage } from "@/lib/errors";
import { currentAuditContext } from "@/lib/asaas/audit";
import { bankLog, deployTag } from "@/lib/asaas/log";
import type { AsaasDeps } from "@/lib/bank/asaas/deps";
import { getAsaasBankStore } from "@/lib/bank/asaas/store";
import type { AsaasBankStore, ProvisioningLogEntry } from "@/lib/bank/asaas/types";

/**
 * Cada envio do cadastro do PRX BANK ao Asaas fica para o admin, nunca para o
 * membro: tabela bank_provisioning_log (Supabase) e linha JSON "bank.provisioning"
 * nos logs da Vercel. O membro só recebe mensagens genéricas.
 */

/** Texto completo do erro para o admin (status e código do Asaas quando houver). */
export function describeError(err: unknown): string {
  if (err instanceof AsaasError) return `Asaas ${err.status}${err.code ? ` ${err.code}` : ""}${err.ambiguous ? " (sem resposta)" : ""}: ${err.message}`;
  return errorMessage(err, "erro desconhecido");
}

async function record(store: AsaasBankStore, entry: ProvisioningLogEntry): Promise<void> {
  bankLog(entry.outcome === "sent" ? "info" : "error", "bank.provisioning", {
    correlationId: currentAuditContext().correlationId,
    step: `abertura.${entry.step}`,
    outcome: entry.outcome,
    userId: entry.userId,
    asaasId: entry.asaasAccountId,
    environment: entry.environment,
    detail: entry.detail,
  });
  await store.logProvisioning(entry);
}

/** Etapa adiada (documentos, abertura após o cadastro): a próxima visita ou a conciliação refaz. */
export function logDeferred(userId: string, step: string, err: unknown): void {
  bankLog("warn", "bank.provisioning", { correlationId: currentAuditContext().correlationId, step, outcome: "deferred", userId, error: describeError(err) });
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
  // O deploy (ambiente da Vercel + commit) diz se o registro veio de uma versão anterior à correção das variáveis.
  const detail = `Asaas desligado no servidor (deploy ${deployTag()}); nada foi enviado.${pending.length ? ` Ajustar na Vercel e fazer redeploy: ${pending.join(" ")}` : ""}`.slice(0, 1000);
  return record(getAsaasBankStore(), { userId, environment, step: "account", outcome: "blocked", asaasAccountId: null, detail });
}
