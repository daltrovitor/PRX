// Hello World
import { PartnerError } from "@/lib/partners/errors";
import { getLiveRepository } from "@/lib/live/repository";
import { doorName } from "@/lib/live/service";
import { canValidateEvent, checkinVerdict, checkinWindowIssue, parseTicketCode, purchaseCode, VALIDATOR_LABEL, type CheckinActor } from "@/lib/live/rules";
import { ageRatingLabel } from "@/lib/live/age";
import { recordValidation } from "@/lib/validation/log";
import { SERIES_LABEL, TICKET_STATUS_LABEL, type LiveEvent, type LiveTicket, type TicketStatus } from "@/lib/live/types";
import { displayDate } from "@/lib/validation/vouchers";
import type { Validator } from "@/lib/validation/actor";

/**
 * Portaria do PRX LIVE. Admin valida qualquer evento; parceiro, só os eventos
 * ligados a ele; equipe PRX, os eventos com "equipe na portaria" ligado.
 */

export function checkinActor(validator: Validator): CheckinActor {
  if (validator.role === "admin") return { role: "admin" };
  if (validator.role === "partner") return { role: "partner", partnerId: validator.partner.id };
  return { role: "staff", canValidateTickets: validator.canValidateTickets };
}

export interface DoorTicket {
  id: string;
  code: string;
  eventId: string;
  eventTitle: string;
  seriesLabel: string;
  eventStartsAt: string | null;
  venue: string;
  batchName: string;
  holderName: string;
  status: TicketStatus;
  statusLabel: string;
  source: LiveTicket["source"];
  checkedInAt: string | null;
  checkedInAtIso: string | null;
  checkedInBy: string | null;
  run: { modality: string; category: string; shirtSize: string } | null;
  /** Ingresso de teste: a portaria registra, mas não é entrada real. */
  isTest: boolean;
  purchaseCode: string;
  /** Regras de entrada do evento para conferir na porta. */
  minAge: number | null;
  ageRating: string;
  idCheckRequired: boolean;
  entryRequirements: string;
  guardianApproved?: boolean;
  guardianStatus?: string | null;
  guardianName?: string | null;
}

export interface DoorOptions {
  /** Evento escolhido na portaria: ingresso de outro evento é recusado. */
  eventId?: string;
}

/** Parceiro vê primeiro nome + inicial (LGPD); equipe e admin veem o nome completo para conferir documento. */
export function doorView(ticket: LiveTicket, event: LiveEvent, validator: Validator): DoorTicket {
  return {
    id: ticket.id,
    code: ticket.code,
    eventId: event.id,
    eventTitle: event.title,
    seriesLabel: SERIES_LABEL[event.series],
    eventStartsAt: displayDate(event.startsAt),
    venue: event.venue,
    batchName: ticket.batchName,
    holderName: validator.role === "partner" ? doorName(ticket.holderName) : ticket.holderName,
    status: ticket.status,
    statusLabel: TICKET_STATUS_LABEL[ticket.status],
    source: ticket.source,
    checkedInAt: displayDate(ticket.checkedInAt),
    checkedInAtIso: ticket.checkedInAt,
    checkedInBy: ticket.checkedInByRole ? (ticket.checkedInByName ? `${ticket.checkedInByName} (${VALIDATOR_LABEL[ticket.checkedInByRole]})` : VALIDATOR_LABEL[ticket.checkedInByRole]) : null,
    run: ticket.runDetails ? { modality: ticket.runDetails.modality, category: ticket.runDetails.category, shirtSize: ticket.runDetails.shirtSize } : null,
    isTest: ticket.isTest,
    purchaseCode: purchaseCode(ticket.id),
    minAge: event.minAge,
    ageRating: ageRatingLabel(event.minAge),
    idCheckRequired: event.idCheckRequired,
    entryRequirements: event.entryRequirements,
    guardianApproved: ticket.guardianConsent?.status === "approved",
    guardianStatus: ticket.guardianConsent?.status ?? null,
    guardianName: ticket.guardianConsent?.guardianName ?? null,
  };
}

export type TicketOutcome =
  | { ok: true; canCheckin: boolean; warning: string | null; message?: string; ticket: DoorTicket }
  | { ok: false; status: 400 | 409; error: string; ticket: DoorTicket };

async function locate(validator: Validator, raw: string, options: DoorOptions = {}): Promise<{ ticket: LiveTicket; event: LiveEvent }> {
  if (validator.role === "staff" && !validator.canValidateTickets) throw new PartnerError("Seu acesso da equipe não inclui validação de ingressos.", 403);
  const code = parseTicketCode(raw);
  if (!code) throw new PartnerError("Código de ingresso inválido. O formato é UP-0000-0000 ou RUN-0000-0000.", 400);
  const repo = getLiveRepository();
  const ticket = await repo.getTicketByCode(code);
  if (!ticket) throw new PartnerError(`Ingresso '${code}' não encontrado.`, 404);
  const event = await repo.getEvent(ticket.eventId);
  if (!event) throw new PartnerError("O evento deste ingresso não existe mais.", 404);

  if (!canValidateEvent(checkinActor(validator), event)) {
    throw new PartnerError(
      validator.role === "partner"
        ? "Este ingresso é de um evento que não está ligado ao seu estabelecimento."
        : "Este evento não aceita validação pela equipe PRX. Peça ao admin para liberar.",
      403
    );
  }
  if (options.eventId && ticket.eventId !== options.eventId) {
    throw new PartnerError(`Este ingresso é de outro evento (${event.title}). Confira o evento selecionado na portaria.`, 409);
  }
  return { ticket, event };
}

function blockingIssue(ticket: LiveTicket, event: LiveEvent): string | null {
  const verdict = checkinVerdict(ticket, event);
  if (!verdict.ok) return verdict.reason;
  // Ingresso de teste vale a qualquer hora: é como a PRX testa a portaria antes do evento.
  return ticket.isTest ? null : checkinWindowIssue(event);
}

const logBase = (ticket: LiveTicket, event: LiveEvent) => ({ kind: "ticket" as const, code: ticket.code, refId: ticket.id, eventId: event.id, partnerId: event.partnerId, isTest: ticket.isTest });

/**
 * Teste de portaria: um ingresso de teste já usado foi lido de novo e recusado.
 * Isso prova a entrada registrada e o bloqueio da segunda leitura no evento real.
 */
async function markDoorTested(ticket: LiveTicket, event: LiveEvent, validator: Validator): Promise<void> {
  if (!ticket.isTest || ticket.status !== "used" || event.doorTestVerifiedAt) return;
  try {
    await getLiveRepository().updateEvent(event.id, { doorTestVerifiedAt: new Date().toISOString(), doorTestVerifiedBy: `${validator.name} (${VALIDATOR_LABEL[validator.role]})`.slice(0, 160) });
  } catch {
    console.warn("[prx:door-test] não foi possível marcar o teste de portaria");
  }
}

export async function lookupTicket(validator: Validator, raw: string, options: DoorOptions = {}): Promise<TicketOutcome> {
  const { ticket, event } = await locate(validator, raw, options);
  const issue = blockingIssue(ticket, event);
  const warning =
    ticket.status === "used" && ticket.checkedInAt ? `Este ingresso já entrou em ${displayDate(ticket.checkedInAt)}.` : issue;
  if (issue) {
    await recordValidation(validator, { ...logBase(ticket, event), action: "lookup", outcome: "refused", reason: warning ?? issue });
    await markDoorTested(ticket, event, validator);
  }
  return { ok: true, canCheckin: !issue, warning, ticket: doorView(ticket, event, validator) };
}

export async function checkinTicket(validator: Validator, raw: string, options: DoorOptions = {}): Promise<TicketOutcome> {
  const { ticket, event } = await locate(validator, raw, options);
  const issue = blockingIssue(ticket, event);
  if (issue) {
    await recordValidation(validator, { ...logBase(ticket, event), action: "confirm", outcome: "refused", reason: issue });
    await markDoorTested(ticket, event, validator);
    return { ok: false, status: ticket.status === "used" ? 400 : 409, error: issue, ticket: doorView(ticket, event, validator) };
  }

  // Baixa condicional: duas portarias lendo o mesmo QR não passam as duas.
  const updated = await getLiveRepository().updateTicket(
    ticket.id,
    { status: "used", checkedInAt: new Date().toISOString(), checkedInBy: validator.userId, checkedInByRole: validator.role, checkedInByName: validator.name.slice(0, 120) },
    ["valid"]
  );
  if (!updated) {
    const fresh = (await getLiveRepository().getTicket(ticket.id)) ?? ticket;
    const error = "Este ingresso acabou de ser validado em outra portaria.";
    await recordValidation(validator, { ...logBase(ticket, event), action: "confirm", outcome: "refused", reason: error });
    return { ok: false, status: 409, error, ticket: doorView(fresh, event, validator) };
  }
  await recordValidation(validator, { ...logBase(ticket, event), action: "confirm", outcome: "accepted", reason: ticket.isTest ? "Ingresso de teste" : "" });
  const message = ticket.isTest ? "Teste registrado. Este ingresso de teste não libera entrada real: leia o QR de novo para testar o bloqueio." : "Entrada liberada.";
  return { ok: true, canCheckin: false, warning: null, message, ticket: doorView(updated, event, validator) };
}

/** Entradas registradas por este validador (parceiro: todas dos eventos dele). */
export async function ticketHistory(validator: Validator, limit = 20): Promise<DoorTicket[]> {
  const repo = getLiveRepository();
  const tickets =
    validator.role === "partner"
      ? await (async () => {
          const events = await repo.listEvents({ partnerId: validator.partner.id });
          return repo.listTickets({ eventIds: events.map((e) => e.id) });
        })()
      : await repo.listTickets({ checkedInBy: validator.userId, limit: 500 });
  const used = tickets
    .filter((t) => t.status === "used" && t.checkedInAt)
    .sort((a, b) => (b.checkedInAt ?? "").localeCompare(a.checkedInAt ?? ""))
    .slice(0, limit);
  const events = new Map<string, LiveEvent | null>();
  const views: DoorTicket[] = [];
  for (const ticket of used) {
    if (!events.has(ticket.eventId)) events.set(ticket.eventId, await repo.getEvent(ticket.eventId));
    const event = events.get(ticket.eventId);
    if (event) views.push(doorView(ticket, event, validator));
  }
  return views;
}
