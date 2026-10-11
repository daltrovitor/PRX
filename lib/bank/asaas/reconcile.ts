// Hello World
import { withAsaasAudit } from "@/lib/asaas/audit";
import { decryptSecret } from "@/lib/asaas/secrets";
import { errorMessage } from "@/lib/errors";
import type { AsaasDeps } from "@/lib/bank/asaas/deps";
import { applyStatusUpdate, fetchStatusSnapshot } from "@/lib/bank/asaas/account-status";
import { ensureDefaultPixKey } from "@/lib/bank/asaas/cash-in";
import { syncOnboardingDocuments } from "@/lib/bank/asaas/documents";
import { reconcileOutgoing, type OutgoingReconcileReport } from "@/lib/bank/asaas/outgoing-reconcile";
import { logProvisioning } from "@/lib/bank/asaas/provisioning-log";
import { adoptExistingSubaccount } from "@/lib/bank/asaas/recovery";
import type { Subaccount } from "@/lib/bank/asaas/types";
import { reprocessPendingWebhooks, type WebhookRetryReport } from "@/lib/bank/asaas/webhooks";

/**
 * Conciliação do PRX BANK com o Asaas, para quando um aviso se perde: reprocessa
 * eventos gravados e não concluídos, confere a situação das subcontas em análise
 * (GET /myAccount/status), envia documentos que ficaram para trás, religa
 * aberturas travadas (procura pelo CPF, nunca cria) e confere saídas sem
 * desfecho. Roda no cron diário e pelo botão do admin. Só consultas e envios
 * idempotentes: nada de dinheiro sai daqui.
 */

export interface AccountReconcileReport {
  checked: number;
  /** Situação consultada no Asaas e aplicada. */
  refreshed: number;
  activated: number;
  documentsSent: number;
  /** Abertura travada religada a uma subconta achada pelo CPF. */
  recovered: number;
  /** Abertura travada sem conta no Asaas: trava liberada para o membro tentar de novo. */
  released: number;
  /** Subconta sem chave guardada: precisa do admin (gerar chave). */
  needsKey: string[];
  errors: string[];
}

export interface ReconcileReport {
  webhooks: WebhookRetryReport;
  accounts: AccountReconcileReport;
  outgoing: OutgoingReconcileReport;
}

const STUCK_AFTER_MS = 2 * 60_000;

async function reconcileOne(sub: Subaccount, report: AccountReconcileReport, deps: AsaasDeps): Promise<void> {
  if (!sub.asaasAccountId) {
    const stuck = sub.provisioningStartedAt && deps.now().getTime() - Date.parse(sub.provisioningStartedAt) > STUCK_AFTER_MS;
    if (!stuck) return;
    const app = await deps.latestKyc(sub.userId);
    if (app && (await adoptExistingSubaccount(sub.userId, app.cpf, deps))) {
      report.recovered += 1;
      return;
    }
    await deps.store.releaseSubaccount(sub.userId);
    await logProvisioning(deps, { userId: sub.userId, step: "account", outcome: "blocked", asaasAccountId: null, detail: "Abertura travada sem subconta no Asaas (conferido pelo CPF): trava liberada para o membro tentar de novo." });
    report.released += 1;
    return;
  }
  if (!sub.apiKeySealed) {
    report.needsKey.push(sub.userId);
    return;
  }
  const snapshot = await fetchStatusSnapshot(decryptSecret(sub.apiKeySealed), deps);
  const { sub: saved } = await applyStatusUpdate(sub, { snapshot, at: deps.now() }, deps);
  report.refreshed += 1;
  if (saved.status === "active") {
    report.activated += 1;
    await ensureDefaultPixKey(sub.userId, deps);
    return;
  }
  // Documentação ainda não enviada (ou recusada): manda o que o PRX tem e avisa o membro do resto.
  if (saved.documentationStatus !== "APPROVED" && saved.documentationStatus !== "AWAITING_APPROVAL") {
    const docs = await syncOnboardingDocuments(sub.userId, deps);
    if (docs.state === "done") report.documentsSent += docs.sent;
  }
}

export async function reconcileAccounts(deps: AsaasDeps, limit = 25): Promise<AccountReconcileReport> {
  const subs = await deps.store.listSubaccountsToReconcile(deps.client.environment, limit);
  const report: AccountReconcileReport = { checked: subs.length, refreshed: 0, activated: 0, documentsSent: 0, recovered: 0, released: 0, needsKey: [], errors: [] };
  for (const sub of subs) {
    try {
      await withAsaasAudit({ userId: sub.userId, asaasAccountId: sub.asaasAccountId }, () => reconcileOne(sub, report, deps));
    } catch (err) {
      report.errors.push(`${sub.userId}: ${errorMessage(err, "falha na consulta")}`);
    }
  }
  return report;
}

export async function reconcileBank(deps: AsaasDeps, options: { limit?: number } = {}): Promise<ReconcileReport> {
  const webhooks = await reprocessPendingWebhooks(deps);
  const accounts = await reconcileAccounts(deps, options.limit ?? 25);
  const outgoing = await reconcileOutgoing(deps, { limit: options.limit ?? 25 });
  console.info("[prx-bank:conciliacao]", JSON.stringify({ webhooks, accounts: { ...accounts, needsKey: accounts.needsKey.length }, outgoing: { ...outgoing, unknown: outgoing.unknown.length } }));
  return { webhooks, accounts, outgoing };
}
