// Hello World
import { isUuid } from "@/lib/partners/catalog";
import { processPartnerPixTransfer } from "@/lib/points/service";
import { parsePixPayload } from "@/lib/prx/pix";
import type { AsaasDeps } from "@/lib/bank/asaas/deps";
import { bankMessage, type BankNoticeKind } from "@/lib/bank/asaas/messages";
import type { OutgoingRequest, OutgoingStatus, Subaccount } from "@/lib/bank/asaas/types";
import type { AsaasEvent, WebhookOutcome } from "@/lib/bank/asaas/webhooks";

/**
 * Resultado das saídas no Asaas: TRANSFER_* (Pix por chave e por QR Code) e
 * BILL_* (contas). Concluída vira lançamento no extrato (idempotente pelo id do
 * Asaas) e aviso; falha marca o pedido e avisa que o saldo voltou.
 */

const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const E2E = /^E[0-9A-Za-z]{31}$/;

/** Pedido da PRX ligado ao evento: pelo externalReference (id do pedido) ou pelo id do Asaas. */
async function findRequest(object: Record<string, unknown>, sub: Subaccount, deps: AsaasDeps): Promise<OutgoingRequest | null> {
  const ref = str(object.externalReference);
  const byRef = ref && isUuid(ref) ? await deps.store.getOutgoing(ref) : null;
  const found = byRef ?? (str(object.id) ? await deps.store.findOutgoingByProviderRef(str(object.id)!) : null);
  return found && found.userId === sub.userId ? found : null;
}

const OPEN: readonly OutgoingStatus[] = ["requested", "approved"];

/** Um aviso por desfecho de cada operação (o mesmo desfecho pode chegar pelo webhook e pela conciliação). */
async function notify(sub: Subaccount, event: AsaasEvent, objectId: string, kind: BankNoticeKind, amount: number, counterparty: string | null, deps: AsaasDeps) {
  await deps.store.insertNotification({ userId: sub.userId, eventType: event.event, ...bankMessage(kind, { amount, counterparty }), amount, eventId: `${event.event}:${objectId}` });
}

/** Pix concluído para um parceiro PRX rende coins e XP e entra no nicho certo do PRX Map. */
async function rewardPartnerPix(sub: Subaccount, request: OutgoingRequest, providerRef: string, e2e: string | null, deps: AsaasDeps) {
  if (!e2e || !E2E.test(e2e)) return;
  const key = request.kind === "pix_key" ? request.target : (parsePixPayload(request.target)?.key ?? "");
  if (!key) return;
  try {
    const result = await processPartnerPixTransfer(sub.userId, { endToEndId: e2e, key, recipientName: request.counterparty, amount: request.amount, source: "baas_webhook" });
    if (result) await deps.mirror.categorizeTransaction(providerRef, { categoryId: result.purchase.categoryId, partnerId: result.purchase.partnerId, counterparty: result.purchase.partnerName });
  } catch (err) {
    console.warn("[bank] recompensa do Pix em parceiro não registrada:", err instanceof Error ? err.message : err);
  }
}

async function handleTransfer(event: AsaasEvent, sub: Subaccount, deps: AsaasDeps): Promise<WebhookOutcome> {
  const transfer = event.transfer ?? {};
  const id = str(transfer.id);
  const value = num(transfer.value);
  if (!id || value === null) return "ignored";
  const request = await findRequest(transfer, sub, deps);
  const counterparty = request?.counterparty ?? "Transferência";

  if (event.event === "TRANSFER_DONE") {
    // CPF/CNPJ do recebedor (transfer.bankAccount.cpfCnpj): base dos comportamentos verificáveis.
    const bankAccount = (transfer.bankAccount ?? {}) as Record<string, unknown>;
    const document = (str(bankAccount.cpfCnpj) ?? "").replace(/\D/g, "");
    const counterpartyDocument = document.length === 11 || document.length === 14 ? document : undefined;
    if (request) await deps.store.transitionOutgoing(request.id, OPEN, "done", { providerRef: request.providerRef ?? id, outcomeUnknown: false, counterpartyDocument });
    await deps.mirror.upsertTransaction(sub.userId, {
      kind: "pix_out",
      direction: "out",
      amount: value,
      counterparty,
      description: request?.description || "Pix enviado",
      providerRef: id,
      createdAt: deps.now().toISOString(),
    });
    await notify(sub, event, id, "pix_sent", value, counterparty, deps);
    if (request) await rewardPartnerPix(sub, request, id, str(transfer.endToEndIdentifier), deps);
    return "processed";
  }
  if (event.event === "TRANSFER_FAILED" || event.event === "TRANSFER_CANCELLED") {
    const reason = str(transfer.failReason) ?? (event.event === "TRANSFER_CANCELLED" ? "Cancelada pelo PRX BANK." : "Falha na transferência.");
    if (request) await deps.store.transitionOutgoing(request.id, ["awaiting_confirmation", ...OPEN], event.event === "TRANSFER_FAILED" ? "failed" : "cancelled", { failReason: reason, outcomeUnknown: false });
    await deps.mirror.reverseTransaction(id);
    await notify(sub, event, id, "transfer_failed", value, counterparty, deps);
    return "processed";
  }
  return "ignored";
}

async function handleBill(event: AsaasEvent, sub: Subaccount, deps: AsaasDeps): Promise<WebhookOutcome> {
  const bill = event.bill ?? {};
  const id = str(bill.id);
  const value = num(bill.value);
  if (!id || value === null) return "ignored";
  const request = await findRequest(bill, sub, deps);

  if (event.event === "BILL_PAID") {
    if (request) await deps.store.transitionOutgoing(request.id, OPEN, "done", { providerRef: request.providerRef ?? id, outcomeUnknown: false });
    await deps.mirror.upsertTransaction(sub.userId, {
      kind: "bill",
      direction: "out",
      amount: value,
      counterparty: request?.counterparty ?? "Conta",
      description: request?.description || "Pagamento de conta",
      providerRef: id,
      createdAt: deps.now().toISOString(),
    });
    await notify(sub, event, id, "bill_paid", value, null, deps);
    return "processed";
  }
  if (event.event === "BILL_FAILED" || event.event === "BILL_CANCELLED" || event.event === "BILL_REFUNDED") {
    const reasons = Array.isArray(bill.failReasons) ? bill.failReasons.filter((r): r is string => typeof r === "string").join(" ") : bill.failReasons;
    const reason = str(reasons) ?? "Pagamento não concluído.";
    if (request) await deps.store.transitionOutgoing(request.id, ["awaiting_confirmation", ...OPEN, "done"], event.event === "BILL_CANCELLED" ? "cancelled" : "failed", { failReason: reason, outcomeUnknown: false });
    await deps.mirror.reverseTransaction(id);
    await notify(sub, event, id, "bill_failed", value, null, deps);
    return "processed";
  }
  return "ignored";
}

export async function handleOutgoingEvent(event: AsaasEvent, sub: Subaccount, deps: AsaasDeps): Promise<WebhookOutcome> {
  if (event.event.startsWith("TRANSFER_")) return handleTransfer(event, sub, deps);
  if (event.event.startsWith("BILL_")) return handleBill(event, sub, deps);
  return "ignored";
}
