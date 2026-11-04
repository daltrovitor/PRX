// Hello World
import { PartnerError } from "@/lib/partners/errors";
import { TechnicalError } from "@/lib/error-messages";
import { dueDateIn, type PaymentGateway, type PixQr } from "@/lib/billing/gateway";
import { ensureBillingCustomer, type Payer } from "@/lib/billing/customers";
import { bankAccountIsActive } from "@/lib/bank/lock";
import { getLiveRepository } from "@/lib/live/repository";
import { getPromoRepository } from "@/lib/live/promo-repository";
import { priceTicket, ticketsWithExpiry } from "@/lib/live/service";
import { eventHasStarted } from "@/lib/live/rules";
import { CHECKOUT_METHODS, CHECKOUT_METHOD_LABEL, type AppliedDiscount, type CheckoutMethod } from "@/lib/live/promo";
import type { LiveEvent, LiveTicket } from "@/lib/live/types";
import { getOrdersRepository, type LiveOrder } from "@/lib/checkout/repository";

/**
 * Checkout de ingressos do PRX LIVE. A reserva já existe (reserveTicket); aqui
 * a pessoa escolhe como pagar e o servidor recalcula o preço para a forma
 * escolhida (descontos por forma de pagamento), cria a cobrança na conta
 * principal do provedor de pagamentos ("ord:<pedido>") e devolve como pagar:
 *   - Pix: QR Code / copia e cola da cobrança;
 *   - Cartão de crédito: fatura do provedor de pagamentos (a PRX nunca vê o cartão);
 *   - Conta PRX BANK: o mesmo Pix, pago pela conta PRX com a confirmação de
 *     sempre (biometria ou senha) em /api/bank/outgoing.
 * O ingresso só fica válido quando o provedor confirma o pagamento (webhook,
 * lib/checkout/payments.ts). Menor de idade só paga depois da liberação do
 * responsável.
 */

const orders = () => getOrdersRepository();
const live = () => getLiveRepository();
/** O provedor não cobra menos que isto. */
export const MIN_ONLINE_CHARGE = 5;

export interface CheckoutOption {
  method: CheckoutMethod;
  label: string;
  available: boolean;
  reason: string | null;
  quote: { original: number; discount: number; total: number; discounts: AppliedDiscount[] } | null;
}

export interface CheckoutState {
  ticket: { id: string; code: string; status: LiveTicket["status"]; eventTitle: string; batchName: string; price: number };
  guardian: { required: boolean; status: "pending" | "approved" | "rejected" | null };
  options: CheckoutOption[];
  order: LiveOrder | null;
}

async function loadTicket(userId: string, ticketId: string): Promise<{ ticket: LiveTicket; event: LiveEvent }> {
  const ticket = await live().getTicket(ticketId);
  if (!ticket || ticket.userId !== userId) throw new PartnerError("Ingresso não encontrado.", 404);
  const event = await live().getEvent(ticket.eventId);
  if (!event) throw new PartnerError("Evento não encontrado.", 404);
  // Reserva vencida libera o lugar (expiração preguiçosa).
  const fresh = (await ticketsWithExpiry(event)).find((t) => t.id === ticket.id) ?? ticket;
  return { ticket: fresh, event };
}

/** O cupom digitado na reserva volta a valer no checkout (sem contar o próprio ingresso como outro uso). */
async function typedCode(ticket: LiveTicket): Promise<string | null> {
  if (!ticket.promoCodeId) return null;
  const promo = await getPromoRepository()
    .get(ticket.promoCodeId)
    .catch(() => null);
  return promo && !promo.automatic ? promo.code : null;
}


function guardianBlock(ticket: LiveTicket): string | null {
  const g = ticket.guardianConsent;
  if (!g) return null;
  if (g.status === "pending") return "Aguardando o seu responsável liberar a compra pelo link enviado por e-mail.";
  if (g.status === "rejected") return "O seu responsável não liberou este ingresso.";
  return null;
}

export async function checkoutState(userId: string, ticketId: string, gateway: PaymentGateway | null): Promise<CheckoutState> {
  const { ticket, event } = await loadTicket(userId, ticketId);
  const batch = event.batches.find((b) => b.id === ticket.batchId);
  const code = await typedCode(ticket);
  const bank = await bankAccountIsActive(userId);
  const blocked = guardianBlock(ticket);
  const options: CheckoutOption[] = [];
  for (const method of CHECKOUT_METHODS) {
    let reason: string | null = null;
    if (!gateway) reason = "Pagamento online indisponível agora.";
    else if (method === "PRX_BANK" && !bank) reason = "Abra e ative a sua conta PRX BANK para pagar por ela.";
    let quote: CheckoutOption["quote"] = null;
    if (batch) {
      const priced = await priceTicket(event, batch, userId, code, false, method, ticket.id).catch(() => priceTicket(event, batch, userId, null, false, method, ticket.id));
      quote = { original: priced.quote.original, discount: priced.quote.discount, total: priced.quote.total, discounts: priced.quote.discounts };
      if (!reason && priced.quote.total > 0 && priced.quote.total < MIN_ONLINE_CHARGE) reason = `Pagamento online a partir de R$ ${MIN_ONLINE_CHARGE},00. Fale com a equipe PRX.`;
    }
    options.push({ method, label: CHECKOUT_METHOD_LABEL[method], available: !reason && !blocked && ticket.status === "pending_payment", reason, quote });
  }
  return {
    ticket: { id: ticket.id, code: ticket.code, status: ticket.status, eventTitle: event.title, batchName: ticket.batchName, price: ticket.price },
    guardian: { required: Boolean(ticket.guardianConsent), status: ticket.guardianConsent?.status ?? null },
    options,
    order: await orders()
      .openForTicket(ticket.id)
      .catch(() => null),
  };
}

export interface CheckoutStart {
  order: LiveOrder;
  /** Pix e conta PRX BANK: código para pagar. */
  pix: PixQr | null;
  /** Cartão: fatura do provedor de pagamentos. */
  invoiceUrl: string | null;
}

/** Cancela no provedor de pagamentos a cobrança de um pedido em aberto (troca de forma de pagamento ou desistência). */
async function cancelOpen(order: LiveOrder, gateway: PaymentGateway | null, why: string): Promise<void> {
  const cancelled = await orders().transition(order.id, ["awaiting_payment"], { status: "cancelled", reviewNote: why });
  if (cancelled?.gatewayPaymentId && gateway) await gateway.cancelPayment(cancelled.gatewayPaymentId).catch(() => undefined);
}

export async function startCheckout(payer: Payer, ticketId: string, method: CheckoutMethod, gateway: PaymentGateway | null, now = new Date()): Promise<CheckoutStart> {
  if (!gateway) throw new PartnerError("Pagamento online indisponível agora.", 503);
  const { ticket, event } = await loadTicket(payer.id, ticketId);
  if (ticket.status !== "pending_payment") throw new PartnerError(ticket.status === "cancelled" ? "Esta reserva expirou. Reserve de novo." : "Este ingresso não está aguardando pagamento.", 409);
  if (eventHasStarted(event)) throw new PartnerError("O evento já começou.", 409);
  const blocked = guardianBlock(ticket);
  if (blocked) throw new PartnerError(blocked, 409);
  if (method === "PRX_BANK" && !(await bankAccountIsActive(payer.id))) throw new PartnerError("Abra e ative a sua conta PRX BANK para pagar por ela.", 409);

  const open = await orders().openForTicket(ticket.id);
  if (open && open.paymentMethod === method && open.gatewayPaymentId) {
    // Mesmo pedido (toque duplo, voltar à tela): devolve a mesma cobrança.
    return { order: open, pix: method === "CREDIT_CARD" ? null : await gateway.getPaymentPixQr(open.gatewayPaymentId).catch(() => null), invoiceUrl: open.invoiceUrl };
  }
  if (open) await cancelOpen(open, gateway, `Trocou para ${CHECKOUT_METHOD_LABEL[method]}.`);

  const batch = event.batches.find((b) => b.id === ticket.batchId);
  if (!batch) throw new PartnerError("Lote não encontrado.", 404);
  const { quote, promo } = await priceTicket(event, batch, payer.id, await typedCode(ticket), false, method, ticket.id);
  if (quote.total <= 0) throw new PartnerError("Este ingresso não tem valor a pagar: a equipe PRX confirma a sua reserva.", 409);
  if (quote.total < MIN_ONLINE_CHARGE) throw new PartnerError(`Pagamento online a partir de R$ ${MIN_ONLINE_CHARGE},00. Fale com a equipe PRX.`, 409);
  // O preço do ingresso passa a ser o desta forma de pagamento.
  await live().updateTicket(ticket.id, { price: quote.total, originalPrice: quote.discount > 0 ? quote.original : null, discount: quote.discount, promoCodeId: promo?.id ?? null }, ["pending_payment"]);

  const customer = await ensureBillingCustomer(payer, gateway);
  const order = await orders().insert({
    userId: payer.id,
    ticketId: ticket.id,
    eventId: event.id,
    paymentMethod: method,
    amountOriginal: quote.original,
    discountTotal: quote.discount,
    amountTotal: quote.total,
    discounts: quote.discounts,
    status: "awaiting_payment",
    environment: gateway.environment,
  });
  let payment;
  try {
    payment = await gateway.createPayment({
      customer,
      billingType: method === "CREDIT_CARD" ? "CREDIT_CARD" : "PIX",
      value: quote.total,
      dueDate: dueDateIn(0, now),
      description: `Ingresso ${event.title} · ${ticket.batchName}`.slice(0, 500),
      externalReference: `ord:${order.id}`,
    });
  } catch (err) {
    await orders().transition(order.id, ["awaiting_payment"], { status: "cancelled", reviewNote: "Cobrança não criada no provedor de pagamentos." });
    throw new TechnicalError(`Checkout no provedor de pagamentos: ${err instanceof Error ? err.message : String(err)}`, 503);
  }
  const saved = await orders().update(order.id, { gatewayPaymentId: payment.id, invoiceUrl: payment.invoiceUrl });
  const pix = method === "CREDIT_CARD" ? null : await gateway.getPaymentPixQr(payment.id).catch(() => null);
  return { order: saved, pix, invoiceUrl: payment.invoiceUrl };
}

/** A pessoa desiste da reserva: cancela também a cobrança em aberto. */
export async function cancelCheckout(userId: string, ticketId: string, gateway: PaymentGateway | null): Promise<void> {
  const open = await orders().openForTicket(ticketId);
  if (open && open.userId === userId) await cancelOpen(open, gateway, "Reserva cancelada pelo membro.");
}
