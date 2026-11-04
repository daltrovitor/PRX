// Hello World
import { z } from "zod";
import { BILLING_TYPES, CYCLES, type BillingType, type Cycle } from "@/lib/billing/gateway";

/**
 * Assinaturas da PRX: planos criados no admin e a assinatura de cada membro,
 * cobrada pela conta principal do provedor de pagamentos. A assinatura só fica "ativa" quando o
 * provedor confirma o pagamento (webhook); o retorno visual da fatura não conta.
 */

export const SUBSCRIPTIONS_MIGRATION = "20261016_prx_subscriptions.sql";

export const PLAN_STATUSES = ["draft", "active", "inactive"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];
export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = { draft: "Rascunho", active: "À venda", inactive: "Fora de venda" };

export const CANCELLATION_POLICIES = ["end_of_period", "immediate"] as const;
export type CancellationPolicy = (typeof CANCELLATION_POLICIES)[number];
export const CANCELLATION_LABEL: Record<CancellationPolicy, string> = {
  end_of_period: "Cancela as próximas cobranças; os benefícios valem até o fim do período pago",
  immediate: "Cancela na hora, junto com os benefícios",
};

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  cycle: Cycle;
  benefits: string[];
  paymentMethods: BillingType[];
  minAge: number | null;
  maxAge: number | null;
  requiresActiveBank: boolean;
  foundersOnly: boolean;
  saleStartsAt: string | null;
  saleEndsAt: string | null;
  trialDays: number;
  introDiscountPercent: number;
  introCycles: number;
  cancellationPolicy: CancellationPolicy;
  cancellationTerms: string;
  status: PlanStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export const SUBSCRIPTION_STATUSES = ["pending_payment", "trialing", "active", "past_due", "cancelled", "expired"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export const SUBSCRIPTION_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  pending_payment: "Aguardando pagamento",
  trialing: "Em teste grátis",
  active: "Ativa",
  past_due: "Pagamento em atraso",
  cancelled: "Cancelada",
  expired: "Encerrada",
};
/** Assinaturas que ainda bloqueiam uma nova do mesmo plano. */
export const LIVE_STATUSES: readonly SubscriptionStatus[] = ["pending_payment", "trialing", "active", "past_due"];

export interface MemberSubscription {
  id: string;
  userId: string;
  planId: string;
  planName: string;
  price: number;
  cycle: Cycle;
  billingType: BillingType;
  status: SubscriptionStatus;
  environment: "sandbox" | "production";
  gatewaySubscriptionId: string | null;
  currentPeriodEnd: string | null;
  nextDueDate: string | null;
  trialEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  cancelledAt: string | null;
  cancelReason: string;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionPayment {
  id: string;
  subscriptionId: string;
  gatewayPaymentId: string;
  value: number;
  dueDate: string;
  status: string;
  billingType: string | null;
  invoiceUrl: string | null;
  paidAt: string | null;
}

export interface SubscriptionEvent {
  id: string;
  subscriptionId: string;
  userId: string;
  actor: string;
  action: string;
  detail: string;
  createdAt: string;
}

/** Benefícios valem: ativa, em teste dentro do prazo, ou cancelada com período pago ainda correndo. */
export function subscriptionGrantsAccess(s: Pick<MemberSubscription, "status" | "trialEndsAt" | "currentPeriodEnd">, now = new Date()): boolean {
  if (s.status === "active") return !s.currentPeriodEnd || Date.parse(s.currentPeriodEnd) > now.getTime();
  if (s.status === "trialing") return Boolean(s.trialEndsAt && Date.parse(s.trialEndsAt) > now.getTime());
  if (s.status === "cancelled") return Boolean(s.currentPeriodEnd && Date.parse(s.currentPeriodEnd) > now.getTime());
  return false;
}

const iso = z.union([z.null(), z.string().trim().refine((v) => !Number.isNaN(Date.parse(v)), "Data inválida.")]).default(null);
const age = z.union([z.null(), z.coerce.number().int().min(12).max(120)]).default(null);

export const planInputSchema = z
  .object({
    name: z.string().trim().min(2, "Dê um nome ao plano.").max(80),
    description: z.string().trim().max(1000).default(""),
    // O provedor não cobra menos de R$ 5,00.
    price: z.coerce.number().min(5, "O preço mínimo é R$ 5,00.").max(100_000),
    cycle: z.enum(CYCLES),
    benefits: z
      .array(z.string().trim().max(160))
      .max(20)
      .default([])
      .transform((l) => l.filter(Boolean)),
    paymentMethods: z.array(z.enum(BILLING_TYPES)).min(1, "Escolha ao menos uma forma de pagamento.").default(["PIX", "CREDIT_CARD"]),
    minAge: age,
    maxAge: age,
    requiresActiveBank: z.boolean().default(false),
    foundersOnly: z.boolean().default(false),
    saleStartsAt: iso,
    saleEndsAt: iso,
    trialDays: z.coerce.number().int().min(0).max(90).default(0),
    introDiscountPercent: z.coerce.number().int().min(0).max(90).default(0),
    introCycles: z.coerce.number().int().min(0).max(24).default(0),
    cancellationPolicy: z.enum(CANCELLATION_POLICIES).default("end_of_period"),
    cancellationTerms: z.string().trim().max(2000).default(""),
    status: z.enum(PLAN_STATUSES).default("draft"),
    sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  })
  .refine((p) => p.minAge === null || p.maxAge === null || p.maxAge >= p.minAge, { path: ["maxAge"], message: "A idade máxima precisa ser maior que a mínima." })
  .refine((p) => !p.saleStartsAt || !p.saleEndsAt || Date.parse(p.saleEndsAt) > Date.parse(p.saleStartsAt), { path: ["saleEndsAt"], message: "O fim da venda precisa ser depois do início." })
  .refine((p) => (p.introDiscountPercent > 0) === (p.introCycles > 0), { path: ["introCycles"], message: "Desconto de entrada precisa do número de cobranças com desconto (e vice-versa)." })
  .refine((p) => p.price * (1 - p.introDiscountPercent / 100) >= 5, { path: ["introDiscountPercent"], message: "Com o desconto, a cobrança ficaria abaixo de R$ 5,00." });
export type PlanInput = z.output<typeof planInputSchema>;

export const subscribeSchema = z.object({ planId: z.string().trim().min(1).max(80), billingType: z.enum(BILLING_TYPES) });
