// Hello World
import { describe, expect, it } from "vitest";
import { ageRatingLabel, checkAgeEligibility } from "@/lib/live/age";
import { applyPromo, normalizePromoCode, promoInputSchema, promoIssue, type PromoCode } from "@/lib/live/promo";
import { eventReadiness } from "@/lib/live/readiness";
import { batchAvailability, purchaseCode } from "@/lib/live/rules";
import { eventInputSchema, type LiveEvent } from "@/lib/live/types";

const PARTY = "2026-11-21T22:00:00-03:00";

describe("idade por evento", () => {
  it("rótulos da classificação", () => {
    expect(ageRatingLabel(null)).toBe("Classificação a definir");
    expect(ageRatingLabel(0)).toBe("Livre");
    expect(ageRatingLabel(18)).toBe("18+");
  });

  it("sem a data de nascimento qualquer evento pede a data (é ela que diz se a pessoa é menor de idade)", () => {
    expect(checkAgeEligibility(0, null, PARTY)).toMatchObject({ ok: false, code: "BIRTH_DATE_REQUIRED" });
    expect(checkAgeEligibility(null, null, PARTY)).toMatchObject({ ok: false, code: "BIRTH_DATE_REQUIRED" });
    // Maior de idade, livre ou sem regra: compra direto, sem e-mail de responsável.
    expect(checkAgeEligibility(0, "1998-02-02", PARTY)).toEqual({ ok: true, isMinor: false, requiresParentEmail: false });
    expect(checkAgeEligibility(null, "1998-02-02", PARTY)).toEqual({ ok: true, isMinor: false, requiresParentEmail: false });
  });

  it("evento 18+ pede a data e recusa quem não tem 18 no dia do evento (Brasília)", () => {
    expect(checkAgeEligibility(18, null, PARTY)).toMatchObject({ ok: false, code: "BIRTH_DATE_REQUIRED" });
    // 16 anos: conta PRX válida (mínimo 12), mas não compra evento 18+, nem com a liberação do responsável.
    expect(checkAgeEligibility(18, "2010-05-01", PARTY)).toMatchObject({ ok: false, code: "UNDER_AGE", reason: expect.stringContaining("menores de 18") });
    // Faz 18 no próprio dia do evento: pode.
    expect(checkAgeEligibility(18, "2008-11-21", PARTY)).toMatchObject({ ok: true, isMinor: false });
    // Faz 18 no dia seguinte: não pode.
    expect(checkAgeEligibility(18, "2008-11-22", PARTY)).toMatchObject({ ok: false, code: "UNDER_AGE" });
  });

  it("menor de 18 anos entra em evento abaixo de 18 só com a liberação do responsável; menor de 12 nunca", () => {
    // 16 anos em evento 16+ e 14 anos em evento 16+: ambos pedem o e-mail do responsável.
    expect(checkAgeEligibility(16, "2010-05-01", PARTY)).toEqual({ ok: true, isMinor: true, requiresParentEmail: true });
    expect(checkAgeEligibility(16, "2012-05-01", PARTY)).toEqual({ ok: true, isMinor: true, requiresParentEmail: true });
    expect(checkAgeEligibility(0, "2010-05-01", PARTY)).toEqual({ ok: true, isMinor: true, requiresParentEmail: true });
    // Abaixo de 12 anos não há conta nem liberação.
    expect(checkAgeEligibility(0, "2018-05-01", PARTY)).toMatchObject({ ok: false, code: "UNDER_AGE" });
  });
});

const promo = (overrides: Partial<PromoCode> = {}): PromoCode => ({
  id: "p1",
  eventId: "evt_1",
  code: "AMIGOS10",
  label: "",
  kind: "percent",
  value: 10,
  batchIds: null,
  startsAt: null,
  endsAt: null,
  maxUses: null,
  perUserLimit: 1,
  active: true,
  createdBy: "admin",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  ...overrides,
});

describe("cupons", () => {
  const batch = { id: "b1", price: 80 };
  const now = new Date("2026-10-11T12:00:00Z");

  it("normaliza o código digitado", () => {
    expect(normalizePromoCode(" amigos 10 ")).toBe("AMIGOS10");
    expect(normalizePromoCode("ç!")).toBeNull();
    expect(normalizePromoCode(42)).toBeNull();
  });

  it("calcula percentual e valor fixo no servidor, sem passar do preço", () => {
    expect(applyPromo(80, { kind: "percent", value: 10 })).toEqual({ original: 80, discount: 8, total: 72 });
    expect(applyPromo(49.9, { kind: "percent", value: 15 })).toEqual({ original: 49.9, discount: 7.49, total: 42.41 });
    expect(applyPromo(30, { kind: "fixed", value: 50 })).toEqual({ original: 30, discount: 30, total: 0 });
    expect(applyPromo(30, null)).toEqual({ original: 30, discount: 0, total: 30 });
  });

  it("recusa inativo, outro evento, fora da validade, lote errado e ingresso grátis", () => {
    expect(promoIssue(promo(), { eventId: "evt_1", batch, now })).toBeNull();
    expect(promoIssue(promo({ active: false }), { eventId: "evt_1", batch, now })).toMatch(/não está ativo/);
    expect(promoIssue(promo({ active: false }), { eventId: "evt_1", batch, now, allowInactive: true })).toBeNull();
    expect(promoIssue(promo(), { eventId: "evt_2", batch, now })).toMatch(/não vale para este evento/);
    expect(promoIssue(promo({ endsAt: "2026-10-10T00:00:00Z" }), { eventId: "evt_1", batch, now })).toMatch(/expirou/);
    expect(promoIssue(promo({ startsAt: "2026-10-12T00:00:00Z" }), { eventId: "evt_1", batch, now })).toMatch(/ainda não começou/);
    expect(promoIssue(promo({ batchIds: ["b2"] }), { eventId: "evt_1", batch, now })).toMatch(/lote escolhido/);
    expect(promoIssue(promo(), { eventId: "evt_1", batch: { id: "b1", price: 0 }, now })).toMatch(/gratuito/);
  });

  it("valida o cadastro: percentual até 100 e fim depois do início", () => {
    const base = { eventId: "evt_1", code: "x1x", kind: "percent", value: 10 };
    expect(promoInputSchema.safeParse(base).success).toBe(true);
    expect(promoInputSchema.safeParse({ ...base, value: 120 }).success).toBe(false);
    expect(promoInputSchema.safeParse({ ...base, startsAt: "2026-11-02T00:00:00Z", endsAt: "2026-11-01T00:00:00Z" }).success).toBe(false);
    // Nasce inativo: o admin pré-visualiza antes de divulgar.
    expect(promoInputSchema.parse(base).active).toBe(false);
  });
});

const readyEvent = (overrides: Partial<LiveEvent> = {}) => ({
  venue: "Antonieta",
  city: "Cidade",
  address: "",
  capacity: null,
  minAge: 18,
  idCheckRequired: true,
  organizerName: "Organizador",
  cancellationPolicy: "Cancelamento até 48 h antes com reembolso integral.",
  batches: [{ id: "lista", name: "Lista", price: 0, quantity: null, closed: false }],
  staffCheckin: true,
  partnerId: null,
  status: "draft" as const,
  doorTestVerifiedAt: null,
  ...overrides,
});

describe("cadastro do evento", () => {
  it("idade mínima vazia continua vazia (não vira Livre)", () => {
    const input = {
      series: "session",
      title: "Evento",
      summary: "Descrição de teste longa.",
      startsAt: PARTY,
      venue: "Local",
      city: "Cidade",
      batches: [{ id: "b", name: "Lote", price: 10 }],
    };
    expect(eventInputSchema.parse({ ...input, minAge: null }).minAge).toBeNull();
    expect(eventInputSchema.parse(input).minAge).toBeNull();
    expect(eventInputSchema.parse({ ...input, minAge: "18" }).minAge).toBe(18);
    expect(eventInputSchema.parse({ ...input, minAge: 0 }).minAge).toBe(0);
  });
});

describe("prontidão do evento", () => {
  it("aponta o que falta e não inventa valores", () => {
    const r = eventReadiness(readyEvent({ minAge: null, organizerName: "", cancellationPolicy: "" }));
    expect(r.publishable).toBe(false);
    expect(r.missing).toEqual(["Classificação etária", "Organizador", "Política de cancelamento"]);
  });

  it("evento com idade mínima precisa conferir documento na portaria", () => {
    expect(eventReadiness(readyEvent({ idCheckRequired: false })).missing).toContain("Documento na portaria");
  });

  it("publicável não é operacional sem o teste de portaria", () => {
    const r = eventReadiness(readyEvent({ status: "published" }));
    expect(r.publishable).toBe(true);
    expect(r.operational).toBe(false);
    expect(eventReadiness(readyEvent({ status: "published", doorTestVerifiedAt: "2026-10-11T12:00:00Z" })).operational).toBe(true);
  });
});

describe("ingressos de teste e código do pedido", () => {
  it("teste não ocupa lugar", () => {
    const [a] = batchAvailability({ batches: [{ id: "b", name: "b", price: 10, quantity: 1, closed: false }], capacity: 1 }, [{ batchId: "b", status: "valid", isTest: true }]);
    expect(a.available).toBe(true);
  });

  it("código do pedido é estável e não revela o id", () => {
    expect(purchaseCode("tkt_abc")).toBe(purchaseCode("tkt_abc"));
    expect(purchaseCode("tkt_abc")).toMatch(/^PED-[0-9A-Z]{7}$/);
    expect(purchaseCode("tkt_abc")).not.toBe(purchaseCode("tkt_abd"));
  });
});
