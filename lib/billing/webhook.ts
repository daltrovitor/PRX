// Hello World
import type { AsaasClient } from "@/lib/asaas/client";
import { tableReady } from "@/lib/db-features";
import { applySubscriptionPayment, applySubscriptionRemoved } from "@/lib/subscriptions/payments";

/**
 * Eventos da conta principal do Asaas (cobranças da PRX), que chegam pelo
 * mesmo webhook das subcontas (/api/bank/webhooks/asaas) e já foram gravados
 * em bank_webhooks_log (idempotência). Assinaturas pelo id da assinatura no
 * Asaas ou pela referência "sub:<id>"; pedidos de ingresso por "ord:<id>".
 */

type Outcome = "processed" | "ignored";
type OrderHandler = (payment: Record<string, unknown>, client: AsaasClient | null) => Promise<"processed" | null>;

let orderHandler: OrderHandler | null = null;
/** O checkout de ingressos registra aqui o tratamento dos pagamentos "ord:" (evita import circular). */
export function registerOrderPaymentHandler(handler: OrderHandler): void {
  orderHandler = handler;
}

export async function dispatchBillingEvent(
  event: { event: string; payment?: Record<string, unknown> | null; subscription?: Record<string, unknown> | null },
  client: AsaasClient | null
): Promise<Outcome> {
  if (event.event.startsWith("PAYMENT_") && event.payment) {
    const reference = typeof event.payment.externalReference === "string" ? event.payment.externalReference : "";
    if (reference.startsWith("ord:")) {
      // O módulo do checkout se registra ao carregar (sem import circular).
      if (!orderHandler) await import("@/lib/checkout/payments");
      if (!(await tableReady("live_orders"))) return "ignored";
      return (await orderHandler?.(event.payment, client)) ?? "ignored";
    }
    if (!(await tableReady("member_subscriptions"))) return "ignored";
    return (await applySubscriptionPayment(event.payment, client)) ?? "ignored";
  }
  if ((event.event === "SUBSCRIPTION_DELETED" || event.event === "SUBSCRIPTION_INACTIVATED") && event.subscription) {
    if (!(await tableReady("member_subscriptions"))) return "ignored";
    return (await applySubscriptionRemoved(event.subscription)) ?? "ignored";
  }
  return "ignored";
}
