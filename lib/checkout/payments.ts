// Hello World
import { PartnerError } from "@/lib/partners/errors";
import type { AsaasClient } from "@/lib/asaas/client";
import { PAID_STATUSES, REVERSED_STATUSES, cancelPayment, getPayment, refundPayment } from "@/lib/asaas/billing";
import { registerOrderPaymentHandler } from "@/lib/billing/webhook";
import { getLiveRepository } from "@/lib/live/repository";
import { getOrdersRepository, type LiveOrder } from "@/lib/checkout/repository";

/**
 * Pagamentos dos pedidos de ingresso (eventos PAYMENT_* com "ord:<pedido>").
 * Idempotente: a mudança de status do pedido é condicional e o ingresso é o
 * mesmo (nada de ingresso duplicado por webhook repetido ou dois pagamentos).
 *   pago + reserva em aberto       → ingresso válido
 *   pago + reserva já expirada     → "pago, precisa de revisão" (vaga pode ter acabado)
 *   pago + ingresso já pago        → "pago, precisa de revisão" (duplicidade: estornar)
 *   vencido/removido               → pedido expirado
 *   estornado/chargeback           → pedido estornado e ingresso cancelado (se não usado)
 */

const orders = () => getOrdersRepository();
const live = () => getLiveRepository();

async function paid(order: LiveOrder, paymentId: string, client: AsaasClient | null): Promise<void> {
  const ticket = await live().getTicket(order.ticketId);
  const now = new Date().toISOString();
  const guardianOk = !ticket?.guardianConsent || ticket.guardianConsent.status === "approved";
  if (ticket?.status === "pending_payment" && guardianOk) {
    const claimed = await orders().transition(order.id, ["awaiting_payment", "cancelled", "expired"], { status: "paid", paidAt: now, asaasPaymentId: paymentId });
    if (!claimed) return; // outro processo já tratou este pagamento
    await live().updateTicket(order.ticketId, { status: "valid", paidAt: now, note: `Pago (${order.paymentMethod}) · pedido ${order.id.slice(0, 8)}` }, ["pending_payment"]);
    // Outras cobranças em aberto do mesmo ingresso não podem mais ser pagas.
    for (const other of await orders().forTicket(order.ticketId)) {
      if (other.id !== order.id && other.status === "awaiting_payment") {
        await orders().transition(other.id, ["awaiting_payment"], { status: "cancelled", reviewNote: "Ingresso pago por outro pedido." });
        if (other.asaasPaymentId && client) await cancelPayment(client, other.asaasPaymentId).catch(() => undefined);
      }
    }
    return;
  }
  const why = !ticket
    ? "Ingresso não encontrado."
    : !guardianOk
      ? "Pagamento recebido sem a liberação do responsável: confira antes de liberar o ingresso."
      : ticket.status === "cancelled"
        ? "Pagamento chegou depois que a reserva expirou: confirme a vaga ou estorne."
        : "Ingresso já estava pago: possível pagamento em duplicidade, estorne.";
  await orders().transition(order.id, ["awaiting_payment", "cancelled", "expired"], { status: "paid_needs_review", paidAt: now, asaasPaymentId: paymentId, reviewNote: why });
}

export async function applyOrderPayment(payment: Record<string, unknown>, client: AsaasClient | null): Promise<"processed" | null> {
  const reference = typeof payment.externalReference === "string" ? payment.externalReference : "";
  const status = typeof payment.status === "string" ? payment.status : "";
  const paymentId = typeof payment.id === "string" ? payment.id : "";
  if (!reference.startsWith("ord:") || !paymentId) return null;
  const order = await orders().get(reference.slice(4));
  if (!order) return null;
  if (PAID_STATUSES.has(status)) await paid(order, paymentId, client);
  else if (status === "OVERDUE" || status === "DELETED") await orders().transition(order.id, ["awaiting_payment"], { status: "expired", reviewNote: status === "OVERDUE" ? "Cobrança vencida." : "Cobrança removida." });
  else if (REVERSED_STATUSES.has(status)) {
    const refunded = await orders().transition(order.id, ["paid", "paid_needs_review"], { status: "refunded", reviewNote: `Estorno no Asaas (${status}).` });
    if (refunded) await live().updateTicket(order.ticketId, { status: "cancelled", cancelledAt: new Date().toISOString(), note: "Pagamento estornado." }, ["valid", "pending_payment"]);
  }
  return "processed";
}

registerOrderPaymentHandler(applyOrderPayment);

/** Admin: relê a cobrança no Asaas e aplica (webhook perdido). */
export async function syncOrder(orderId: string, client: AsaasClient): Promise<LiveOrder | null> {
  const order = await orders().get(orderId);
  if (!order?.asaasPaymentId) return order;
  const remote = await getPayment(client, order.asaasPaymentId);
  await applyOrderPayment({ id: remote.id, status: remote.status, externalReference: `ord:${order.id}` }, client);
  return orders().get(orderId);
}

/** Admin: libera o ingresso de um pedido pago em revisão (ex.: a vaga ainda existe). */
export async function confirmReviewedOrder(orderId: string, note: string): Promise<LiveOrder> {
  const order = await orders().get(orderId);
  if (!order || order.status !== "paid_needs_review") throw new PartnerError("Só pedidos pagos em revisão podem ser liberados por aqui.", 409);
  const ticket = await live().getTicket(order.ticketId);
  if (ticket?.guardianConsent && ticket.guardianConsent.status !== "approved") throw new PartnerError("O responsável ainda não liberou: o ingresso não pode ser emitido.", 409);
  const updated = await live().updateTicket(order.ticketId, { status: "valid", paidAt: order.paidAt ?? new Date().toISOString(), cancelledAt: null, note: `Liberado pelo admin: ${note}`.slice(0, 300) }, ["pending_payment", "cancelled"]);
  if (!updated) throw new PartnerError("O ingresso já está válido ou foi usado. Se for duplicidade, estorne.", 409);
  return orders().update(order.id, { status: "paid", reviewNote: `Liberado: ${note}`.slice(0, 500) });
}

/** Admin: estorna no Asaas (o webhook marca como estornado e cancela o ingresso). */
export async function refundOrder(orderId: string, reason: string, client: AsaasClient): Promise<LiveOrder> {
  const order = await orders().get(orderId);
  if (!order?.asaasPaymentId || (order.status !== "paid" && order.status !== "paid_needs_review")) throw new PartnerError("Só pedidos pagos podem ser estornados.", 409);
  if (reason.trim().length < 5) throw new PartnerError("Informe o motivo do estorno.", 422);
  await refundPayment(client, order.asaasPaymentId, reason);
  return orders().update(order.id, { reviewNote: `Estorno pedido: ${reason.trim()}` });
}
