// Hello World
import { PartnerError } from "@/lib/partners/errors";
import { TechnicalError } from "@/lib/error-messages";
import type { AsaasClient } from "@/lib/asaas/client";
import { CYCLE_LABEL, createSubscription, deleteSubscription, dueDateIn, getPaymentPixQr, listSubscriptionPayments, type BillingType, type PixQr } from "@/lib/asaas/billing";
import { ensureBillingCustomer, type Payer } from "@/lib/billing/customers";
import { ageOn } from "@/lib/family/age";
import { verifiedBirthDate } from "@/lib/bank/access";
import { isActiveFounder } from "@/lib/founders/members";
import { getAsaasBankStore } from "@/lib/bank/asaas/store";
import { getSubscriptionsRepository } from "@/lib/subscriptions/repository";
import { recordPayment } from "@/lib/subscriptions/payments";
import { LIVE_STATUSES, planInputSchema, type MemberSubscription, type SubscriptionPayment, type SubscriptionPlan } from "@/lib/subscriptions/types";

/**
 * Regras das assinaturas. Contratar cria a assinatura no Asaas (conta
 * principal) e devolve a fatura; a assinatura só fica ativa quando o webhook
 * confirma o pagamento (lib/subscriptions/payments.ts). Cancelar para as
 * próximas cobranças no Asaas e segue a política do plano.
 */

const repo = () => getSubscriptionsRepository();
const PAYMENTS_OFF = "Pagamentos indisponíveis neste ambiente.";

export async function savePlan(raw: unknown, actor: string, id?: string): Promise<SubscriptionPlan> {
  const parsed = planInputSchema.safeParse(raw);
  if (!parsed.success) throw new PartnerError(parsed.error.issues[0]?.message ?? "Confira o plano.", 422);
  if (id) {
    const current = await repo().getPlan(id);
    if (!current) throw new PartnerError("Plano não encontrado.", 404);
    // Preço e ciclo de quem já assinou ficam congelados na assinatura; o novo vale para novas contratações.
  }
  return repo().savePlan(parsed.data, actor, id);
}

/** Plano com assinaturas não é apagado (o histórico depende dele): tire de venda. */
export async function deletePlan(id: string): Promise<void> {
  if ((await repo().countSubscriptions(id)) > 0) throw new PartnerError("Este plano já tem assinaturas. Coloque-o fora de venda em vez de excluir.", 409);
  await repo().deletePlan(id);
}

export interface Eligibility {
  eligible: boolean;
  reason: string | null;
}

export function planOnSale(plan: SubscriptionPlan, now = new Date()): boolean {
  if (plan.status !== "active") return false;
  if (plan.saleStartsAt && Date.parse(plan.saleStartsAt) > now.getTime()) return false;
  if (plan.saleEndsAt && Date.parse(plan.saleEndsAt) <= now.getTime()) return false;
  return true;
}

/** Elegibilidade conferida no servidor (a tela só mostra). */
export async function planEligibility(plan: SubscriptionPlan, userId: string, now = new Date()): Promise<Eligibility> {
  if (!planOnSale(plan, now)) return { eligible: false, reason: "Este plano não está à venda agora." };
  if (plan.minAge !== null || plan.maxAge !== null) {
    const birth = await verifiedBirthDate(userId);
    if (!birth) return { eligible: false, reason: "Confirme sua data de nascimento no Perfil para ver este plano." };
    const age = ageOn(birth.birthDate, now);
    if (plan.minAge !== null && age < plan.minAge) return { eligible: false, reason: `Plano a partir de ${plan.minAge} anos.` };
    if (plan.maxAge !== null && age > plan.maxAge) return { eligible: false, reason: `Plano até ${plan.maxAge} anos.` };
  }
  if (plan.requiresActiveBank) {
    const sub = await getAsaasBankStore()
      .getSubaccount(userId)
      .catch(() => null);
    if (sub?.status !== "active") return { eligible: false, reason: "Plano exclusivo para quem tem a conta PRX BANK ativa." };
  }
  if (plan.foundersOnly && !(await isActiveFounder(userId, now))) return { eligible: false, reason: "Plano exclusivo para Founders da PRX." };
  return { eligible: true, reason: null };
}

export interface MemberPlanView extends SubscriptionPlan, Eligibility {
  introPrice: number | null;
}

export async function memberPlans(userId: string, now = new Date()): Promise<MemberPlanView[]> {
  const plans = (await repo().listPlans()).filter((p) => planOnSale(p, now));
  return Promise.all(
    plans.map(async (p) => ({
      ...p,
      ...(await planEligibility(p, userId, now)),
      introPrice: p.introDiscountPercent > 0 ? Math.round(p.price * (100 - p.introDiscountPercent)) / 100 : null,
    }))
  );
}

export interface CheckoutInfo {
  subscription: MemberSubscription;
  payment: SubscriptionPayment | null;
  pix: PixQr | null;
}

async function log(sub: MemberSubscription, actor: string, action: string, detail = "") {
  await repo().insertEvent({ subscriptionId: sub.id, userId: sub.userId, actor, action, detail });
}

/**
 * Contrata: confere elegibilidade, cria a assinatura no Asaas (referência
 * "sub:<id>") e devolve a primeira fatura. Com teste grátis, a primeira
 * cobrança vence no fim do teste. Falha no Asaas desfaz o registro local.
 */
export async function subscribe(payer: Payer, planId: string, billingType: BillingType, client: AsaasClient | null, now = new Date()): Promise<CheckoutInfo> {
  if (!client) throw new PartnerError(PAYMENTS_OFF, 503);
  const plan = await repo().getPlan(planId);
  if (!plan) throw new PartnerError("Plano não encontrado.", 404);
  if (!plan.paymentMethods.includes(billingType)) throw new PartnerError("Forma de pagamento não disponível neste plano.", 422);
  const eligibility = await planEligibility(plan, payer.id, now);
  if (!eligibility.eligible) throw new PartnerError(eligibility.reason ?? "Você não pode assinar este plano.", 403);
  if (await repo().liveFor(payer.id, plan.id)) throw new PartnerError("Você já tem uma assinatura deste plano em andamento.", 409);

  const customer = await ensureBillingCustomer(payer, client);
  const trialEndsAt = plan.trialDays > 0 ? new Date(now.getTime() + plan.trialDays * 86_400_000).toISOString() : null;
  const local = await repo().insertSubscription({
    userId: payer.id,
    planId: plan.id,
    planName: plan.name,
    price: plan.price,
    cycle: plan.cycle,
    billingType,
    status: plan.trialDays > 0 ? "trialing" : "pending_payment",
    environment: client.environment,
    asaasSubscriptionId: null,
    currentPeriodEnd: null,
    nextDueDate: dueDateIn(plan.trialDays, now),
    trialEndsAt,
    cancelAtPeriodEnd: false,
    cancelledAt: null,
    cancelReason: "",
  });
  const value = plan.introDiscountPercent > 0 ? Math.round(plan.price * (100 - plan.introDiscountPercent)) / 100 : plan.price;
  let created;
  try {
    created = await createSubscription(client, {
      customer,
      billingType,
      value,
      nextDueDate: dueDateIn(plan.trialDays, now),
      cycle: plan.cycle,
      description: `Assinatura PRX ${plan.name} (${CYCLE_LABEL[plan.cycle]})`.slice(0, 500),
      externalReference: `sub:${local.id}`,
    });
  } catch (err) {
    await repo().deleteSubscription(local.id);
    throw new TechnicalError(`Assinatura no Asaas: ${err instanceof Error ? err.message : String(err)}`, 503);
  }
  const sub = await repo().updateSubscription(local.id, { asaasSubscriptionId: created.id, nextDueDate: created.nextDueDate ?? local.nextDueDate });
  await log(sub, payer.email, "subscribed", `${plan.name} · ${billingType} · R$ ${value.toFixed(2)}${plan.trialDays ? ` · teste de ${plan.trialDays} dia(s)` : ""}`);
  return { subscription: sub, ...(await firstInvoice(sub, client)) };
}

/** Primeira fatura gerada pelo Asaas (para a pessoa pagar agora). */
async function firstInvoice(sub: MemberSubscription, client: AsaasClient): Promise<{ payment: SubscriptionPayment | null; pix: PixQr | null }> {
  if (!sub.asaasSubscriptionId) return { payment: null, pix: null };
  const payments = await listSubscriptionPayments(client, sub.asaasSubscriptionId).catch(() => []);
  const open = payments.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).find((p) => p.status === "PENDING" || p.status === "OVERDUE");
  if (!open) return { payment: null, pix: null };
  const { payment } = await recordPayment(sub, open, client);
  const pix = sub.billingType === "PIX" ? await getPaymentPixQr(client, open.id).catch(() => null) : null;
  return { payment, pix };
}

/** Pix da fatura em aberto (só do próprio membro). */
export async function invoicePix(userId: string, subscriptionId: string, paymentId: string, client: AsaasClient | null): Promise<PixQr> {
  if (!client) throw new PartnerError(PAYMENTS_OFF, 503);
  const sub = await repo().getSubscription(subscriptionId);
  if (!sub || sub.userId !== userId) throw new PartnerError("Assinatura não encontrada.", 404);
  const payment = (await repo().listPayments(sub.id)).find((p) => p.id === paymentId);
  if (!payment || (payment.status !== "PENDING" && payment.status !== "OVERDUE")) throw new PartnerError("Esta fatura não está em aberto.", 409);
  return getPaymentPixQr(client, payment.asaasPaymentId);
}

/** Cancela as próximas cobranças no Asaas e aplica a política do plano. */
export async function cancelSubscription(userId: string, subscriptionId: string, reason: string, actor: string, client: AsaasClient | null, now = new Date()): Promise<MemberSubscription> {
  const sub = await repo().getSubscription(subscriptionId);
  if (!sub || sub.userId !== userId) throw new PartnerError("Assinatura não encontrada.", 404);
  if (!LIVE_STATUSES.includes(sub.status)) throw new PartnerError("Esta assinatura já está encerrada.", 409);
  if (sub.asaasSubscriptionId) {
    if (!client) throw new PartnerError(PAYMENTS_OFF, 503);
    await deleteSubscription(client, sub.asaasSubscriptionId);
  }
  const plan = await repo().getPlan(sub.planId);
  const immediate = plan?.cancellationPolicy === "immediate" || sub.status !== "active";
  const saved = await repo().updateSubscription(sub.id, {
    status: "cancelled",
    cancelledAt: now.toISOString(),
    cancelReason: reason.trim().slice(0, 500),
    cancelAtPeriodEnd: !immediate,
    currentPeriodEnd: immediate ? now.toISOString() : sub.currentPeriodEnd,
  });
  await log(saved, actor, "cancelled", `${immediate ? "na hora" : "no fim do período pago"}${reason ? ` · ${reason.trim()}` : ""}`);
  return saved;
}

export async function memberSubscriptions(userId: string): Promise<Array<MemberSubscription & { payments: SubscriptionPayment[] }>> {
  const subs = await repo().listForUser(userId);
  return Promise.all(subs.map(async (s) => ({ ...s, payments: await repo().listPayments(s.id) })));
}
