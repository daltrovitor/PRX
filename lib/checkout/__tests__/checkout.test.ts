// Hello World
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userStore } from "@/lib/auth";
import { rememberBirthDate } from "@/lib/live/buyer";
import { getLiveRepository } from "@/lib/live/repository";
import { createEvent, reserveTicket, respondGuardianAuthorization } from "@/lib/live/service";
import { createPromo } from "@/lib/live/promo-service";
import { combineDiscounts, type PromoCode } from "@/lib/live/promo";
import { fakeGateway } from "@/lib/billing/__tests__/fake-gateway";
import { checkoutState, startCheckout } from "@/lib/checkout/service";
import { applyOrderPayment } from "@/lib/checkout/payments";
import { dispatchBillingEvent } from "@/lib/billing/webhook";
import { getOrdersRepository, resetOrdersMemory } from "@/lib/checkout/repository";
import type { EventInput } from "@/lib/live/types";

const IN_10_DAYS = new Date(Date.now() + 10 * 86_400_000).toISOString();
let seq = 0;
const eventInput = (over: Partial<EventInput> = {}): EventInput => ({
  series: "session",
  title: "PRX Night",
  summary: "Evento exclusivo de celebração e networking.",
  startsAt: IN_10_DAYS,
  endsAt: null,
  venue: "Arena",
  city: "São Paulo",
  address: "Av. Paulista, 1000",
  coverUrl: "",
  capacity: 100,
  perUserLimit: 2,
  minPrxLevel: 1,
  partnerId: null,
  staffCheckin: true,
  minAge: 16,
  idCheckRequired: true,
  entryRequirements: "Documento oficial com foto e liberação de responsável.",
  cancellationPolicy: "Cancelamento até 48h antes do evento.",
  organizerName: "PRX Entretenimento",
  status: "published",
  batches: [{ id: "b1", name: "Lote 1", price: 100, quantity: null, closed: false }],
  run: null,
  ...over,
});
function person(birth: string) {
  seq += 1;
  const u = userStore.createUser(`ck${Date.now()}${seq}@prx.dev`, `Pessoa Checkout ${seq}`, "Senha#2026x", "52998224725", "11988887777");
  void rememberBirthDate(u.id, birth, { source: "signup", verified: true });
  return u;
}
const payerOf = (u: { id: string; fullName: string; email: string }) => ({ id: u.id, fullName: u.fullName, email: u.email, cpf: "52998224725", phone: "11988887777" });
const gatewayWith = () =>
  fakeGateway({
    findCustomerByReference: async () => "cus_ck",
    createPayment: async (input) => ({
      id: `pay_${input.externalReference.slice(4, 12)}`,
      status: "PENDING",
      value: input.value,
      dueDate: "2026-10-16",
      billingType: input.billingType,
      invoiceUrl: "https://pagamentos.exemplo/i/x",
      paymentDate: null,
      clientPaymentDate: null,
      confirmedDate: null,
      subscription: null,
      externalReference: input.externalReference,
    }),
    getPaymentPixQr: async () => ({ encodedImage: "aGVsbG8=", payload: "000201pix", expirationDate: null }),
    cancelPayment: async () => ({ deleted: true }),
  });

beforeEach(() => {
  vi.stubEnv("PRX_EMAIL_FROM", "PRX <noreply@prx.app.br>");
  resetOrdersMemory();
});
afterEach(() => vi.unstubAllEnvs());

describe("descontos combinados", () => {
  const p = (over: Partial<PromoCode>): PromoCode => ({ id: "x", eventId: "e", code: "X", label: "", kind: "percent", value: 10, batchIds: null, startsAt: null, endsAt: null, maxUses: null, perUserLimit: 1, active: true, automatic: false, audience: "all", paymentMethods: null, stackable: false, createdBy: "", createdAt: "", updatedAt: "", ...over });
  it("vale o maior; dois só somam quando os dois são acumuláveis", () => {
    const coded = p({ id: "c", code: "AMIGOS", value: 10 });
    const auto = p({ id: "a", code: "AUTO", automatic: true, value: 20 });
    expect(combineDiscounts(100, coded, [auto])).toMatchObject({ discount: 20, total: 80 });
    const both = combineDiscounts(100, { ...coded, stackable: true }, [{ ...auto, stackable: true }]);
    expect(both).toMatchObject({ discount: 28, total: 72 });
    expect(both.applied.map((d) => d.code)).toEqual(["AUTO", "AMIGOS"]);
  });
});

describe("checkout de ingressos", () => {
  it("preço por forma de pagamento no servidor, ingresso válido só com o pagamento confirmado e sem duplicar", async () => {
    const { gateway, called } = gatewayWith();
    const event = await createEvent(eventInput(), "admin");
    await createPromo({ eventId: event.id, code: `PIX${event.id.slice(-6).toUpperCase()}`, label: "10% no Pix", kind: "percent", value: 10, batchIds: null, startsAt: null, endsAt: null, maxUses: null, perUserLimit: 1, active: true, automatic: true, audience: "all", paymentMethods: ["PIX", "PRX_BANK"], stackable: false }, "admin");
    const buyer = person("2000-01-01");
    const ticket = await reserveTicket(buyer, { eventId: event.id, batchId: "b1" });
    const state = await checkoutState(buyer.id, ticket.id, gateway);
    expect(state.options.find((o) => o.method === "PIX")?.quote?.total).toBe(90);
    expect(state.options.find((o) => o.method === "CREDIT_CARD")?.quote?.total).toBe(100);
    expect(state.options.find((o) => o.method === "PRX_BANK")).toMatchObject({ available: false });

    const card = await startCheckout(payerOf(buyer), ticket.id, "CREDIT_CARD", gateway);
    expect(card.invoiceUrl).toBe("https://pagamentos.exemplo/i/x");
    const pix = await startCheckout(payerOf(buyer), ticket.id, "PIX", gateway);
    expect(pix.pix?.payload).toBe("000201pix");
    // Trocar de forma cancela a cobrança anterior no provedor.
    expect(called("cancelPayment").some((c) => c.args[0] === card.order.gatewayPaymentId)).toBe(true);
    expect((called("createPayment").at(-1)!.args[0] as { value: number }).value).toBe(90);
    expect((await getLiveRepository().getTicket(ticket.id))?.status).toBe("pending_payment");

    // Webhook confirma; repetido não emite nada de novo.
    const event1 = { event: "PAYMENT_RECEIVED", payment: { id: pix.order.gatewayPaymentId, status: "RECEIVED", externalReference: `ord:${pix.order.id}` } };
    await expect(dispatchBillingEvent(event1, gateway)).resolves.toBe("processed");
    await dispatchBillingEvent(event1, gateway);
    expect(await getLiveRepository().getTicket(ticket.id)).toMatchObject({ status: "valid", price: 90 });
    expect((await getOrdersRepository().get(pix.order.id))?.status).toBe("paid");

    // A fatura antiga do cartão paga depois: duplicidade vai para revisão (estornar), sem segundo ingresso.
    await applyOrderPayment({ id: card.order.gatewayPaymentId, status: "CONFIRMED", externalReference: `ord:${card.order.id}` }, gateway);
    expect(await getOrdersRepository().get(card.order.id)).toMatchObject({ status: "paid_needs_review" });
    expect((await getLiveRepository().listTickets({ eventId: event.id })).filter((t) => t.status === "valid")).toHaveLength(1);
  });

  it("menor só paga depois da liberação do responsável", async () => {
    const { gateway } = gatewayWith();
    const event = await createEvent(eventInput(), "admin");
    const teen = person("2009-05-05");
    const ticket = await reserveTicket(teen, { eventId: event.id, batchId: "b1", parentEmail: "mae@exemplo.com" });
    await expect(startCheckout(payerOf(teen), ticket.id, "PIX", gateway)).rejects.toThrow(/responsável/);
    const consent = (await getLiveRepository().getTicket(ticket.id))!.guardianConsent!;
    await respondGuardianAuthorization(consent.token, { action: "approve", guardianName: "Maria Responsável", guardianCpf: "11144477735", guardianBirthDate: "1980-01-01", relationship: "Mãe", consentAccepted: true });
    await expect(startCheckout(payerOf(teen), ticket.id, "PIX", gateway)).resolves.toMatchObject({ order: { status: "awaiting_payment" } });
  });
});
