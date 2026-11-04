// Hello World
import type { PaymentGateway } from "@/lib/billing/gateway";
import { tableReady } from "@/lib/db-features";
import { applySubscriptionPayment, applySubscriptionRemoved } from "@/lib/subscriptions/payments";

/**
 * Eventos da conta principal do provedor de pagamentos (cobranças da PRX), que chegam pelo
 * webhook do provedor (a rota é criada ao ligar o provedor) e já foram gravados
 * em bank_webhooks_log (idempotência). Assinaturas pelo id da assinatura no
 * provedor ou pela referência "sub:<id>"; pedidos de ingresso por "ord:<id>".
 */

type Outcome = "processed" | "ignored";
type OrderHandler = (payment: Record<string, unknown>, gateway: PaymentGateway | null) => Promise<"processed" | null>;

let orderHandler: OrderHandler | null = null;
/** O checkout de ingressos registra aqui o tratamento dos pagamentos "ord:" (evita import circular). */
export function registerOrderPaymentHandler(handler: OrderHandler): void {
  orderHandler = handler;
}

export async function dispatchBillingEvent(
  event: { event: string; payment?: Record<string, unknown> | null; subscription?: Record<string, unknown> | null },
  gateway: PaymentGateway | null
): Promise<Outcome> {
  if (event.event.startsWith("PAYMENT_") && event.payment) {
    const reference = typeof event.payment.externalReference === "string" ? event.payment.externalReference : "";
    if (reference.startsWith("ord:")) {
      // O módulo do checkout se registra ao carregar (sem import circular).
      if (!orderHandler) await import("@/lib/checkout/payments");
      if (!(await tableReady("live_orders"))) return "ignored";
      return (await orderHandler?.(event.payment, gateway)) ?? "ignored";
    }
    if (!(await tableReady("member_subscriptions"))) return "ignored";
    return (await applySubscriptionPayment(event.payment, gateway)) ?? "ignored";
  }
  if ((event.event === "SUBSCRIPTION_DELETED" || event.event === "SUBSCRIPTION_INACTIVATED") && event.subscription) {
    if (!(await tableReady("member_subscriptions"))) return "ignored";
    return (await applySubscriptionRemoved(event.subscription)) ?? "ignored";
  }
  return "ignored";
}
