// Hello World
import { beforeEach, describe, expect, it } from "vitest";
import { userStore } from "@/lib/auth";
import { rememberBirthDate } from "@/lib/live/buyer";
import { getLiveRepository } from "@/lib/live/repository";
import {
  cancelOwnTicket,
  createEvent,
  eventAttendees,
  getGuardianAuthorization,
  memberWallet,
  resendGuardianAuthorization,
  reserveTicket,
  respondGuardianAuthorization,
} from "@/lib/live/service";
import { checkinVerdict } from "@/lib/live/rules";
import type { EventInput, GuardianConsent } from "@/lib/live/types";

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

/** O que o app do menor nunca recebe: o consentimento completo, direto do repositório. */
async function consentOf(ticketId: string): Promise<GuardianConsent> {
  const ticket = await getLiveRepository().getTicket(ticketId);
  return ticket!.guardianConsent!;
}

const approveInput = { action: "approve", guardianName: "Carlos Eduardo Silva", guardianCpf: "529.982.247-25", relationship: "Pai", guardianBirthDate: "1978-03-04", consentAccepted: true } as const;

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
    await expect(reserveTicket(minor, { eventId: event.id, batchId: "b1" })).rejects.toMatchObject({
      status: 422,
      message: expect.stringContaining("responsável legal"),
    });

    // 2. Reserva com e-mail do responsável é aceita; o app mostra só o estado e o e-mail parcial
    const ticket = await reserveTicket(minor, { eventId: event.id, batchId: "b1", parentEmail: "mae@exemplo.com" });
    expect(ticket.guardianConsent).toEqual({ status: "pending", guardianEmail: "m***@exemplo.com", guardianName: null, respondedAt: null });

    // 3. O token do link existe no servidor, mas nunca chega ao app do menor (ele poderia se liberar sozinho)
    const raw = await consentOf(ticket.id);
    expect(raw.token).toMatch(/^[0-9a-f]{48}$/);
    expect(raw.guardianEmail).toBe("mae@exemplo.com");
    expect(JSON.stringify(ticket)).not.toContain(raw.token);
    expect(JSON.stringify(await memberWallet(minor))).not.toContain(raw.token);

    // 4. Portaria recusa entrada enquanto a liberação estiver pendente
    const verdict = checkinVerdict({ status: "valid", checkedInAt: null, guardianConsent: raw }, { status: "published" });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain("liberação do responsável legal pendente");
  });

  it("recupera a tela pública de autorização do responsável pelo token, sem expor token nem IP", async () => {
    const minor = minorMember();
    const event = await createEvent(eventInput(), "admin");
    const ticket = await reserveTicket(minor, { eventId: event.id, batchId: "b1", parentEmail: "pai@exemplo.com" });

    const { token } = await consentOf(ticket.id);
    const authView = await getGuardianAuthorization(token);

    expect(authView.status).toBe("pending");
    expect(authView.parentEmail).toBe("pai@exemplo.com");
    expect(authView.holderName).toBe(minor.fullName);
    expect(authView.childEmail).toBe(`${minor.email.slice(0, 1)}***@${minor.email.split("@")[1]}`);
    expect(authView.event.title).toBe(event.title);
    expect(authView.event.venue).toBe("PRX Arena Rooftop");
    expect(authView.consent).not.toHaveProperty("token");
    expect(authView.consent).not.toHaveProperty("ip");

    // Token inexistente retorna 404
    await expect(getGuardianAuthorization("token_falso_123456")).rejects.toMatchObject({ status: 404 });
  });

  it("aprova liberação com validação de CPF e dados do responsável, liberando a entrada", async () => {
    const minor = minorMember();
    const event = await createEvent(eventInput(), "admin");
    const ticket = await reserveTicket(minor, { eventId: event.id, batchId: "b1", parentEmail: "responsavel@exemplo.com" });
    const { token } = await consentOf(ticket.id);

    // Tentativa de aprovação com nome curto falha
    await expect(respondGuardianAuthorization(token, { ...approveInput, guardianName: "Ab" })).rejects.toMatchObject({
      status: 422,
      message: expect.stringContaining("nome completo"),
    });

    // Tentativa com CPF inválido falha
    await expect(respondGuardianAuthorization(token, { ...approveInput, guardianCpf: "11111111111" })).rejects.toMatchObject({
      status: 422,
      message: expect.stringContaining("CPF"),
    });

    // Aprovação com dados corretos e CPF válido
    const approvedResult = await respondGuardianAuthorization(
      token,
      { ...approveInput, guardianPhone: "(11) 99999-8888" },
      { ip: "201.55.12.34", userAgent: "Mozilla/5.0 PRX Test Agent" }
    );

    // A resposta do link mostra o CPF só em parte e nunca devolve IP nem token
    expect(approvedResult.status).toBe("approved");
    expect(approvedResult.consent.guardianName).toBe("Carlos Eduardo Silva");
    expect(approvedResult.consent.guardianCpf).toBe("***.982.247-**");
    expect(approvedResult.consent.relationship).toBe("Pai");
    expect(approvedResult.consent.respondedAt).toBeTruthy();
    expect(approvedResult.consent).not.toHaveProperty("ip");
    expect(approvedResult.consent).not.toHaveProperty("token");

    // O registro completo (para eventual prova da liberação) fica guardado no ingresso
    const raw = await consentOf(ticket.id);
    expect(raw).toMatchObject({ status: "approved", guardianCpf: "52998224725", ip: "201.55.12.34", userAgent: "Mozilla/5.0 PRX Test Agent", token });

    // Portaria agora autoriza a entrada
    expect(checkinVerdict({ status: "valid", checkedInAt: null, guardianConsent: raw }, { status: "published" }).ok).toBe(true);

    // Tentativa de responder novamente é bloqueada (conflito 409)
    await expect(respondGuardianAuthorization(token, { action: "reject" })).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("já foi concedida"),
    });
  });

  it("a primeira resposta vence: gravar por cima de uma liberação já respondida não faz nada", async () => {
    const minor = minorMember();
    const event = await createEvent(eventInput(), "admin");
    const ticket = await reserveTicket(minor, { eventId: event.id, batchId: "b1", parentEmail: "pai@exemplo.com" });
    const { token } = await consentOf(ticket.id);
    await respondGuardianAuthorization(token, approveInput);

    // Duas abas abertas: a segunda chega tarde e tenta recusar direto no repositório.
    const raw = await consentOf(ticket.id);
    expect(await getLiveRepository().updateGuardianConsent(ticket.id, { ...raw, status: "rejected" })).toBeNull();
    expect((await consentOf(ticket.id)).status).toBe("approved");
  });

  it("recusa a liberação do menor e bloqueia a portaria com motivo", async () => {
    const minor = minorMember();
    const event = await createEvent(eventInput(), "admin");
    const ticket = await reserveTicket(minor, { eventId: event.id, batchId: "b1", parentEmail: "tutor@exemplo.com" });
    const { token } = await consentOf(ticket.id);

    const rejectedResult = await respondGuardianAuthorization(token, { action: "reject", rejectionReason: "Não autorizo a ida desacompanhado neste horário." }, { ip: "189.10.20.30" });

    expect(rejectedResult.status).toBe("rejected");
    expect(rejectedResult.consent.rejectionReason).toContain("Não autorizo");
    expect(rejectedResult.consent.respondedAt).toBeTruthy();

    // O app do menor só sabe que foi recusada
    const wallet = await memberWallet(minor);
    expect(wallet.tickets[0].guardianConsent).toMatchObject({ status: "rejected", guardianName: null });

    // Portaria bloqueia com mensagem explicativa
    const verdict = checkinVerdict({ status: "valid", checkedInAt: null, guardianConsent: await consentOf(ticket.id) }, { status: "published" });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain("liberação recusada pelo responsável legal");
  });

  it("não libera ingresso cancelado", async () => {
    const minor = minorMember();
    const event = await createEvent(eventInput(), "admin");
    const ticket = await reserveTicket(minor, { eventId: event.id, batchId: "b1", parentEmail: "pai@exemplo.com" });
    const { token } = await consentOf(ticket.id);

    await cancelOwnTicket(minor, ticket.id);
    // Cancelar mexe na nota do ingresso, mas a liberação continua intacta no registro
    expect((await consentOf(ticket.id)).status).toBe("pending");
    await expect(respondGuardianAuthorization(token, approveInput)).rejects.toMatchObject({ status: 409, message: expect.stringContaining("cancelado") });
  });

  it("o admin vê a liberação sem o token do link, sem IP e com o CPF só em parte", async () => {
    const minor = minorMember();
    const event = await createEvent(eventInput(), "admin");
    const ticket = await reserveTicket(minor, { eventId: event.id, batchId: "b1", parentEmail: "pai@exemplo.com" });
    const { token } = await consentOf(ticket.id);
    await respondGuardianAuthorization(token, approveInput, { ip: "201.55.12.34", userAgent: "Agente de teste" });

    const attendee = (await eventAttendees(event.id)).tickets.find((t) => t.id === ticket.id);
    expect(attendee?.guardianConsent).toMatchObject({ status: "approved", guardianName: "Carlos Eduardo Silva", guardianCpf: "***.982.247-**", token: "", ip: null, userAgent: null });
  });

  it("permite reenviar o e-mail enquanto pendente (com limite) e rejeita se já respondido", async () => {
    const minor = minorMember();
    const event = await createEvent(eventInput(), "admin");
    const ticket = await reserveTicket(minor, { eventId: event.id, batchId: "b1", parentEmail: "mae@exemplo.com" });

    const resend = await resendGuardianAuthorization(minor, ticket.id);
    expect(resend).toEqual({ success: true, parentEmail: "m***@exemplo.com" });

    // No máximo 3 reenvios por hora por ingresso: não lota a caixa de entrada do responsável.
    await resendGuardianAuthorization(minor, ticket.id);
    await resendGuardianAuthorization(minor, ticket.id);
    await expect(resendGuardianAuthorization(minor, ticket.id)).rejects.toMatchObject({ status: 429 });

    // Aprova
    await respondGuardianAuthorization((await consentOf(ticket.id)).token, { action: "approve", guardianName: "Mariana Souza", guardianCpf: "52998224725", relationship: "Mãe", guardianBirthDate: "1980-01-01", consentAccepted: true });

    // Reenviar após aprovação gera erro 409
    await expect(resendGuardianAuthorization(minor, ticket.id)).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("já foi aprovada"),
    });
  });
});
