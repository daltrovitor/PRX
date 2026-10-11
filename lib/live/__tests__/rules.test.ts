// Hello World
import { describe, expect, it } from "vitest";
import {
  batchAvailability,
  canValidateEvent,
  checkReservation,
  checkinVerdict,
  checkinWindowIssue,
  eventHasEnded,
  parseRunResults,
  parseTicketCode,
  ticketQrPayload,
} from "@/lib/live/rules";
import { eventInputSchema, runDetailsInputSchema, type LiveEvent, type TicketStatus } from "@/lib/live/types";
import { detectKind } from "@/lib/validation";

const NOW = new Date("2026-10-01T12:00:00-03:00");

function event(overrides: Partial<LiveEvent> = {}): LiveEvent {
  return {
    id: "evt_1",
    series: "session",
    title: "Session Sunset",
    summary: "Line-up independente e pista ao ar livre.",
    startsAt: "2026-10-31T16:00:00-03:00",
    endsAt: null,
    venue: "Arena Zona Oeste",
    city: "São Paulo, SP",
    address: "",
    coverUrl: "",
    capacity: null,
    perUserLimit: 1,
    minPrxLevel: 1,
    partnerId: null,
    partnerName: null,
    staffCheckin: true,
    minAge: 0,
    idCheckRequired: false,
    entryRequirements: "",
    cancellationPolicy: "",
    organizerName: "",
    doorTestVerifiedAt: null,
    doorTestVerifiedBy: null,
    status: "published",
    batches: [
      { id: "b1", name: "1º lote", price: 49.9, quantity: 2, closed: false },
      { id: "b2", name: "2º lote", price: 69.9, quantity: null, closed: false },
    ],
    run: null,
    createdBy: "admin@prx.dev",
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

const tickets = (...list: Array<[string, TicketStatus]>) => list.map(([batchId, status]) => ({ batchId, status }));

describe("disponibilidade de lotes", () => {
  it("conta reservas pendentes, válidos e usados; cancelados liberam o lugar", () => {
    const [b1] = batchAvailability(event(), tickets(["b1", "pending_payment"], ["b1", "cancelled"]));
    expect(b1.sold).toBe(1);
    expect(b1.remaining).toBe(1);
    expect(b1.available).toBe(true);
  });

  it("esgota o lote pela quantidade e o evento pela lotação total", () => {
    const [b1] = batchAvailability(event(), tickets(["b1", "valid"], ["b1", "used"]));
    expect(b1.available).toBe(false);
    const [, b2] = batchAvailability(event({ capacity: 2 }), tickets(["b1", "valid"], ["b1", "valid"]));
    expect(b2.remaining).toBe(0);
    expect(b2.available).toBe(false);
  });

  it("lote encerrado nunca fica disponível", () => {
    const [b1] = batchAvailability(event({ batches: [{ id: "b1", name: "Lote", price: 0, quantity: null, closed: true }] }), []);
    expect(b1.available).toBe(false);
  });
});

describe("reserva", () => {
  const base = { batchId: "b2", eventTickets: [], memberTickets: [], memberLevel: 3, now: NOW };

  it("aceita evento publicado, antes do início, dentro dos limites", () => {
    expect(checkReservation({ ...base, event: event() })).toMatchObject({ ok: true });
  });

  it("recusa rascunho, cancelado e evento já iniciado", () => {
    expect(checkReservation({ ...base, event: event({ status: "draft" }) }).ok).toBe(false);
    expect(checkReservation({ ...base, event: event({ status: "cancelled" }) })).toEqual({ ok: false, reason: "Este evento foi cancelado." });
    expect(checkReservation({ ...base, event: event({ startsAt: "2026-09-30T10:00:00-03:00" }) }).ok).toBe(false);
  });

  it("respeita nível mínimo e limite por pessoa", () => {
    expect(checkReservation({ ...base, event: event({ minPrxLevel: 5 }) })).toEqual({ ok: false, reason: "Disponível a partir do nível 5." });
    expect(checkReservation({ ...base, event: event(), memberTickets: [{ status: "valid" }] }).ok).toBe(false);
    expect(checkReservation({ ...base, event: event(), memberTickets: [{ status: "cancelled" }] }).ok).toBe(true);
  });

  it("recusa lote esgotado", () => {
    const result = checkReservation({ ...base, batchId: "b1", event: event(), eventTickets: tickets(["b1", "valid"], ["b1", "pending_payment"]) });
    expect(result).toEqual({ ok: false, reason: "Este lote esgotou." });
  });
});

describe("portaria", () => {
  it("admin valida tudo; parceiro só o evento ligado a ele; equipe só com permissão e evento liberado", () => {
    const linked = event({ partnerId: "ptn_a", staffCheckin: false });
    expect(canValidateEvent({ role: "admin" }, linked)).toBe(true);
    expect(canValidateEvent({ role: "partner", partnerId: "ptn_a" }, linked)).toBe(true);
    expect(canValidateEvent({ role: "partner", partnerId: "ptn_b" }, linked)).toBe(false);
    expect(canValidateEvent({ role: "partner", partnerId: "ptn_a" }, event())).toBe(false);
    expect(canValidateEvent({ role: "staff", canValidateTickets: true }, linked)).toBe(false);
    expect(canValidateEvent({ role: "staff", canValidateTickets: true }, event())).toBe(true);
    expect(canValidateEvent({ role: "staff", canValidateTickets: false }, event())).toBe(false);
  });

  it("só ingresso válido de evento não cancelado passa", () => {
    const e = event();
    expect(checkinVerdict({ status: "valid", checkedInAt: null }, e)).toEqual({ ok: true });
    expect(checkinVerdict({ status: "pending_payment", checkedInAt: null }, e).ok).toBe(false);
    expect(checkinVerdict({ status: "used", checkedInAt: NOW.toISOString() }, e)).toEqual({ ok: false, reason: "Este ingresso já foi utilizado." });
    expect(checkinVerdict({ status: "valid", checkedInAt: null }, event({ status: "cancelled" })).ok).toBe(false);
  });

  it("portaria abre 12h antes e fecha no fim (ou 12h após o início)", () => {
    const e = event({ startsAt: "2026-10-01T20:00:00-03:00" });
    expect(checkinWindowIssue(e, new Date("2026-10-01T07:00:00-03:00"))).toMatch(/abre 12h antes/);
    expect(checkinWindowIssue(e, new Date("2026-10-01T19:00:00-03:00"))).toBeNull();
    expect(checkinWindowIssue(e, new Date("2026-10-02T09:00:00-03:00"))).toBe("Este evento já terminou.");
    expect(eventHasEnded(event({ startsAt: "2026-10-01T20:00:00-03:00", endsAt: "2026-10-02T04:00:00-03:00" }), new Date("2026-10-02T03:00:00-03:00"))).toBe(false);
  });
});

describe("códigos", () => {
  it("lê o QR do ingresso e o código digitado", () => {
    const payload = ticketQrPayload({ code: "UP-AB12-CD34", eventId: "evt_1" });
    expect(payload).toBe("PRX_LIVE::UP-AB12-CD34::evt_1");
    expect(parseTicketCode(payload)).toBe("UP-AB12-CD34");
    expect(parseTicketCode(" run-ab12-cd34 ")).toBe("RUN-AB12-CD34");
    expect(parseTicketCode("PRX-1234-5678")).toBeNull();
  });

  it("separa ingresso de voucher pelo formato", () => {
    expect(detectKind("PRX_LIVE::UP-AB12-CD34::evt_1")).toBe("ticket");
    expect(detectKind("RUN-AB12-CD34")).toBe("ticket");
    expect(detectKind("PRX_PASS::PRX-1234-5678::Café")).toBe("voucher");
    expect(detectKind("PRX-1234-5678")).toBe("voucher");
  });
});

describe("resultados da PRX RUN", () => {
  it("aceita ponto e vírgula, tab e vírgula e ignora cabeçalho", () => {
    const { results, errors } = parseRunResults("posição;nome;categoria;distância;tempo\n1;Ana Souza;Sub-23;10K;38:12\n2\tBruno Lima\tGeral\t10k\t39:05\n\n3, Caio, Geral, 5k, 18:01");
    expect(errors).toEqual([]);
    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({ position: 1, name: "Ana Souza", category: "Sub-23", modality: "10k", time: "38:12" });
    expect(results[2].name).toBe("Caio");
  });

  it("aponta linhas inválidas", () => {
    expect(parseRunResults("x;Ana\n2;").errors).toEqual(["Linha 1: posição inválida.", "Linha 2: informe o nome."]);
  });
});

describe("cadastro de evento", () => {
  const valid = {
    series: "session",
    title: "Session Sunset",
    summary: "Line-up independente e pista ao ar livre.",
    startsAt: "2026-10-31T19:00:00.000Z",
    venue: "Arena",
    city: "São Paulo, SP",
    batches: [{ id: "b1", name: "Lote", price: 0 }],
  };

  it("aplica padrões: rascunho, 1 por pessoa, equipe liberada, sem parceiro", () => {
    const parsed = eventInputSchema.parse(valid);
    expect(parsed).toMatchObject({ status: "draft", perUserLimit: 1, staffCheckin: true, partnerId: null, capacity: null, endsAt: null });
  });

  it("exige fim depois do início, lotes únicos e configuração da RUN", () => {
    expect(eventInputSchema.safeParse({ ...valid, endsAt: "2026-10-30T19:00:00.000Z" }).success).toBe(false);
    expect(eventInputSchema.safeParse({ ...valid, batches: [valid.batches[0], valid.batches[0]] }).success).toBe(false);
    expect(eventInputSchema.safeParse({ ...valid, series: "run" }).success).toBe(false);
    expect(eventInputSchema.safeParse({ ...valid, series: "run", run: { modalities: ["5k"], categories: ["Geral"] } }).success).toBe(true);
  });

  it("inscrição na RUN exige aceite do termo", () => {
    expect(runDetailsInputSchema.safeParse({ modality: "5k", category: "Geral", shirtSize: "M", acceptedTerms: false }).success).toBe(false);
    expect(runDetailsInputSchema.safeParse({ modality: "5k", category: "Geral", shirtSize: "M", acceptedTerms: true }).success).toBe(true);
  });
});
