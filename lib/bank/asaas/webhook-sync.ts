// Hello World
import { withAsaasAudit } from "@/lib/asaas/audit";
import { SUBACCOUNT_WEBHOOK_EVENTS } from "@/lib/asaas/accounts";
import { createWebhook, listWebhooks, updateWebhook, type WebhookConfig } from "@/lib/asaas/webhook-config";
import { errorMessage } from "@/lib/errors";
import type { AsaasDeps } from "@/lib/bank/asaas/deps";
import { subaccountWebhook } from "@/lib/bank/asaas/onboarding";
import { describeError, logProvisioning } from "@/lib/bank/asaas/provisioning-log";
import { requireSubaccount } from "@/lib/bank/asaas/subaccount";

/**
 * O webhook de cada subconta foi registrado na criação, com o token e os
 * eventos daquele dia. Quando o token muda (ASAAS_WEBHOOK_AUTH_TOKEN foi
 * rotacionado em 08/10/2026) ou entram eventos novos, as subcontas antigas
 * seguem com a configuração velha: o PRX recusa os avisos (401) e, depois de 15
 * falhas, o Asaas interrompe a fila — aprovações deixam de chegar. Aqui o PRX
 * lê e corrige a configuração com a chave da subconta.
 */

export interface WebhookHealth {
  /** Existe um webhook apontando para o PRX nesta subconta. */
  configured: boolean;
  id: string | null;
  url: string | null;
  urlMatches: boolean;
  enabled: boolean;
  /** Fila parada pelo Asaas (15 falhas seguidas): nenhum evento chega até reativar. */
  interrupted: boolean;
  penalizedRequests: number;
  hasAuthToken: boolean;
  missingEvents: string[];
}

function pick(list: WebhookConfig[], url: string): WebhookConfig | null {
  return list.find((w) => w.url === url) ?? list.find((w) => w.name === "PRX BANK") ?? list.find((w) => (w.url ?? "").includes("/api/bank/webhooks/asaas")) ?? null;
}

function health(found: WebhookConfig | null, url: string): WebhookHealth {
  if (!found) return { configured: false, id: null, url: null, urlMatches: false, enabled: false, interrupted: false, penalizedRequests: 0, hasAuthToken: false, missingEvents: [...SUBACCOUNT_WEBHOOK_EVENTS] };
  return {
    configured: true,
    id: found.id,
    url: found.url,
    urlMatches: found.url === url,
    enabled: found.enabled,
    interrupted: found.interrupted,
    penalizedRequests: found.penalizedRequestsCount,
    hasAuthToken: found.hasAuthToken,
    missingEvents: SUBACCOUNT_WEBHOOK_EVENTS.filter((e) => !found.events.includes(e)),
  };
}

/** Como está o webhook da subconta no Asaas (leitura). */
export async function subaccountWebhookHealth(userId: string, deps: AsaasDeps): Promise<WebhookHealth> {
  return withAsaasAudit({ userId }, async () => {
    const { apiKey } = await requireSubaccount(userId, deps);
    const desired = subaccountWebhook();
    return health(pick(await listWebhooks(deps.client, apiKey), desired.url), desired.url);
  });
}

/**
 * Grava a configuração atual (URL, eventos e token) no webhook da subconta, ou
 * cria se não houver. `reactivate` também religa a fila interrompida: o Asaas
 * reenvia os eventos parados, que o PRX processa sem duplicar (idempotência).
 */
export async function syncSubaccountWebhook(userId: string, deps: AsaasDeps, reactivate: boolean): Promise<WebhookHealth> {
  return withAsaasAudit({ userId }, async () => {
    const { sub, apiKey } = await requireSubaccount(userId, deps);
    const desired = subaccountWebhook();
    try {
      const current = pick(await listWebhooks(deps.client, apiKey), desired.url);
      const saved = current ? await updateWebhook(deps.client, apiKey, current.id, desired, reactivate) : await createWebhook(deps.client, apiKey, desired);
      const result = health(saved, desired.url);
      await logProvisioning(deps, {
        userId,
        step: "webhooks",
        outcome: "sent",
        asaasAccountId: sub.asaasAccountId,
        detail: `${current ? "Webhook atualizado" : "Webhook criado"} (URL, ${desired.events.length} eventos e token atual)${reactivate ? "; fila reativada" : ""}.`,
      });
      return result;
    } catch (err) {
      await logProvisioning(deps, { userId, step: "webhooks", outcome: "failed", asaasAccountId: sub.asaasAccountId, detail: describeError(err) });
      throw err;
    }
  });
}

export interface WebhookSyncReport {
  checked: number;
  updated: number;
  skipped: number;
  errors: string[];
}

/** Corrige o webhook de todas as subcontas deste ambiente que têm chave guardada. */
export async function syncAllSubaccountWebhooks(deps: AsaasDeps, reactivate: boolean, limit = 50): Promise<WebhookSyncReport> {
  const subs = await deps.store.listSubaccounts(deps.client.environment, limit);
  const report: WebhookSyncReport = { checked: subs.length, updated: 0, skipped: 0, errors: [] };
  for (const sub of subs) {
    if (!sub.asaasAccountId || !sub.apiKeySealed) {
      report.skipped += 1;
      continue;
    }
    try {
      await syncSubaccountWebhook(sub.userId, deps, reactivate);
      report.updated += 1;
    } catch (err) {
      report.errors.push(`${sub.userId}: ${errorMessage(err, "falha")}`);
    }
  }
  return report;
}
