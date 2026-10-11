// Hello World
import { beforeEach, describe, expect, it } from "vitest";
import { userStore } from "@/lib/auth";
import { rememberBirthDate } from "@/lib/live/buyer";
import { createPromo } from "@/lib/live/promo-service";
import { promoInputSchema } from "@/lib/live/promo";
import { getLiveRepository } from "@/lib/live/repository";
import { eventReadiness } from "@/lib/live/readiness";
import { createEvent, eventStats, listDoorEvents, memberWallet, quoteTicket, reserveTicket, setEventStatus } from "@/lib/live/service";
import { issueTestTicket } from "@/lib/live/simulation";
import { ticketQrPayload } from "@/lib/live/rules";
import type { EventInput } from "@/lib/live/types";
import { validateCode } from "@/lib/validation";
import type { Validator } from "@/lib/validation/actor";
import { listValidations } from "@/lib/validation/log";

/** Fluxo de compra, cupom, idade e portaria no modo memória (sem Supabase), com dados sintéticos de teste. */

const IN_30_DAYS = new Date(Date.now() + 30 * 86_400_000).toISOString();
const ADMIN = { id: "adm_test", email: "admin@prx.dev", name: "Admin Teste" };
const adminV: Validator = { role: "admin", userId: ADMIN.id, name: ADMIN.name };
const staffV: Validator = { role: "staff", userId: "stf_test", name: "Porteiro Teste", canValidateTickets: true, canValidateBenefits: false };
let seq = 0;

function eventInput(overrides: Partial<EventInput> = {}): EventInput {
  return {
    series: "session",
    title: "Evento de teste",
    summary: "Evento sintético usado só nos testes automatizados.",
    startsAt: IN_30_DAYS,
    endsAt: null,
    venue: "Local de teste",
    city: "Cidade de teste",
    address: "",
    coverUrl: "",
    capacity: 100,
    perUserLimit: 2,
    minPrxLevel: 1,
    partnerId: null,
    staffCheckin: true,
    minAge: 18,
    idCheckRequired: true,
    entryRequirements: "Documento oficial com foto.",
    cancellationPolicy: "Reembolso integral até 48 h antes do início do evento.",
    organizerName: "Organizador de teste",
    status: "published",
    batches: [{ id: "b1", name: "Pista", price: 100, quantity: null, closed: false }],
    run: null,
    ...overrides,
  };
}

function member(birthDate?: string) {
  const user = userStore.createUser(`membro${Date.now()}${++seq}@exemplo.com`, `Membro Teste ${seq}`, "Senha1234");
  if (birthDate) void rememberBirthDate(user.id, birthDate, { source: "signup", verified: true });
  return user;
}

beforeEach(() => {
  delete (globalThis as { __prxLiveState?: unknown }).__prxLiveState;
  (globalThis as { __prxPromos?: unknown[] }).__prxPromos?.splice(0);
  (globalThis as { __prxValidationLog?: unknown[] }).__prxValidationLog?.splice(0);
});

describe("publicação", () => {
  it("não publica evento sem organizador, cancelamento e classificação", async () => {
    await expect(createEvent(eventInput({ organizerName: "", cancellationPolicy: "", minAge: null }), "admin")).rejects.toMatchObject({ status: 422 });
    const draft = await createEvent(eventInput({ organizerName: "", status: "draft" }), "admin");
    await expect(setEventStatus(draft.id, "published")).rejects.toMatchObject({ status: 422, message: expect.stringContaining("Organizador") });
  });
});

describe("idade na compra", () => {
  it("16 anos tem conta, compra evento livre, mas não compra evento 18+", async () => {
    const teen = member("2010-05-01");
    const adults = await createEvent(eventInput(), "admin");
    await expect(reserveTicket(teen, { eventId: adults.id, batchId: "b1" })).rejects.toMatchObject({ status: 403, message: expect.stringContaining("menores de 18") });
    const free = await createEvent(eventInput({ minAge: 0, idCheckRequired: false, batches: [{ id: "g", name: "Grátis", price: 0, quantity: null, closed: false }] }), "admin");
    await expect(reserveTicket(teen, { eventId: free.id, batchId: "g" })).resolves.toMatchObject({ status: "valid" });
  });

  it("sem data na conta, pede a data e grava a confirmada (sem sobrescrever)", async () => {
    const event = await createEvent(eventInput(), "admin");
    const buyer = member();
    expect((await quoteTicket(buyer, { eventId: event.id, batchId: "b1" })).age).toMatchObject({ needsBirthDate: true, eligible: false });
    await expect(reserveTicket(buyer, { eventId: event.id, batchId: "b1" })).rejects.toMatchObject({ status: 422 });
    await expect(reserveTicket(buyer, { eventId: event.id, batchId: "b1", birthDate: "2000-01-01" })).resolves.toMatchObject({ status: "pending_payment", price: 100 });
    // A data já gravada vale; outra data enviada depois não sobrescreve.
    const other = await createEvent(eventInput({ title: "Outro evento de teste" }), "admin");
    await expect(reserveTicket(buyer, { eventId: other.id, batchId: "b1", birthDate: "2012-01-01" })).resolves.toMatchObject({ status: "pending_payment" });
    expect((await quoteTicket(buyer, { eventId: other.id, batchId: "b1" })).age).toMatchObject({ needsBirthDate: false, eligible: true });
  });
});

describe("cupom e link de desconto", () => {
  async function setup(promo: Record<string, unknown> = {}) {
    const event = await createEvent(eventInput(), "admin");
    const created = await createPromo(promoInputSchema.parse({ eventId: event.id, code: "amigos20", kind: "percent", value: 20, maxUses: 1, active: true, ...promo }), "admin");
    return { event, promo: created };
  }

  it("calcula o desconto no servidor e ignora preço vindo do navegador", async () => {
    const { event } = await setup();
    const buyer = member("1999-03-03");
    expect(await quoteTicket(buyer, { eventId: event.id, batchId: "b1", promoCode: "AMIGOS20" })).toMatchObject({ original: 100, discount: 20, total: 80 });
    const forged = { eventId: event.id, batchId: "b1", promoCode: "amigos20", price: 1, discount: 99 } as Parameters<typeof reserveTicket>[1];
    await expect(reserveTicket(buyer, forged)).resolves.toMatchObject({ price: 80, originalPrice: 100, discount: 20 });
  });

  it("respeita o limite total de usos", async () => {
    const { event } = await setup();
    await reserveTicket(member("1999-03-03"), { eventId: event.id, batchId: "b1", promoCode: "AMIGOS20" });
    await expect(reserveTicket(member("1999-03-03"), { eventId: event.id, batchId: "b1", promoCode: "AMIGOS20" })).rejects.toMatchObject({ status: 409, message: "Este cupom esgotou." });
  });

  it("respeita o limite por pessoa", async () => {
    const { event } = await setup({ maxUses: null });
    const buyer = member("1999-03-03");
    await reserveTicket(buyer, { eventId: event.id, batchId: "b1", promoCode: "AMIGOS20" });
    await expect(reserveTicket(buyer, { eventId: event.id, batchId: "b1", promoCode: "AMIGOS20" })).rejects.toMatchObject({ status: 409 });
  });

  it("recusa cupom de outro evento, expirado e inativo", async () => {
    const { promo } = await setup({ code: "SOEVENTO1" });
    const other = await createEvent(eventInput({ title: "Outro" }), "admin");
    const buyer = member("1999-03-03");
    await expect(reserveTicket(buyer, { eventId: other.id, batchId: "b1", promoCode: promo.code })).rejects.toMatchObject({ status: 422 });
    const { event: e2 } = await setup({ code: "VENCIDO1", startsAt: "2026-01-01T00:00:00Z", endsAt: "2026-01-02T00:00:00Z" });
    await expect(reserveTicket(buyer, { eventId: e2.id, batchId: "b1", promoCode: "VENCIDO1" })).rejects.toMatchObject({ message: "Este cupom expirou." });
    const { event: e3 } = await setup({ code: "INATIVO1", active: false });
    await expect(reserveTicket(buyer, { eventId: e3.id, batchId: "b1", promoCode: "INATIVO1" })).rejects.toMatchObject({ message: "Este cupom não está ativo." });
  });
});

describe("simulação e teste de portaria", () => {
  it("ingresso de teste: sem cobrança, fora da lotação e das métricas, fora da carteira", async () => {
    const event = await createEvent(eventInput({ capacity: 1 }), "admin");
    const { ticket, quote } = await issueTestTicket(ADMIN, { eventId: event.id, batchId: "b1" });
    expect(ticket).toMatchObject({ isTest: true, paidAt: null, status: "valid", price: 100 });
    expect(quote.total).toBe(100);
    expect(eventStats(event, await getLiveRepository().listTickets({ eventId: event.id }))).toMatchObject({ total: 0, test: 1, confirmedRevenue: 0, capacityLeft: 1 });
    expect((await memberWallet({ id: ADMIN.id })).tickets).toHaveLength(0);
    // A lotação de 1 continua livre para uma compra real.
    await expect(reserveTicket(member("1999-03-03"), { eventId: event.id, batchId: "b1" })).resolves.toMatchObject({ status: "pending_payment" });
  });

  it("entrada registrada, segunda leitura bloqueada e evento marcado como testado", async () => {
    const event = await createEvent(eventInput(), "admin");
    const { ticket } = await issueTestTicket(ADMIN, { eventId: event.id, batchId: "b1", holderLabel: "Insider de teste" });
    expect(ticket.holderName).toBe("TESTE · Insider de teste");
    const qr = ticketQrPayload(ticket);

    const first = await validateCode(staffV, qr, "confirm", { eventId: event.id });
    expect(first).toMatchObject({ ok: true, kind: "ticket", ticket: { isTest: true, status: "used", minAge: 18, idCheckRequired: true } });
    expect(first.ok && first.message).toMatch(/não libera entrada real/);

    const second = await validateCode(staffV, qr, "confirm", { eventId: event.id });
    expect(second).toMatchObject({ ok: false, error: "Este ingresso já foi utilizado." });

    const updated = await getLiveRepository().getEvent(event.id);
    expect(updated?.doorTestVerifiedAt).toBeTruthy();
    expect(eventReadiness(updated!).operational).toBe(true);

    const log = await listValidations({ page: 1, pageSize: 50 });
    expect(log.entries.map((e) => e.outcome).sort()).toEqual(["accepted", "refused"]);
    expect(log.entries.every((e) => e.operatorId === staffV.userId && e.isTest)).toBe(true);
  });

  it("recusa reserva não paga, ingresso de outro evento e operador sem permissão", async () => {
    const event = await createEvent(eventInput(), "admin");
    const reserved = await reserveTicket(member("1999-03-03"), { eventId: event.id, batchId: "b1" });
    const lookup = await validateCode(adminV, reserved.code, "confirm");
    expect(lookup).toMatchObject({ ok: false, error: expect.stringContaining("Pagamento pendente") });

    const other = await createEvent(eventInput({ title: "Outro" }), "admin");
    const { ticket } = await issueTestTicket(ADMIN, { eventId: event.id, batchId: "b1" });
    await expect(validateCode(staffV, ticket.code, "lookup", { eventId: other.id })).rejects.toMatchObject({ status: 409 });

    const noTickets: Validator = { role: "staff", userId: "stf_2", name: "Sem permissão", canValidateTickets: false, canValidateBenefits: true };
    await expect(validateCode(noTickets, ticket.code, "confirm")).rejects.toMatchObject({ status: 403 });
    expect((await listValidations({ page: 1, pageSize: 50, outcome: "refused" })).total).toBeGreaterThanOrEqual(3);
  });

  it("a portaria vê contagens, nunca valores", async () => {
    await createEvent(eventInput(), "admin");
    const [view] = await listDoorEvents({ staffOnly: true, fullNames: true });
    expect(Object.keys(view.stats).sort()).toEqual(["capacityLeft", "pending", "total", "used", "valid"]);
  });
});
