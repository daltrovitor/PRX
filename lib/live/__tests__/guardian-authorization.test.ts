// Hello World
import { beforeEach, describe, expect, it } from "vitest";
import { userStore } from "@/lib/auth";
import { rememberBirthDate } from "@/lib/live/buyer";
import { createEvent, getGuardianAuthorization, resendGuardianAuthorization, reserveTicket, respondGuardianAuthorization } from "@/lib/live/service";
import { checkinVerdict } from "@/lib/live/rules";
import type { EventInput } from "@/lib/live/types";

const IN_15_DAYS = new Date(Date.now() + 15 * 86_400_000).toISOString();
let seq = 0;

function eventInput(overrides: Partial<EventInput> = {}): EventInput {
  return {
    series: "session",
    title: "PRX Sunset Music & Tech",
    summary: "Evento exclusivo de celebração e networking.",
    startsAt: IN_15_DAYS,
    endsAt: null,
    venue: "PRX Arena Rooftop",
    city: "São Paulo",
    address: "Av. Paulista, 1000",
    coverUrl: "",
    capacity: 200,
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
    batches: [{ id: "b1", name: "Primeiro Lote", price: 120, quantity: null, closed: false }],
    run: null,
    ...overrides,
  };
}

function minorMember(birthDate = "2010-06-15") {
  const user = userStore.createUser(`menor${Date.now()}${++seq}@prx.dev`, `Jovem Participante ${seq}`, "Senha1234");
  void rememberBirthDate(user.id, birthDate, { source: "signup", verified: true });
  return user;
}

beforeEach(() => {
  delete (globalThis as { __prxLiveState?: unknown }).__prxLiveState;
  (globalThis as { __prxPromos?: unknown[] }).__prxPromos?.splice(0);
  (globalThis as { __prxValidationLog?: unknown[] }).__prxValidationLog?.splice(0);
});

describe("Fluxo Legal de Liberação de Menores pelo Responsável", () => {
  it("exige e-mail do responsável, cria token de liberação e bloqueia entrada na portaria enquanto pendente", async () => {
    const minor = minorMember("2010-06-15");
    const event = await createEvent(eventInput(), "admin");

    // 1. Tentar reservar sem e-mail do responsável gera erro 422
    await expect(
      reserveTicket(minor, { eventId: event.id, batchId: "b1" })
    ).rejects.toMatchObject({
      status: 422,
      message: expect.stringContaining("responsável legal"),
    });

    // 2. Reserva com e-mail do responsável é aceita e gera token
    const ticket = await reserveTicket(minor, {
      eventId: event.id,
      batchId: "b1",
      parentEmail: "mae@exemplo.com",
    });

    expect(ticket.guardianConsent).toBeDefined();
    expect(ticket.guardianConsent?.status).toBe("pending");
    expect(ticket.guardianConsent?.guardianEmail).toBe("mae@exemplo.com");
    expect(ticket.guardianConsent?.token).toBeDefined();

    // 3. Portaria recusa entrada enquanto liberação estiver pendente
    const verdict = checkinVerdict(
      { status: "valid", checkedInAt: null, guardianConsent: ticket.guardianConsent },
      { status: "published" }
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.reason).toContain("liberação do responsável legal pendente");
    }
  });

  it("recupera a tela pública de autorização do responsável pelo token", async () => {
    const minor = minorMember();
    const event = await createEvent(eventInput(), "admin");
    const ticket = await reserveTicket(minor, {
      eventId: event.id,
      batchId: "b1",
      parentEmail: "pai@exemplo.com",
    });

    const token = ticket.guardianConsent!.token;
    const authView = await getGuardianAuthorization(token);

    expect(authView.status).toBe("pending");
    expect(authView.parentEmail).toBe("pai@exemplo.com");
    expect(authView.holderName).toBe(minor.fullName);
    expect(authView.event.title).toBe(event.title);
    expect(authView.event.venue).toBe("PRX Arena Rooftop");

    // Token inexistente retorna 404
    await expect(getGuardianAuthorization("token_falso_123456")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("aprova liberação com validação de CPF e dados do responsável, liberando a entrada", async () => {
    const minor = minorMember();
    const event = await createEvent(eventInput(), "admin");
    const ticket = await reserveTicket(minor, {
      eventId: event.id,
      batchId: "b1",
      parentEmail: "responsavel@exemplo.com",
    });
    const token = ticket.guardianConsent!.token;

    // Tentativa de aprovação com nome curto falha
    await expect(
      respondGuardianAuthorization(token, {
        action: "approve",
        guardianName: "Ab",
        guardianCpf: "52998224725",
        relationship: "Pai",
      })
    ).rejects.toMatchObject({
      status: 422,
      message: expect.stringContaining("nome completo"),
    });

    // Tentativa com CPF inválido falha
    await expect(
      respondGuardianAuthorization(token, {
        action: "approve",
        guardianName: "Carlos Eduardo Silva",
        guardianCpf: "11111111111",
        relationship: "Pai",
      })
    ).rejects.toMatchObject({
      status: 422,
      message: expect.stringContaining("CPF"),
    });

    // Aprovação com dados corretos e CPF válido
    const approvedResult = await respondGuardianAuthorization(
      token,
      {
        action: "approve",
        guardianName: "Carlos Eduardo Silva",
        guardianCpf: "529.982.247-25",
        relationship: "Pai",
        guardianPhone: "(11) 99999-8888",
      },
      { ip: "201.55.12.34", userAgent: "Mozilla/5.0 PRX Test Agent" }
    );

    expect(approvedResult.status).toBe("approved");
    expect(approvedResult.consent.guardianName).toBe("Carlos Eduardo Silva");
    expect(approvedResult.consent.guardianCpf).toBe("52998224725");
    expect(approvedResult.consent.relationship).toBe("Pai");
    expect(approvedResult.consent.ip).toBe("201.55.12.34");
    expect(approvedResult.consent.respondedAt).toBeDefined();

    // Portaria agora autoriza a entrada
    const verdict = checkinVerdict(
      { status: "valid", checkedInAt: null, guardianConsent: approvedResult.consent },
      { status: "published" }
    );
    expect(verdict.ok).toBe(true);

    // Tentativa de responder novamente é bloqueada (conflito 409)
    await expect(
      respondGuardianAuthorization(token, { action: "reject" })
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("já foi concedida"),
    });
  });

  it("recusa a liberação do menor e bloqueia a portaria com motivo", async () => {
    const minor = minorMember();
    const event = await createEvent(eventInput(), "admin");
    const ticket = await reserveTicket(minor, {
      eventId: event.id,
      batchId: "b1",
      parentEmail: "tutor@exemplo.com",
    });
    const token = ticket.guardianConsent!.token;

    const rejectedResult = await respondGuardianAuthorization(
      token,
      {
        action: "reject",
        rejectionReason: "Não autorizo a ida desacompanhado neste horário.",
      },
      { ip: "189.10.20.30" }
    );

    expect(rejectedResult.status).toBe("rejected");
    expect(rejectedResult.consent.rejectionReason).toContain("Não autorizo");
    expect(rejectedResult.consent.respondedAt).toBeDefined();

    // Portaria bloqueia com mensagem explicativa
    const verdict = checkinVerdict(
      { status: "valid", checkedInAt: null, guardianConsent: rejectedResult.consent },
      { status: "published" }
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.reason).toContain("liberação recusada pelo responsável legal");
    }
  });

  it("permite reenviar o e-mail enquanto pendente e rejeita se já respondido", async () => {
    const minor = minorMember();
    const event = await createEvent(eventInput(), "admin");
    const ticket = await reserveTicket(minor, {
      eventId: event.id,
      batchId: "b1",
      parentEmail: "mae@exemplo.com",
    });

    const resend = await resendGuardianAuthorization(minor, ticket.id);
    expect(resend.success).toBe(true);
    expect(resend.parentEmail).toBe("mae@exemplo.com");

    // Aprova
    await respondGuardianAuthorization(ticket.guardianConsent!.token, {
      action: "approve",
      guardianName: "Mariana Souza",
      guardianCpf: "52998224725",
      relationship: "Mãe",
    });

    // Reenviar após aprovação gera erro 409
    await expect(resendGuardianAuthorization(minor, ticket.id)).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("já foi aprovada"),
    });
  });
});
