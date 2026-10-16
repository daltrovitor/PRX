// Hello World
import type { AsaasClient } from "@/lib/asaas/client";
import { PAID_STATUSES, REVERSED_STATUSES, addCycle, getSubscription, listSubscriptionPayments, updateSubscriptionValue, type AsaasPayment } from "@/lib/asaas/billing";
import { getSubscriptionsRepository } from "@/lib/subscriptions/repository";
import type { MemberSubscription, SubscriptionPayment } from "@/lib/subscriptions/types";

/**
 * Pagamentos das assinaturas, aplicados a partir do Asaas (webhook ou
 * conciliação). Idempotente: o pagamento é único pelo id do Asaas e a
 * assinatura só muda quando o status do pagamento muda.
 *   pago (RECEIVED/CONFIRMED)    → ativa até o fim do ciclo daquela cobrança
 *   vencido (OVERDUE)            → em atraso (benefícios suspensos)
 *   estornado/chargeback         → em atraso
 *   assinatura removida no Asaas → cancelada
 */

const repo = () => getSubscriptionsRepository();

function paidAt(p: AsaasPayment): string | null {
  const raw = p.confirmedDate ?? p.paymentDate ?? p.clientPaymentDate;
  return raw ? new Date(`${raw.slice(0, 10)}T12:00:00-03:00`).toISOString() : null;
}

export async function recordPayment(sub: MemberSubscription, p: AsaasPayment, client: AsaasClient | null): Promise<{ payment: SubscriptionPayment; subscription: MemberSubscription }> {
  const { payment, previousStatus } = await repo().upsertPayment({
    subscriptionId: sub.id,
    asaasPaymentId: p.id,
    value: p.value,
    dueDate: p.dueDate.slice(0, 10),
    status: p.status,
    billingType: p.billingType,
    invoiceUrl: p.invoiceUrl,
    paidAt: PAID_STATUSES.has(p.status) ? paidAt(p) : null,
  });
  if (previousStatus === p.status) return { payment, subscription: sub };

  let next = sub;
  const log = (action: string, detail: string) => repo().insertEvent({ subscriptionId: sub.id, userId: sub.userId, actor: "Asaas", action, detail });

  if (PAID_STATUSES.has(p.status)) {
    const periodEnd = addCycle(p.dueDate, sub.cycle);
    const keepCancelled = sub.status === "cancelled";
    next = await repo().updateSubscription(sub.id, {
      status: keepCancelled ? "cancelled" : "active",
      currentPeriodEnd: sub.currentPeriodEnd && Date.parse(sub.currentPeriodEnd) > Date.parse(periodEnd) ? sub.currentPeriodEnd : periodEnd,
      nextDueDate: periodEnd.slice(0, 10),
    });
    await log("payment_confirmed", `R$ ${p.value.toFixed(2)} · vencimento ${p.dueDate.slice(0, 10)}`);
    await endIntroDiscount(next, client).catch((err: unknown) => log("intro_update_failed", err instanceof Error ? err.message.slice(0, 300) : "falha"));
  } else if (p.status === "OVERDUE" && (sub.status === "active" || sub.status === "pending_payment" || sub.status === "trialing")) {
    next = await repo().updateSubscription(sub.id, { status: "past_due" });
    await log("payment_overdue", `Vencida em ${p.dueDate.slice(0, 10)}`);
  } else if (REVERSED_STATUSES.has(p.status) && sub.status !== "cancelled") {
    next = await repo().updateSubscription(sub.id, { status: "past_due" });
    await log("payment_reversed", `${p.status} · R$ ${p.value.toFixed(2)}`);
  }
  return { payment, subscription: next };
}

/** Depois das cobranças com desconto de entrada, as próximas voltam ao preço cheio do plano. */
async function endIntroDiscount(sub: MemberSubscription, client: AsaasClient | null): Promise<void> {
  if (!client || !sub.asaasSubscriptionId) return;
  const plan = await repo().getPlan(sub.planId);
  if (!plan || plan.introCycles === 0) return;
  const paid = (await repo().listPayments(sub.id)).filter((p) => PAID_STATUSES.has(p.status)).length;
  if (paid !== plan.introCycles) return;
  await updateSubscriptionValue(client, sub.asaasSubscriptionId, sub.price);
  await repo().insertEvent({ subscriptionId: sub.id, userId: sub.userId, actor: "PRX", action: "intro_ended", detail: `Próximas cobranças em R$ ${sub.price.toFixed(2)}` });
}

/** Evento PAYMENT_* da conta principal. null quando o pagamento não é de uma assinatura da PRX. */
export async function applySubscriptionPayment(payment: Record<string, unknown>, client: AsaasClient | null): Promise<"processed" | null> {
  const asaasSubscription = typeof payment.subscription === "string" ? payment.subscription : null;
  const reference = typeof payment.externalReference === "string" ? payment.externalReference : "";
  const localId = reference.startsWith("sub:") ? reference.slice(4) : null;
  const sub = (asaasSubscription ? await repo().findByAsaasId(asaasSubscription) : null) ?? (localId ? await repo().getSubscription(localId) : null);
  if (!sub) return null;
  const parsed: AsaasPayment = {
    id: String(payment.id ?? ""),
    status: String(payment.status ?? ""),
    value: Number(payment.value ?? 0),
    dueDate: String(payment.dueDate ?? "").slice(0, 10),
    billingType: typeof payment.billingType === "string" ? payment.billingType : null,
    invoiceUrl: typeof payment.invoiceUrl === "string" ? payment.invoiceUrl : null,
    paymentDate: typeof payment.paymentDate === "string" ? payment.paymentDate : null,
    clientPaymentDate: typeof payment.clientPaymentDate === "string" ? payment.clientPaymentDate : null,
    confirmedDate: typeof payment.confirmedDate === "string" ? payment.confirmedDate : null,
    subscription: asaasSubscription,
    externalReference: reference || null,
  };
  if (!parsed.id || !parsed.status || !parsed.dueDate) return null;
  await recordPayment(sub, parsed, client);
  return "processed";
}

/** Evento SUBSCRIPTION_DELETED/INACTIVATED: a assinatura parou no Asaas. */
export async function applySubscriptionRemoved(subscription: Record<string, unknown>): Promise<"processed" | null> {
  const id = typeof subscription.id === "string" ? subscription.id : null;
  const sub = id ? await repo().findByAsaasId(id) : null;
  if (!sub) return null;
  if (sub.status === "cancelled" || sub.status === "expired") return "processed";
  await repo().updateSubscription(sub.id, { status: "cancelled", cancelledAt: new Date().toISOString(), cancelAtPeriodEnd: Boolean(sub.currentPeriodEnd) });
  await repo().insertEvent({ subscriptionId: sub.id, userId: sub.userId, actor: "Asaas", action: "removed_at_provider", detail: "Assinatura removida no Asaas." });
  return "processed";
}

/**
 * Conciliação (admin ou cron): relê a assinatura e as cobranças no Asaas e
 * corrige divergências (webhook perdido, status fora de ordem).
 */
export async function syncSubscription(id: string, client: AsaasClient): Promise<MemberSubscription | null> {
  let sub = await repo().getSubscription(id);
  if (!sub?.asaasSubscriptionId) return sub;
  const remote = await getSubscription(client, sub.asaasSubscriptionId);
  const payments = (await listSubscriptionPayments(client, sub.asaasSubscriptionId)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  for (const p of payments) sub = (await recordPayment(sub, p, client)).subscription;
  if ((remote.deleted || remote.status === "INACTIVE") && sub.status !== "cancelled" && sub.status !== "expired") {
    sub = await repo().updateSubscription(sub.id, { status: "cancelled", cancelledAt: new Date().toISOString(), cancelAtPeriodEnd: Boolean(sub.currentPeriodEnd) });
    await repo().insertEvent({ subscriptionId: sub.id, userId: sub.userId, actor: "Conciliação", action: "removed_at_provider", detail: "Assinatura inativa no Asaas." });
  }
  return sub;
}
