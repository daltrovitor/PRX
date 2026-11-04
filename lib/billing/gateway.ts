// Hello World

/**
 * Porta de cobrança da PRX (ingressos e assinaturas): tudo o que o domínio
 * precisa de um provedor de pagamentos, sem nenhum detalhe de provedor
 * específico. O checkout (lib/checkout), as assinaturas (lib/subscriptions) e o
 * webhook (lib/billing/webhook.ts) só falam com esta interface.
 *
 * Para ligar um provedor novo:
 *   1. implemente `PaymentGateway` (um adaptador que traduz para a API dele);
 *   2. devolva-o em `getPaymentGateway()`;
 *   3. na rota de webhook dele, normalize o evento para `BillingEvent` (status
 *      no vocabulário abaixo, `externalReference` "ord:<pedido>" / "sub:<id>") e
 *      chame `dispatchBillingEvent`.
 * Enquanto não houver provedor, `getPaymentGateway()` devolve null e as rotas
 * respondem que o pagamento online está indisponível (nada é cobrado).
 *
 * O cartão é sempre pago na fatura do provedor (`invoiceUrl`): o número do
 * cartão nunca passa pela PRX.
 */

export const BILLING_TYPES = ["PIX", "CREDIT_CARD", "BOLETO"] as const;
export type BillingType = (typeof BILLING_TYPES)[number];
export const BILLING_TYPE_LABEL: Record<BillingType, string> = { PIX: "Pix", CREDIT_CARD: "Cartão de crédito", BOLETO: "Boleto" };

export const CYCLES = ["WEEKLY", "MONTHLY", "QUARTERLY", "SEMIANNUALLY", "YEARLY"] as const;
export type Cycle = (typeof CYCLES)[number];
export const CYCLE_LABEL: Record<Cycle, string> = { WEEKLY: "semanal", MONTHLY: "mensal", QUARTERLY: "trimestral", SEMIANNUALLY: "semestral", YEARLY: "anual" };

/** Status normalizados que confirmam o dinheiro (cartão aprovado ou Pix/boleto recebido). */
export const PAID_STATUSES = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);
/** Status normalizados que desfazem o pagamento. */
export const REVERSED_STATUSES = new Set(["REFUNDED", "REFUND_REQUESTED", "CHARGEBACK_REQUESTED", "CHARGEBACK_DISPUTE", "AWAITING_CHARGEBACK_REVERSAL"]);

export interface GatewayPayment {
  id: string;
  status: string;
  value: number;
  dueDate: string;
  billingType: string | null;
  invoiceUrl: string | null;
  paymentDate: string | null;
  clientPaymentDate: string | null;
  confirmedDate: string | null;
  /** Id da assinatura no provedor, quando a cobrança nasceu de uma. */
  subscription: string | null;
  /** "ord:<pedido>" (ingresso) ou "sub:<id>" (assinatura da PRX). */
  externalReference: string | null;
}

export interface GatewaySubscription {
  id: string;
  status: string;
  nextDueDate: string | null;
  value: number;
  cycle: string | null;
  billingType: string | null;
  deleted: boolean;
}

export interface PixQr {
  /** Imagem do QR Code em base64. */
  encodedImage: string;
  /** Pix copia e cola. */
  payload: string;
  expirationDate: string | null;
}

export interface NewCustomer {
  name: string;
  cpfCnpj: string;
  email: string;
  mobilePhone: string | null;
  externalReference: string;
}

export interface NewSubscription {
  customer: string;
  billingType: BillingType;
  value: number;
  nextDueDate: string;
  cycle: Cycle;
  description: string;
  externalReference: string;
  /** Desconto de entrada nas primeiras cobranças (aplicado até o vencimento). */
  discount?: { value: number; type: "PERCENTAGE"; dueDateLimitDays: number };
}

export interface NewPayment {
  customer: string;
  billingType: BillingType;
  value: number;
  dueDate: string;
  description: string;
  externalReference: string;
  /** Volta para o app depois de pagar na fatura do provedor. */
  callback?: { successUrl: string; autoRedirect: boolean };
}

export interface PaymentGateway {
  /** Ambiente do provedor ("sandbox" | "production"): separa os clientes de cobrança guardados. */
  readonly environment: "sandbox" | "production";

  findCustomerByReference(externalReference: string): Promise<string | null>;
  createCustomer(input: NewCustomer): Promise<{ id: string }>;

  createSubscription(input: NewSubscription): Promise<GatewaySubscription>;
  getSubscription(id: string): Promise<GatewaySubscription>;
  /** Novo valor das próximas cobranças (fim do desconto de entrada), inclusive as já geradas e pendentes. */
  updateSubscriptionValue(id: string, value: number): Promise<GatewaySubscription>;
  /** Cancela a assinatura: nenhuma cobrança nova é gerada. */
  deleteSubscription(id: string): Promise<unknown>;
  listSubscriptionPayments(subscriptionId: string): Promise<GatewayPayment[]>;

  createPayment(input: NewPayment): Promise<GatewayPayment>;
  getPayment(id: string): Promise<GatewayPayment>;
  cancelPayment(id: string): Promise<unknown>;
  /** Estorno total de uma cobrança recebida (o status vira estornado pelo webhook). */
  refundPayment(id: string, description: string): Promise<GatewayPayment>;
  /** QR Code e Pix copia e cola da cobrança. */
  getPaymentPixQr(paymentId: string): Promise<PixQr>;
}

/**
 * O provedor de pagamentos deste deploy; null = pagamento online desligado.
 * Ponto de ligação do provedor novo: construa o adaptador aqui a partir do ambiente.
 */
export function getPaymentGateway(): PaymentGateway | null {
  return null;
}

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
