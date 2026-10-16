// Hello World
import { z } from "zod";
import type { AsaasClient } from "@/lib/asaas/client";

/**
 * Cobranças da PRX na conta principal do Asaas (assinaturas e ingressos):
 * cliente, assinatura, cobrança avulsa e QR Code Pix. O cartão é sempre pago
 * na fatura do próprio Asaas (invoiceUrl): o número do cartão nunca passa pela
 * PRX. Formas aceitas na criação (referência "Criar nova cobrança"): PIX,
 * BOLETO, CREDIT_CARD e UNDEFINED. Cartão de débito não pode ser pedido pela
 * API (só aparece como forma usada na resposta), então a PRX não o oferece.
 */

export const BILLING_TYPES = ["PIX", "CREDIT_CARD", "BOLETO"] as const;
export type BillingType = (typeof BILLING_TYPES)[number];
export const BILLING_TYPE_LABEL: Record<BillingType, string> = { PIX: "Pix", CREDIT_CARD: "Cartão de crédito", BOLETO: "Boleto" };

export const CYCLES = ["WEEKLY", "MONTHLY", "QUARTERLY", "SEMIANNUALLY", "YEARLY"] as const;
export type Cycle = (typeof CYCLES)[number];
export const CYCLE_LABEL: Record<Cycle, string> = { WEEKLY: "semanal", MONTHLY: "mensal", QUARTERLY: "trimestral", SEMIANNUALLY: "semestral", YEARLY: "anual" };

const text = z
  .string()
  .nullish()
  .transform((v) => v ?? null);
const idObject = z.object({ id: z.string().min(1) });

export function findCustomerByReference(client: AsaasClient, externalReference: string): Promise<string | null> {
  return client
    .get("/customers", { query: { externalReference, limit: 1 } }, z.object({ data: z.array(idObject).default([]) }))
    .then((res) => res.data[0]?.id ?? null);
}

export function createBillingCustomer(client: AsaasClient, input: { name: string; cpfCnpj: string; email: string; mobilePhone: string | null; externalReference: string }): Promise<{ id: string }> {
  return client.post("/customers", { ...input, mobilePhone: input.mobilePhone ?? undefined, notificationDisabled: false }, {}, idObject);
}

const subscriptionSchema = z.object({
  id: z.string().min(1),
  status: z.string(),
  nextDueDate: text,
  value: z.number(),
  cycle: text,
  billingType: text,
  deleted: z
    .boolean()
    .nullish()
    .transform((v) => v ?? false),
});
export type AsaasSubscription = z.output<typeof subscriptionSchema>;

export interface NewSubscription {
  customer: string;
  billingType: BillingType;
  value: number;
  nextDueDate: string;
  cycle: Cycle;
  description: string;
  externalReference: string;
  /** Desconto de entrada nas primeiras cobranças (o Asaas aplica até o vencimento). */
  discount?: { value: number; type: "PERCENTAGE"; dueDateLimitDays: number };
}

export function createSubscription(client: AsaasClient, input: NewSubscription): Promise<AsaasSubscription> {
  return client.post("/subscriptions", input, {}, subscriptionSchema);
}

export function getSubscription(client: AsaasClient, id: string): Promise<AsaasSubscription> {
  return client.get(`/subscriptions/${encodeURIComponent(id)}`, {}, subscriptionSchema);
}

/** Novo valor das próximas cobranças (fim do desconto de entrada), inclusive as já geradas e pendentes. */
export function updateSubscriptionValue(client: AsaasClient, id: string, value: number): Promise<AsaasSubscription> {
  return client.post(`/subscriptions/${encodeURIComponent(id)}`, { value, updatePendingPayments: true }, {}, subscriptionSchema);
}

/** Cancela a assinatura no Asaas: nenhuma cobrança nova é gerada. */
export function deleteSubscription(client: AsaasClient, id: string): Promise<unknown> {
  return client.delete(`/subscriptions/${encodeURIComponent(id)}`);
}

const paymentSchema = z.object({
  id: z.string().min(1),
  status: z.string(),
  value: z.number(),
  dueDate: z.string(),
  billingType: text,
  invoiceUrl: text,
  paymentDate: text,
  clientPaymentDate: text,
  confirmedDate: text,
  subscription: text,
  externalReference: text,
});
export type AsaasPayment = z.output<typeof paymentSchema>;

export function listSubscriptionPayments(client: AsaasClient, subscriptionId: string): Promise<AsaasPayment[]> {
  return client.get(`/subscriptions/${encodeURIComponent(subscriptionId)}/payments`, { query: { limit: 20 } }, z.object({ data: z.array(paymentSchema).default([]) })).then((r) => r.data);
}

export interface NewPayment {
  customer: string;
  billingType: BillingType;
  value: number;
  dueDate: string;
  description: string;
  externalReference: string;
  /** Volta para o app depois de pagar na fatura do Asaas. */
  callback?: { successUrl: string; autoRedirect: boolean };
}

export function createPayment(client: AsaasClient, input: NewPayment): Promise<AsaasPayment> {
  return client.post("/payments", input, {}, paymentSchema);
}

export function getPayment(client: AsaasClient, id: string): Promise<AsaasPayment> {
  return client.get(`/payments/${encodeURIComponent(id)}`, {}, paymentSchema);
}

export function cancelPayment(client: AsaasClient, id: string): Promise<unknown> {
  return client.delete(`/payments/${encodeURIComponent(id)}`);
}

const pixQrSchema = z.object({ encodedImage: z.string(), payload: z.string(), expirationDate: text });
export type PixQr = z.output<typeof pixQrSchema>;

/** QR Code e Pix copia e cola da cobrança (pago uma vez só). */
export function getPaymentPixQr(client: AsaasClient, paymentId: string): Promise<PixQr> {
  return client.get(`/payments/${encodeURIComponent(paymentId)}/pixQrCode`, {}, pixQrSchema);
}

/** Status do Asaas que confirmam o dinheiro (cartão aprovado ou Pix/boleto recebido). */
export const PAID_STATUSES = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);
/** Status que desfazem o pagamento. */
export const REVERSED_STATUSES = new Set(["REFUNDED", "REFUND_REQUESTED", "CHARGEBACK_REQUESTED", "CHARGEBACK_DISPUTE", "AWAITING_CHARGEBACK_REVERSAL"]);

/** Data (AAAA-MM-DD) em Brasília, daqui a `days` dias. */
export function dueDateIn(days: number, now = new Date()): string {
  const local = new Date(now.getTime() - 3 * 3_600_000 + days * 86_400_000);
  return local.toISOString().slice(0, 10);
}

/** Fim do período pago a partir do vencimento e do ciclo. */
export function addCycle(dateIso: string, cycle: Cycle): string {
  const d = new Date(`${dateIso.slice(0, 10)}T12:00:00Z`);
  if (cycle === "WEEKLY") d.setUTCDate(d.getUTCDate() + 7);
  else d.setUTCMonth(d.getUTCMonth() + ({ MONTHLY: 1, QUARTERLY: 3, SEMIANNUALLY: 6, YEARLY: 12 } as const)[cycle]);
  return d.toISOString();
}
