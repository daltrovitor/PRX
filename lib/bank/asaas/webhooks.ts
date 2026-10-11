// Hello World
import { z } from "zod";
import { errorMessage } from "@/lib/errors";
import { withAsaasAudit } from "@/lib/asaas/audit";
import { listDocuments } from "@/lib/asaas/accounts";
import { decryptSecret } from "@/lib/asaas/secrets";
import type { AsaasDeps } from "@/lib/bank/asaas/deps";
import { applyStatusUpdate, eventInstant, fetchStatusSnapshot, parseSnapshot, snapshotFromEvent, type StatusSnapshot } from "@/lib/bank/asaas/account-status";
import { ensureDefaultPixKey, handlePaymentEvent } from "@/lib/bank/asaas/cash-in";
import { handleOutgoingEvent } from "@/lib/bank/asaas/outgoing-events";
import type { CommercialInfoAlert, Subaccount } from "@/lib/bank/asaas/types";

/**
 * Eventos do Asaas (POST /api/bank/webhooks/asaas). Cada evento é gravado em
 * bank_webhooks_log antes de qualquer efeito (docs: receba-eventos-do-asaas):
 * repetido e já processado volta sem efeito; se o processamento falhar, o
 * evento fica gravado com o erro, o Asaas recebe 200 (a fila sequencial não
 * para) e a conciliação reprocessa. Só uma falha ao gravar responde erro, para
 * o Asaas tentar de novo. Os efeitos são idempotentes (provider_ref único).
 */

const looseObject = z.record(z.string(), z.unknown());

export const asaasEventSchema = z.object({
  id: z.string().trim().min(1).max(200),
  event: z.string().trim().min(1).max(80),
  dateCreated: z.string().optional(),
  account: z.object({ id: z.string().nullish(), ownerId: z.string().nullish() }).nullish(),
  payment: looseObject.nullish(),
  transfer: looseObject.nullish(),
  bill: looseObject.nullish(),
  accountStatus: looseObject.nullish(),
});
export type AsaasEvent = z.output<typeof asaasEventSchema>;

/** stale: situação mais antiga que a já aplicada; failed: gravado, processamento adiado. */
export type WebhookOutcome = "processed" | "duplicate" | "ignored" | "stale" | "failed";

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

const definedOnly = (snapshot: StatusSnapshot): Partial<StatusSnapshot> => Object.fromEntries(Object.entries(snapshot).filter(([, v]) => v !== null));

/** Motivo de recusa: o evento não traz; a lista de documentos do Asaas traz (rejectReasons). */
async function rejectReason(event: AsaasEvent, sub: Subaccount, deps: AsaasDeps): Promise<string | null> {
  const inline = text(event.accountStatus?.rejectReason) ?? text(event.accountStatus?.observations);
  if (inline || !sub.apiKeySealed) return inline;
  return (await listDocuments(deps.client, decryptSecret(sub.apiKeySealed)).catch(() => null))?.rejectReasons ?? null;
}

const COMMERCIAL_ALERT: Record<string, CommercialInfoAlert | null> = {
  ACCOUNT_STATUS_COMMERCIAL_INFO_EXPIRING_SOON: "EXPIRING_SOON",
  ACCOUNT_STATUS_COMMERCIAL_INFO_EXPIRED: "EXPIRED",
  ACCOUNT_STATUS_COMMERCIAL_INFO_APPROVED: null,
};

async function handleAccountStatus(event: AsaasEvent, sub: Subaccount, deps: AsaasDeps): Promise<WebhookOutcome> {
  const at = eventInstant(event.dateCreated) ?? deps.now();
  // O objeto accountStatus traz as quatro dimensões; sem ele, vale a dimensão do nome do evento.
  let snapshot: Partial<StatusSnapshot> = { ...snapshotFromEvent(event.event), ...definedOnly(parseSnapshot(event.accountStatus)) };
  const alert = event.event in COMMERCIAL_ALERT ? COMMERCIAL_ALERT[event.event] : undefined;
  if (Object.keys(snapshot).length === 0 && alert === undefined) return "ignored";

  // Liberar dinheiro só com a aprovação conferida no próprio Asaas, não só pelo conteúdo do aviso.
  if (snapshot.general === "APPROVED" && sub.status !== "active" && sub.apiKeySealed) {
    snapshot = await fetchStatusSnapshot(decryptSecret(sub.apiKeySealed), deps);
  }
  const rejected = snapshot.general === "REJECTED" || snapshot.documentation === "REJECTED";
  const reason = rejected ? await rejectReason(event, sub, deps) : null;
  const { sub: saved, stale } = await applyStatusUpdate(sub, { snapshot, at, reason, ...(alert !== undefined ? { commercialInfoAlert: alert } : {}) }, deps);
  if (stale) return "stale";
  // Conta nova já nasce com uma chave aleatória para receber Pix.
  if (saved.status === "active" && sub.status !== "active") await ensureDefaultPixKey(sub.userId, deps);
  return "processed";
}

type EventHandler = (event: AsaasEvent, sub: Subaccount, deps: AsaasDeps) => Promise<WebhookOutcome>;

/** Manipuladores por família de evento. */
const handlers: ReadonlyArray<{ match: (event: string) => boolean; handle: EventHandler }> = [
  { match: (e) => e.startsWith("ACCOUNT_STATUS_"), handle: handleAccountStatus },
  { match: (e) => e.startsWith("PAYMENT_"), handle: handlePaymentEvent },
  { match: (e) => e.startsWith("TRANSFER_") || e.startsWith("BILL_"), handle: handleOutgoingEvent },
];

async function dispatch(event: AsaasEvent, deps: AsaasDeps): Promise<WebhookOutcome> {
  const accountId = event.account?.id ?? null;
  // Eventos da conta mãe (ou de contas que o PRX não conhece) não mexem em correntista nenhum.
  const sub = accountId ? await deps.store.findSubaccountByAsaasId(accountId) : null;
  if (!sub) return "ignored";
  const handler = handlers.find((h) => h.match(event.event));
  if (!handler) return "ignored";
  return withAsaasAudit({ userId: sub.userId, asaasAccountId: accountId, businessRef: event.id }, () => handler.handle(event, sub, deps));
}

/** Processa um evento já gravado. Falha fica registrada (com tentativas) para a conciliação. */
async function processRecorded(event: AsaasEvent, deps: AsaasDeps): Promise<WebhookOutcome> {
  try {
    const outcome = await dispatch(event, deps);
    await deps.store.finishWebhook(event.id, null);
    return outcome;
  } catch (err) {
    console.error("[asaas] evento gravado, processamento adiado:", event.event, event.id, errorMessage(err));
    // Se nem o erro puder ser gravado, a exceção sobe e o Asaas tenta de novo (o evento já está no log).
    await deps.store.finishWebhook(event.id, errorMessage(err, "falha ao processar"));
    return "failed";
  }
}

export async function handleAsaasEvent(event: AsaasEvent, deps: AsaasDeps): Promise<WebhookOutcome> {
  const recorded = await deps.store.recordWebhook({ eventId: event.id, eventType: event.event, asaasAccountId: event.account?.id ?? null, payload: event });
  if (recorded === "duplicate") return "duplicate";
  return processRecorded(event, deps);
}

export interface WebhookRetryReport {
  checked: number;
  processed: number;
  failed: number;
  invalid: number;
}

/** Reprocessa eventos gravados e não concluídos (falha anterior ou processo interrompido). */
export async function reprocessPendingWebhooks(deps: AsaasDeps, options: { olderThanMs?: number; maxAttempts?: number; limit?: number } = {}): Promise<WebhookRetryReport> {
  const before = new Date(deps.now().getTime() - (options.olderThanMs ?? 60_000)).toISOString();
  const pending = await deps.store.listPendingWebhooks(before, options.maxAttempts ?? 8, options.limit ?? 50);
  const report: WebhookRetryReport = { checked: pending.length, processed: 0, failed: 0, invalid: 0 };
  for (const item of pending) {
    const parsed = asaasEventSchema.safeParse(item.payload);
    if (!parsed.success) {
      await deps.store.finishWebhook(item.eventId, "payload fora do formato esperado");
      report.invalid += 1;
      continue;
    }
    if ((await processRecorded(parsed.data, deps)) === "failed") report.failed += 1;
    else report.processed += 1;
  }
  return report;
}
