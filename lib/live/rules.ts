// Hello World
import type { LiveEvent, LiveTicket, RunResult, TicketBatch, TicketStatus, ValidatorRole } from "@/lib/live/types";

/**
 * Regras puras do PRX LIVE (sem I/O): disponibilidade, limites, quem valida
 * na portaria e leitura dos resultados da PRX RUN. Testadas em __tests__.
 */

/** Ingressos que ocupam lugar: reserva aguardando pagamento, válido ou já usado. */
export const ACTIVE_TICKET_STATUSES: ReadonlyArray<TicketStatus> = ["pending_payment", "valid", "used"];

export function isActiveTicket(ticket: Pick<LiveTicket, "status">): boolean {
  return ACTIVE_TICKET_STATUSES.includes(ticket.status);
}

export function eventHasStarted(event: Pick<LiveEvent, "startsAt">, now = new Date()): boolean {
  return now.getTime() >= new Date(event.startsAt).getTime();
}

/** Terminou: passou do fim informado ou, sem fim, 12h depois do início. */
export function eventHasEnded(event: Pick<LiveEvent, "startsAt" | "endsAt">, now = new Date()): boolean {
  const end = event.endsAt ? new Date(event.endsAt).getTime() : new Date(event.startsAt).getTime() + 12 * 3_600_000;
  return now.getTime() > end;
}

export interface BatchAvailability {
  batch: TicketBatch;
  sold: number;
  remaining: number | null;
  available: boolean;
}

type CountedTicket = Pick<LiveTicket, "batchId" | "status"> & { isTest?: boolean };

/** Ingresso de teste não ocupa lugar nem conta no limite por pessoa. */
export function isRealActiveTicket(ticket: Pick<LiveTicket, "status"> & { isTest?: boolean }): boolean {
  return isActiveTicket(ticket) && !ticket.isTest;
}

export function batchAvailability(event: Pick<LiveEvent, "batches" | "capacity">, tickets: ReadonlyArray<CountedTicket>): BatchAvailability[] {
  const active = tickets.filter(isRealActiveTicket);
  const capacityLeft = event.capacity === null ? null : Math.max(0, event.capacity - active.length);
  return event.batches.map((batch) => {
    const sold = active.filter((t) => t.batchId === batch.id).length;
    const batchLeft = batch.quantity === null ? null : Math.max(0, batch.quantity - sold);
    const remaining = batchLeft === null ? capacityLeft : capacityLeft === null ? batchLeft : Math.min(batchLeft, capacityLeft);
    return { batch, sold, remaining, available: !batch.closed && (remaining === null || remaining > 0) };
  });
}

export type ReservationCheck =
  | { ok: true; batch: TicketBatch }
  | { ok: false; reason: string };

/** Pode reservar/garantir este lote agora? */
export function checkReservation(input: {
  event: LiveEvent;
  batchId: string;
  eventTickets: ReadonlyArray<CountedTicket>;
  memberTickets: ReadonlyArray<Pick<LiveTicket, "status"> & { isTest?: boolean }>;
  memberLevel: number;
  now?: Date;
}): ReservationCheck {
  const { event, now = new Date() } = input;
  if (event.status !== "published") return { ok: false, reason: event.status === "cancelled" ? "Este evento foi cancelado." : "Este evento ainda não está aberto." };
  if (eventHasStarted(event, now)) return { ok: false, reason: "As vendas deste evento já encerraram." };
  if (input.memberLevel < event.minPrxLevel) return { ok: false, reason: `Disponível a partir do nível ${event.minPrxLevel}.` };
  const mine = input.memberTickets.filter(isRealActiveTicket).length;
  if (mine >= event.perUserLimit) {
    return { ok: false, reason: event.perUserLimit === 1 ? "Você já tem um ingresso para este evento." : `Limite de ${event.perUserLimit} ingressos por pessoa.` };
  }
  const availability = batchAvailability(event, input.eventTickets).find((a) => a.batch.id === input.batchId);
  if (!availability) return { ok: false, reason: "Lote não encontrado." };
  if (availability.batch.closed) return { ok: false, reason: "Este lote está encerrado." };
  if (!availability.available) return { ok: false, reason: "Este lote esgotou." };
  return { ok: true, batch: availability.batch };
}

/* -------------------------------------------------------------------------- */
/* Portaria                                                                    */
/* -------------------------------------------------------------------------- */

export type CheckinActor =
  | { role: "admin" }
  | { role: "partner"; partnerId: string }
  | { role: "staff"; canValidateTickets: boolean };

/** Quem pode validar ingressos deste evento. */
export function canValidateEvent(actor: CheckinActor, event: Pick<LiveEvent, "partnerId" | "staffCheckin">): boolean {
  if (actor.role === "admin") return true;
  if (actor.role === "partner") return Boolean(event.partnerId) && event.partnerId === actor.partnerId;
  return actor.canValidateTickets && event.staffCheckin;
}

export type CheckinVerdict = { ok: true } | { ok: false; reason: string };

export function checkinVerdict(ticket: Pick<LiveTicket, "status" | "checkedInAt">, event: Pick<LiveEvent, "status">): CheckinVerdict {
  if (event.status === "cancelled") return { ok: false, reason: "Evento cancelado: nenhum ingresso é aceito." };
  if (ticket.status === "pending_payment") return { ok: false, reason: "Pagamento pendente: este ingresso ainda não foi confirmado." };
  if (ticket.status === "cancelled") return { ok: false, reason: "Ingresso cancelado." };
  if (ticket.status === "used") return { ok: false, reason: "Este ingresso já foi utilizado." };
  return { ok: true };
}

/** A portaria abre CHECKIN_OPENS_HOURS antes do início e fecha quando o evento termina. */
export const CHECKIN_OPENS_HOURS = 12;

export function checkinWindowIssue(event: Pick<LiveEvent, "startsAt" | "endsAt">, now = new Date()): string | null {
  const opens = new Date(event.startsAt).getTime() - CHECKIN_OPENS_HOURS * 3_600_000;
  if (now.getTime() < opens) return `A portaria abre ${CHECKIN_OPENS_HOURS}h antes do início do evento.`;
  if (eventHasEnded(event, now)) return "Este evento já terminou.";
  return null;
}

export const VALIDATOR_LABEL: Record<ValidatorRole, string> = { admin: "Admin PRX", partner: "Parceiro", staff: "Equipe PRX" };

/* -------------------------------------------------------------------------- */
/* Códigos e resultados                                                        */
/* -------------------------------------------------------------------------- */

export function ticketQrPayload(ticket: Pick<LiveTicket, "code" | "eventId">): string {
  return `PRX_LIVE::${ticket.code}::${ticket.eventId}`;
}

/** Código do pedido mostrado no ingresso e no admin (derivado do id; não é segredo nem autoriza nada). */
export function purchaseCode(ticketId: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < ticketId.length; i++) {
    hash ^= ticketId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `PED-${hash.toString(36).toUpperCase().padStart(7, "0").slice(-7)}`;
}

/** Extrai o código de um QR PRX_LIVE ou de um código digitado. */
export function parseTicketCode(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith("PRX_LIVE::")) return trimmed.split("::")[1]?.trim().toUpperCase() || null;
  const upper = trimmed.toUpperCase();
  return /^(UP|RUN)-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(upper) ? upper : null;
}

/**
 * Resultados colados pelo admin, uma linha por atleta:
 *   posição;nome;categoria;distância;tempo   (vírgula ou tab também valem)
 * Linhas vazias e cabeçalho são ignorados.
 */
export function parseRunResults(text: string): { results: RunResult[]; errors: string[] } {
  const results: RunResult[] = [];
  const errors: string[] = [];
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .forEach((line, index) => {
      if (!line) return;
      const cols = line.split(/[;\t]|,(?=\s*\S)/).map((c) => c.trim());
      const position = Number(cols[0]);
      if (!Number.isInteger(position) || position < 1) {
        if (index === 0 && /pos/i.test(cols[0] ?? "")) return;
        errors.push(`Linha ${index + 1}: posição inválida.`);
        return;
      }
      if (!cols[1]) {
        errors.push(`Linha ${index + 1}: informe o nome.`);
        return;
      }
      results.push({ position, name: cols[1], category: cols[2] ?? "", modality: (cols[3] ?? "").toLowerCase(), time: cols[4] ?? "" });
    });
  return { results, errors };
}
