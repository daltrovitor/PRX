// Hello World
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeGateway } from "@/lib/billing/__tests__/fake-gateway";
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
const payment = (over: Record<string, unknown> = {}) => ({
  id: "pay_1",
  status: "PENDING",
  value: 19.9,
  dueDate: "2026-10-16",
  billingType: "PIX",
  invoiceUrl: "https://pagamentos.exemplo/i/pay_1",
  paymentDate: null,
  clientPaymentDate: null,
  confirmedDate: null,
  subscription: "sub_gw_1",
  externalReference: null,
  ...over,
});
const remoteSub = (id: string, over: Record<string, unknown> = {}) => ({ id, status: "ACTIVE", nextDueDate: "2026-10-16", value: 19.9, cycle: null, billingType: null, deleted: false, ...over });
const pixQr = { encodedImage: "aGVsbG8=", payload: "000201pix", expirationDate: "2026-10-17 23:59:59" };

beforeEach(() => {
  vi.stubEnv("PRX_EMAIL_FROM", "PRX <noreply@prx.app.br>");
  resetSubscriptionsMemory();
  resetFounderMembersMemory();
});
afterEach(() => vi.unstubAllEnvs());

describe("assinaturas", () => {
  it("contrata pelo provedor, só ativa com o pagamento confirmado e não duplica no webhook repetido", async () => {
    const { gateway, called } = fakeGateway({
      findCustomerByReference: async () => null,
      createCustomer: async () => ({ id: "cus_1" }),
      createSubscription: async () => remoteSub("sub_gw_1", { cycle: "MONTHLY", billingType: "PIX" }),
      listSubscriptionPayments: async () => [payment()],
      getPaymentPixQr: async () => pixQr,
    });
    const plan = await savePlan(PLAN, "admin@prx.dev");
    const member = payer();
    const checkout = await subscribe(member, plan.id, "PIX", gateway, NOW);
    expect(checkout.subscription).toMatchObject({ status: "pending_payment", gatewaySubscriptionId: "sub_gw_1", price: 19.9 });
    expect(checkout.payment).toMatchObject({ status: "PENDING", invoiceUrl: "https://pagamentos.exemplo/i/pay_1" });
    expect(checkout.pix?.payload).toBe("000201pix");
    const created = called("createSubscription")[0].args[0] as Record<string, unknown>;
    expect(created).toMatchObject({ customer: "cus_1", billingType: "PIX", value: 19.9, cycle: "MONTHLY", externalReference: `sub:${checkout.subscription.id}` });
    // Retorno visual da fatura não ativa nada.
    expect(subscriptionGrantsAccess(checkout.subscription, NOW)).toBe(false);
    await expect(subscribe(member, plan.id, "PIX", gateway, NOW)).rejects.toThrow(/em andamento/);

    // Webhook do provedor confirma: ativa até o fim do ciclo. Repetido não muda nada.
    const event = { event: "PAYMENT_RECEIVED", payment: payment({ status: "RECEIVED", paymentDate: "2026-10-16" }) };
    await expect(dispatchBillingEvent(event, gateway)).resolves.toBe("processed");
    await dispatchBillingEvent(event, gateway);
    const [active] = await getSubscriptionsRepository().listForUser(member.id);
    expect(active).toMatchObject({ status: "active", nextDueDate: "2026-11-16" });
    expect(subscriptionGrantsAccess(active, NOW)).toBe(true);
    expect((await getSubscriptionsRepository().listEvents(active.id)).filter((e) => e.action === "payment_confirmed")).toHaveLength(1);

    // Próxima cobrança vence e não é paga: atraso suspende os benefícios.
    await applySubscriptionPayment(payment({ id: "pay_2", status: "OVERDUE", dueDate: "2026-11-16" }), gateway);
    const late = (await getSubscriptionsRepository().listForUser(member.id))[0];
    expect(late.status).toBe("past_due");
    expect(subscriptionGrantsAccess(late, new Date("2026-11-20T12:00:00Z"))).toBe(false);
    // Pagamento de quem não é assinatura da PRX é ignorado.
    await expect(dispatchBillingEvent({ event: "PAYMENT_RECEIVED", payment: payment({ id: "x", subscription: "outra" }) }, gateway)).resolves.toBe("ignored");
  });

  it("cancelamento no fim do período mantém os benefícios até lá e para as cobranças no provedor", async () => {
    const { gateway, called } = fakeGateway({
      findCustomerByReference: async () => "cus_9",
      createSubscription: async () => remoteSub("sub_gw_2"),
      listSubscriptionPayments: async () => [],
      deleteSubscription: async () => ({ deleted: true, id: "sub_gw_2" }),
    });
    const plan = await savePlan({ ...PLAN, cancellationPolicy: "end_of_period" }, "admin@prx.dev");
    const member = payer();
    const { subscription } = await subscribe(member, plan.id, "CREDIT_CARD", gateway, NOW);
    expect(called("createCustomer")).toHaveLength(0);
    await applySubscriptionPayment(payment({ id: "pay_9", subscription: "sub_gw_2", status: "CONFIRMED", confirmedDate: "2026-10-16" }), gateway);
    const cancelled = await cancelSubscription(member.id, subscription.id, "Vou pausar", member.email, gateway, NOW);
    expect(called("deleteSubscription").some((c) => c.args[0] === "sub_gw_2")).toBe(true);
    expect(cancelled).toMatchObject({ status: "cancelled", cancelAtPeriodEnd: true });
    expect(subscriptionGrantsAccess(cancelled, new Date("2026-11-01T12:00:00Z"))).toBe(true);
    expect(subscriptionGrantsAccess(cancelled, new Date("2026-11-17T12:00:00Z"))).toBe(false);
    await expect(cancelSubscription("outra-pessoa", subscription.id, "", "x", gateway, NOW)).rejects.toThrow(/não encontrada/);
  });

  it("elegibilidade no servidor: idade, só Founders e desconto de entrada que volta ao preço cheio", async () => {
    const { gateway, called } = fakeGateway({
      findCustomerByReference: async () => "cus_7",
      createSubscription: async () => remoteSub("sub_gw_7", { value: 9.95 }),
      listSubscriptionPayments: async () => [],
      updateSubscriptionValue: async () => remoteSub("sub_gw_7", { nextDueDate: "2026-11-16" }),
    });
    const founders = await savePlan({ ...PLAN, name: "Founders", foundersOnly: true }, "admin@prx.dev");
    const adults = await savePlan({ ...PLAN, name: "Adultos", minAge: 18 }, "admin@prx.dev");
    const intro = await savePlan({ ...PLAN, name: "Entrada", introDiscountPercent: 50, introCycles: 1 }, "admin@prx.dev");
    await expect(savePlan({ ...PLAN, introDiscountPercent: 50 }, "a")).rejects.toThrow(/número de cobranças/);
    const member = payer();
    await expect(subscribe(member, founders.id, "PIX", gateway, NOW)).rejects.toThrow(/Founders/);
    await expect(subscribe(member, adults.id, "PIX", gateway, NOW)).rejects.toThrow(/data de nascimento/);
    await rememberBirthDate(member.id, "2001-01-01", { source: "signup", verified: true });
    await saveFounder({ userId: member.id, displayName: "Assinante" }, "admin@prx.dev");
    const plans = await memberPlans(member.id, NOW);
    expect(plans.find((p) => p.id === founders.id)?.eligible).toBe(true);
    expect(plans.find((p) => p.id === intro.id)?.introPrice).toBe(9.95);

    const { subscription } = await subscribe(member, intro.id, "PIX", gateway, NOW);
    expect((called("createSubscription")[0].args[0] as { value: number }).value).toBe(9.95);
    await applySubscriptionPayment(payment({ id: "pay_7", subscription: "sub_gw_7", value: 9.95, status: "RECEIVED", paymentDate: "2026-10-16" }), gateway);
    expect(called("updateSubscriptionValue")[0].args).toEqual(["sub_gw_7", 19.9]);
    expect((await getSubscriptionsRepository().getSubscription(subscription.id))?.status).toBe("active");
  });

  it("conciliação corrige webhook perdido e assinatura removida no provedor", async () => {
    const { gateway } = fakeGateway({
      findCustomerByReference: async () => "cus_5",
      createSubscription: async () => remoteSub("sub_gw_5"),
      listSubscriptionPayments: async () => [payment({ id: "pay_5", subscription: "sub_gw_5", status: "CONFIRMED", confirmedDate: "2026-10-16" })],
      getSubscription: async () => remoteSub("sub_gw_5", { status: "INACTIVE", nextDueDate: null, deleted: true }),
    });
    const plan = await savePlan(PLAN, "admin@prx.dev");
    const member = payer();
    const { subscription } = await subscribe(member, plan.id, "PIX", gateway, NOW);
    const synced = await syncSubscription(subscription.id, gateway);
    expect(synced).toMatchObject({ status: "cancelled", cancelAtPeriodEnd: true });
    expect(synced?.currentPeriodEnd).toBe("2026-11-16T12:00:00.000Z");
  });
});
