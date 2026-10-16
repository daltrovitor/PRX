// Hello World
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeAsaas, ASAAS_TEST_ENV } from "@/lib/bank/__tests__/asaas-fakes";
import { resetSubscriptionsMemory, getSubscriptionsRepository } from "@/lib/subscriptions/repository";
import { cancelSubscription, memberPlans, savePlan, subscribe } from "@/lib/subscriptions/service";
import { applySubscriptionPayment, syncSubscription } from "@/lib/subscriptions/payments";
import { subscriptionGrantsAccess } from "@/lib/subscriptions/types";
import { dispatchBillingEvent } from "@/lib/billing/webhook";
import { resetFounderMembersMemory, saveFounder } from "@/lib/founders/members";
import { userStore } from "@/lib/auth";
import { rememberBirthDate } from "@/lib/live/buyer";

const NOW = new Date("2026-10-16T12:00:00.000Z");
let seq = 0;
function payer() {
  seq += 1;
  const email = `assinante${seq}${Date.now()}@prx.dev`;
  const user = userStore.createUser(email, "Assinante Teste", "Senha#2026x", "52998224725", "11988887777");
  return { id: user.id, fullName: user.fullName, email, cpf: "52998224725", phone: "11988887777" };
}

const PLAN = { name: "PRX Plus", price: 19.9, cycle: "MONTHLY", benefits: ["Ingresso com desconto"], paymentMethods: ["PIX", "CREDIT_CARD"], status: "active" };
const payment = (over: Record<string, unknown> = {}) => ({ id: "pay_1", status: "PENDING", value: 19.9, dueDate: "2026-10-16", billingType: "PIX", invoiceUrl: "https://www.asaas.com/i/pay_1", subscription: "sub_asaas_1", ...over });

beforeEach(() => {
  for (const [k, v] of Object.entries(ASAAS_TEST_ENV)) vi.stubEnv(k, v);
  resetSubscriptionsMemory();
  resetFounderMembersMemory();
});
afterEach(() => vi.unstubAllEnvs());

describe("assinaturas", () => {
  it("contrata pelo Asaas, só ativa com o pagamento confirmado e não duplica no webhook repetido", async () => {
    const { client, calls } = fakeAsaas({
      "GET /customers": { body: { data: [] } },
      "POST /customers": { body: { id: "cus_1" } },
      "POST /subscriptions": { body: { id: "sub_asaas_1", status: "ACTIVE", nextDueDate: "2026-10-16", value: 19.9, cycle: "MONTHLY", billingType: "PIX" } },
      "GET /subscriptions/sub_asaas_1/payments": { body: { data: [payment()] } },
      "GET /payments/pay_1/pixQrCode": { body: { encodedImage: "aGVsbG8=", payload: "000201pix", expirationDate: "2026-10-17 23:59:59" } },
    });
    const plan = await savePlan(PLAN, "admin@prx.dev");
    const member = payer();
    const checkout = await subscribe(member, plan.id, "PIX", client, NOW);
    expect(checkout.subscription).toMatchObject({ status: "pending_payment", asaasSubscriptionId: "sub_asaas_1", price: 19.9 });
    expect(checkout.payment).toMatchObject({ status: "PENDING", invoiceUrl: "https://www.asaas.com/i/pay_1" });
    expect(checkout.pix?.payload).toBe("000201pix");
    const created = calls.find((c) => c.method === "POST" && c.path === "/subscriptions")!.body as Record<string, unknown>;
    expect(created).toMatchObject({ customer: "cus_1", billingType: "PIX", value: 19.9, cycle: "MONTHLY", externalReference: `sub:${checkout.subscription.id}` });
    // Retorno visual da fatura não ativa nada.
    expect(subscriptionGrantsAccess(checkout.subscription, NOW)).toBe(false);
    await expect(subscribe(member, plan.id, "PIX", client, NOW)).rejects.toThrow(/em andamento/);

    // Webhook do Asaas confirma: ativa até o fim do ciclo. Repetido não muda nada.
    const event = { event: "PAYMENT_RECEIVED", payment: payment({ status: "RECEIVED", paymentDate: "2026-10-16" }) };
    await expect(dispatchBillingEvent(event, client)).resolves.toBe("processed");
    await dispatchBillingEvent(event, client);
    const [active] = await getSubscriptionsRepository().listForUser(member.id);
    expect(active).toMatchObject({ status: "active", nextDueDate: "2026-11-16" });
    expect(subscriptionGrantsAccess(active, NOW)).toBe(true);
    expect((await getSubscriptionsRepository().listEvents(active.id)).filter((e) => e.action === "payment_confirmed")).toHaveLength(1);

    // Próxima cobrança vence e não é paga: atraso suspende os benefícios.
    await applySubscriptionPayment(payment({ id: "pay_2", status: "OVERDUE", dueDate: "2026-11-16" }), client);
    const late = (await getSubscriptionsRepository().listForUser(member.id))[0];
    expect(late.status).toBe("past_due");
    expect(subscriptionGrantsAccess(late, new Date("2026-11-20T12:00:00Z"))).toBe(false);
    // Pagamento de quem não é assinatura da PRX é ignorado.
    await expect(dispatchBillingEvent({ event: "PAYMENT_RECEIVED", payment: payment({ id: "x", subscription: "outra" }) }, client)).resolves.toBe("ignored");
  });

  it("cancelamento no fim do período mantém os benefícios até lá e para as cobranças no Asaas", async () => {
    const { client, calls } = fakeAsaas({
      "GET /customers": { body: { data: [{ id: "cus_9" }] } },
      "POST /subscriptions": { body: { id: "sub_asaas_2", status: "ACTIVE", nextDueDate: "2026-10-16", value: 19.9 } },
      "GET /subscriptions/sub_asaas_2/payments": { body: { data: [] } },
      "DELETE /subscriptions/sub_asaas_2": { body: { deleted: true, id: "sub_asaas_2" } },
    });
    const plan = await savePlan({ ...PLAN, cancellationPolicy: "end_of_period" }, "admin@prx.dev");
    const member = payer();
    const { subscription } = await subscribe(member, plan.id, "CREDIT_CARD", client, NOW);
    expect(calls.some((c) => c.method === "POST" && c.path === "/customers")).toBe(false);
    await applySubscriptionPayment(payment({ id: "pay_9", subscription: "sub_asaas_2", status: "CONFIRMED", confirmedDate: "2026-10-16" }), client);
    const cancelled = await cancelSubscription(member.id, subscription.id, "Vou pausar", member.email, client, NOW);
    expect(calls.some((c) => c.method === "DELETE" && c.path === "/subscriptions/sub_asaas_2")).toBe(true);
    expect(cancelled).toMatchObject({ status: "cancelled", cancelAtPeriodEnd: true });
    expect(subscriptionGrantsAccess(cancelled, new Date("2026-11-01T12:00:00Z"))).toBe(true);
    expect(subscriptionGrantsAccess(cancelled, new Date("2026-11-17T12:00:00Z"))).toBe(false);
    await expect(cancelSubscription("outra-pessoa", subscription.id, "", "x", client, NOW)).rejects.toThrow(/não encontrada/);
  });

  it("elegibilidade no servidor: idade, só Founders e desconto de entrada que volta ao preço cheio", async () => {
    const { client, calls } = fakeAsaas({
      "GET /customers": { body: { data: [{ id: "cus_7" }] } },
      "POST /subscriptions": { body: { id: "sub_asaas_7", status: "ACTIVE", nextDueDate: "2026-10-16", value: 9.95 } },
      "GET /subscriptions/sub_asaas_7/payments": { body: { data: [] } },
      "POST /subscriptions/sub_asaas_7": { body: { id: "sub_asaas_7", status: "ACTIVE", nextDueDate: "2026-11-16", value: 19.9 } },
    });
    const founders = await savePlan({ ...PLAN, name: "Founders", foundersOnly: true }, "admin@prx.dev");
    const adults = await savePlan({ ...PLAN, name: "Adultos", minAge: 18 }, "admin@prx.dev");
    const intro = await savePlan({ ...PLAN, name: "Entrada", introDiscountPercent: 50, introCycles: 1 }, "admin@prx.dev");
    await expect(savePlan({ ...PLAN, introDiscountPercent: 50 }, "a")).rejects.toThrow(/número de cobranças/);
    const member = payer();
    await expect(subscribe(member, founders.id, "PIX", client, NOW)).rejects.toThrow(/Founders/);
    await expect(subscribe(member, adults.id, "PIX", client, NOW)).rejects.toThrow(/data de nascimento/);
    await rememberBirthDate(member.id, "2001-01-01", { source: "signup", verified: true });
    await saveFounder({ userId: member.id, displayName: "Assinante" }, "admin@prx.dev");
    const plans = await memberPlans(member.id, NOW);
    expect(plans.find((p) => p.id === founders.id)?.eligible).toBe(true);
    expect(plans.find((p) => p.id === intro.id)?.introPrice).toBe(9.95);

    const { subscription } = await subscribe(member, intro.id, "PIX", client, NOW);
    expect((calls.find((c) => c.method === "POST" && c.path === "/subscriptions")!.body as { value: number }).value).toBe(9.95);
    await applySubscriptionPayment(payment({ id: "pay_7", subscription: "sub_asaas_7", value: 9.95, status: "RECEIVED", paymentDate: "2026-10-16" }), client);
    const update = calls.find((c) => c.method === "POST" && c.path === "/subscriptions/sub_asaas_7");
    expect(update?.body).toMatchObject({ value: 19.9, updatePendingPayments: true });
    expect((await getSubscriptionsRepository().getSubscription(subscription.id))?.status).toBe("active");
  });

  it("conciliação corrige webhook perdido e assinatura removida no Asaas", async () => {
    const { client } = fakeAsaas({
      "GET /customers": { body: { data: [{ id: "cus_5" }] } },
      "POST /subscriptions": { body: { id: "sub_asaas_5", status: "ACTIVE", nextDueDate: "2026-10-16", value: 19.9 } },
      "GET /subscriptions/sub_asaas_5/payments": { body: { data: [payment({ id: "pay_5", subscription: "sub_asaas_5", status: "CONFIRMED", confirmedDate: "2026-10-16" })] } },
      "GET /subscriptions/sub_asaas_5": { body: { id: "sub_asaas_5", status: "INACTIVE", value: 19.9, deleted: true } },
    });
    const plan = await savePlan(PLAN, "admin@prx.dev");
    const member = payer();
    const { subscription } = await subscribe(member, plan.id, "PIX", client, NOW);
    const synced = await syncSubscription(subscription.id, client);
    expect(synced).toMatchObject({ status: "cancelled", cancelAtPeriodEnd: true });
    expect(synced?.currentPeriodEnd).toBe("2026-11-16T12:00:00.000Z");
  });
});
