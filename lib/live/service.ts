// Hello World
import crypto from "crypto";
import type { StoredUser } from "@/lib/auth";
import { userStore } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/client";
import { PartnerError } from "@/lib/partners/errors";
import { getPartnerRepository } from "@/lib/partners/repository";
import { getLiveRepository, type NewTicket } from "@/lib/live/repository";
import {
  batchAvailability,
  checkReservation,
  eventHasEnded,
  eventHasStarted,
  isActiveTicket,
  parseRunResults,
  ticketQrPayload,
} from "@/lib/live/rules";
import {
  FOUNDERS_STATUSES,
  LIST_ONLY_SERIES,
  SERIES_LABEL,
  runDetailsInputSchema,
  type EventInput,
  type EventSeries,
  type EventStatus,
  type FoundersStatus,
  type FoundersSubmission,
  type LiveEvent,
  type LiveTicket,
  type RunResult,
  type StartupStage,
  type TicketStatus,
  type ValidatorRole,
} from "@/lib/live/types";

/**
 * Regras de negócio do PRX LIVE. As rotas só autenticam e repassam.
 * Pagamento online ainda não existe: ingresso pago vira reserva
 * "aguardando pagamento", que a PRX confirma pelo admin.
 */

const repo = () => getLiveRepository();

/** Reserva sem pagamento confirmado segura o lugar por este tempo. */
export const RESERVATION_HOLD_HOURS = 72;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function ticketCode(series: EventSeries): string {
  const chars = Array.from({ length: 8 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join("");
  return `${series === "run" ? "RUN" : "UP"}-${chars.slice(0, 4)}-${chars.slice(4)}`;
}

/** Insere com código único (colisão é rara; tenta de novo). */
async function insertWithFreshCode(series: EventSeries, ticket: Omit<NewTicket, "code">): Promise<LiveTicket> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await repo().insertTicket({ ...ticket, code: ticketCode(series) });
    } catch (error) {
      if (!(error instanceof PartnerError) || error.status !== 409 || attempt === 3) throw error;
    }
  }
  throw new PartnerError("Não foi possível emitir o ingresso agora.", 500);
}

/**
 * Reservas vencidas liberam o lugar: aguardando pagamento há mais de
 * RESERVATION_HOLD_HOURS ou quando o evento começa. Expiração preguiçosa,
 * feita sempre que a lista de ingressos do evento é lida.
 */
async function ticketsWithExpiry(event: LiveEvent): Promise<LiveTicket[]> {
  const tickets = await repo().listTickets({ eventId: event.id });
  const now = Date.now();
  const started = eventHasStarted(event);
  const stale = tickets.filter(
    (t) => t.status === "pending_payment" && (started || now - new Date(t.createdAt).getTime() > RESERVATION_HOLD_HOURS * 3_600_000)
  );
  if (stale.length === 0) return tickets;
  const cancelledAt = new Date().toISOString();
  const expired = new Set<string>();
  for (const ticket of stale) {
    const updated = await repo().updateTicket(ticket.id, { status: "cancelled", cancelledAt, note: "Reserva expirada sem pagamento." }, ["pending_payment"]);
    if (updated) expired.add(ticket.id);
  }
  return tickets.map((t) => (expired.has(t.id) ? { ...t, status: "cancelled" as const, cancelledAt } : t));
}

/* -------------------------------------------------------------------------- */
/* Visões                                                                      */
/* -------------------------------------------------------------------------- */

export interface PublicBatch {
  id: string;
  name: string;
  price: number;
  available: boolean;
  /** Restantes quando há limite; null = sem limite informado. */
  remaining: number | null;
}

export interface PublicEvent {
  id: string;
  series: EventSeries;
  seriesLabel: string;
  title: string;
  summary: string;
  startsAt: string;
  endsAt: string | null;
  venue: string;
  city: string;
  address: string;
  coverUrl: string;
  perUserLimit: number;
  minPrxLevel: number;
  partnerName: string | null;
  status: EventStatus;
  ended: boolean;
  salesOpen: boolean;
  soldOut: boolean;
  batches: PublicBatch[];
  run: { modalities: string[]; categories: string[]; kitPickup: string; results: RunResult[] } | null;
}

export function toPublicEvent(event: LiveEvent, tickets: ReadonlyArray<Pick<LiveTicket, "batchId" | "status">>, now = new Date()): PublicEvent {
  const availability = batchAvailability(event, tickets);
  const ended = eventHasEnded(event, now);
  const salesOpen = event.status === "published" && !eventHasStarted(event, now);
  return {
    id: event.id,
    series: event.series,
    seriesLabel: SERIES_LABEL[event.series],
    title: event.title,
    summary: event.summary,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    venue: event.venue,
    city: event.city,
    address: event.address,
    coverUrl: event.coverUrl,
    perUserLimit: event.perUserLimit,
    minPrxLevel: event.minPrxLevel,
    partnerName: event.partnerName,
    status: event.status,
    ended,
    salesOpen,
    soldOut: salesOpen && availability.every((a) => !a.available),
    batches: availability.map((a) => ({ id: a.batch.id, name: a.batch.name, price: a.batch.price, available: salesOpen && a.available, remaining: a.remaining })),
    run: event.run
      ? { modalities: event.run.modalities, categories: event.run.categories, kitPickup: event.run.kitPickup, results: ended ? event.run.results : [] }
      : null,
  };
}

/** Ingresso como o membro vê: sem ids internos de quem emitiu ou validou. */
export interface MemberTicket {
  id: string;
  code: string;
  qrPayload: string;
  eventId: string;
  batchName: string;
  holderName: string;
  price: number;
  status: TicketStatus;
  source: LiveTicket["source"];
  runDetails: LiveTicket["runDetails"];
  createdAt: string;
  paidAt: string | null;
  checkedInAt: string | null;
  checkedInByRole: ValidatorRole | null;
  holdUntil: string | null;
  event: PublicEvent | null;
}

function toMemberTicket(ticket: LiveTicket, event: PublicEvent | null): MemberTicket {
  const holdUntil =
    ticket.status === "pending_payment"
      ? new Date(
          Math.min(new Date(ticket.createdAt).getTime() + RESERVATION_HOLD_HOURS * 3_600_000, event ? new Date(event.startsAt).getTime() : Infinity)
        ).toISOString()
      : null;
  return {
    id: ticket.id,
    code: ticket.code,
    qrPayload: ticketQrPayload(ticket),
    eventId: ticket.eventId,
    batchName: ticket.batchName,
    holderName: ticket.holderName,
    price: ticket.price,
    status: ticket.status,
    source: ticket.source,
    runDetails: ticket.runDetails,
    createdAt: ticket.createdAt,
    paidAt: ticket.paidAt,
    checkedInAt: ticket.checkedInAt,
    checkedInByRole: ticket.checkedInByRole,
    holdUntil,
    event,
  };
}

export type MemberSubmission = Omit<FoundersSubmission, "userId" | "userEmail" | "userName" | "deckPath"> & { hasDeck: boolean };

function toMemberSubmission(s: FoundersSubmission): MemberSubmission {
  return {
    id: s.id,
    startupName: s.startupName,
    oneLiner: s.oneLiner,
    stage: s.stage,
    videoUrl: s.videoUrl,
    deckFileName: s.deckFileName,
    hasDeck: Boolean(s.deckPath),
    status: s.status,
    adminNote: s.status === "sent" ? "" : s.adminNote,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

/* -------------------------------------------------------------------------- */
/* Membro                                                                      */
/* -------------------------------------------------------------------------- */

/** Vitrine: publicados que não terminaram há mais de 180 dias (resultados da RUN ficam visíveis). */
export async function listPublicEvents(): Promise<PublicEvent[]> {
  const events = await repo().listEvents({ statuses: ["published", "cancelled"] });
  const cutoff = Date.now() - 180 * 86_400_000;
  const visible = events.filter((e) => new Date(e.startsAt).getTime() > cutoff && !LIST_ONLY_SERIES.includes(e.series));
  const tickets = await repo().listTickets({ eventIds: visible.map((e) => e.id) });
  return visible.map((e) => toPublicEvent(e, tickets.filter((t) => t.eventId === e.id)));
}

export interface MemberWallet {
  tickets: MemberTicket[];
  submissions: MemberSubmission[];
}

export async function memberWallet(user: Pick<StoredUser, "id">): Promise<MemberWallet> {
  const [tickets, submissions] = await Promise.all([repo().listTickets({ userId: user.id }), repo().listSubmissions({ userId: user.id })]);
  const eventIds = [...new Set(tickets.map((t) => t.eventId))];
  const events = new Map<string, PublicEvent>();
  for (const id of eventIds) {
    const event = await repo().getEvent(id);
    if (!event || event.status === "draft") continue;
    const eventTickets = await ticketsWithExpiry(event);
    events.set(id, toPublicEvent(event, eventTickets));
  }
  // Rebusca: a expiração acima pode ter cancelado reservas do próprio membro.
  const fresh = eventIds.length > 0 ? await repo().listTickets({ userId: user.id }) : tickets;
  return {
    tickets: fresh.map((t) => toMemberTicket(t, events.get(t.eventId) ?? null)),
    submissions: submissions.map(toMemberSubmission),
  };
}

export interface ReserveInput {
  eventId: string;
  batchId: string;
  run?: unknown;
}

/**
 * Garante o ingresso. Gratuito sai válido na hora; pago vira reserva
 * aguardando pagamento. Lotação e limites são reconferidos depois de inserir,
 * para duas reservas simultâneas do último lugar não passarem as duas.
 */
export async function reserveTicket(user: StoredUser, input: ReserveInput): Promise<MemberTicket> {
  const event = await repo().getEvent(input.eventId);
  if (!event || event.status === "draft") throw new PartnerError("Evento não encontrado.", 404);
  if (LIST_ONLY_SERIES.includes(event.series)) throw new PartnerError("Este evento é só por lista: o acesso vem do convite de um Insider.", 409);

  const eventTickets = await ticketsWithExpiry(event);
  const memberTickets = eventTickets.filter((t) => t.userId === user.id);
  const check = checkReservation({ event, batchId: input.batchId, eventTickets, memberTickets, memberLevel: user.prxLevel || 1 });
  if (!check.ok) throw new PartnerError(check.reason, 409);

  let runDetails: LiveTicket["runDetails"] = null;
  if (event.series === "run") {
    if (!event.run) throw new PartnerError("Inscrições desta etapa ainda não abriram.", 409);
    const parsed = runDetailsInputSchema.safeParse(input.run);
    if (!parsed.success) throw new PartnerError(parsed.error.issues[0]?.message || "Confira os dados da inscrição.", 422);
    if (!event.run.modalities.includes(parsed.data.modality)) throw new PartnerError("Distância indisponível nesta etapa.", 422);
    if (!event.run.categories.includes(parsed.data.category)) throw new PartnerError("Categoria indisponível nesta etapa.", 422);
    runDetails = { modality: parsed.data.modality, category: parsed.data.category, shirtSize: parsed.data.shirtSize, termsAcceptedAt: new Date().toISOString() };
  }

  const free = check.batch.price === 0;
  const now = new Date().toISOString();
  const ticket = await insertWithFreshCode(event.series, {
    eventId: event.id,
    batchId: check.batch.id,
    batchName: check.batch.name,
    userId: user.id,
    userEmail: user.email.toLowerCase(),
    holderName: user.fullName || "Membro PRX",
    price: check.batch.price,
    status: free ? "valid" : "pending_payment",
    source: free ? "free" : "purchase",
    runDetails,
    issuedBy: null,
    note: "",
    createdAt: now,
    paidAt: free ? now : null,
    cancelledAt: null,
    checkedInAt: null,
    checkedInBy: null,
    checkedInByRole: null,
    checkedInByName: null,
  });

  const overflow = await exceedsLimits(event, ticket);
  if (overflow) {
    await repo().deleteTicket(ticket.id);
    throw new PartnerError(overflow, 409);
  }

  return toMemberTicket(ticket, toPublicEvent(event, [...eventTickets, ticket]));
}

/** Depois de inserir: este ingresso cabe na lotação, no lote e no limite por pessoa? */
async function exceedsLimits(event: LiveEvent, ticket: LiveTicket): Promise<string | null> {
  if (event.capacity !== null) {
    const first = await repo().firstActiveTicketIds(event.id, event.capacity);
    if (!first.includes(ticket.id)) return "O evento acabou de esgotar.";
  }
  const batch = event.batches.find((b) => b.id === ticket.batchId);
  if (batch?.quantity) {
    const first = await repo().firstActiveTicketIds(event.id, batch.quantity, batch.id);
    if (!first.includes(ticket.id)) return "Este lote acabou de esgotar.";
  }
  if (ticket.source !== "invite") {
    const mine = (await repo().listTickets({ eventId: event.id, userId: ticket.userId }))
      .filter((t) => isActiveTicket(t) && t.source !== "invite")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    if (mine.findIndex((t) => t.id === ticket.id) >= event.perUserLimit) return "Você já atingiu o limite de ingressos deste evento.";
  }
  return null;
}

/** O membro desiste de uma reserva pendente, ou de um ingresso gratuito antes do evento. */
export async function cancelOwnTicket(user: Pick<StoredUser, "id">, ticketId: string): Promise<void> {
  const ticket = await repo().getTicket(ticketId);
  if (!ticket || ticket.userId !== user.id) throw new PartnerError("Ingresso não encontrado.", 404);
  const event = await repo().getEvent(ticket.eventId);
  const freeBeforeStart = ticket.status === "valid" && ticket.price === 0 && ticket.source !== "invite" && event && !eventHasStarted(event);
  if (ticket.status !== "pending_payment" && !freeBeforeStart) {
    throw new PartnerError("Este ingresso não pode ser cancelado pelo app. Fale com a equipe PRX.", 409);
  }
  const updated = await repo().updateTicket(ticketId, { status: "cancelled", cancelledAt: new Date().toISOString(), note: "Cancelado pelo membro." }, [ticket.status]);
  if (!updated) throw new PartnerError("O ingresso mudou de situação. Atualize a tela.", 409);
}

const MAX_OPEN_SUBMISSIONS = 1;
export const DECK_MAX_BYTES = 10 * 1024 * 1024;

export async function submitFounders(
  user: StoredUser,
  input: { startupName: string; oneLiner: string; stage: StartupStage; videoUrl: string },
  deck: { name: string; bytes: Uint8Array; contentType: string } | null
): Promise<MemberSubmission> {
  const mine = await repo().listSubmissions({ userId: user.id });
  if (mine.filter((s) => s.status === "sent" || s.status === "review").length >= MAX_OPEN_SUBMISSIONS) {
    throw new PartnerError("Você já tem uma startup em análise. Aguarde o retorno antes de enviar outra.", 409);
  }
  if (!deck && !input.videoUrl) throw new PartnerError("Envie o pitch deck em PDF ou o link do vídeo de 60 segundos.", 422);
  if (deck) {
    if (deck.bytes.byteLength > DECK_MAX_BYTES) throw new PartnerError("O PDF pode ter até 10 MB.", 422);
    const header = new TextDecoder().decode(deck.bytes.subarray(0, 5));
    if (header !== "%PDF-") throw new PartnerError("O pitch deck precisa ser um arquivo PDF.", 422);
  }

  const created = await repo().insertSubmission({
    userId: user.id,
    userEmail: user.email.toLowerCase(),
    userName: user.fullName || "Membro PRX",
    startupName: input.startupName,
    oneLiner: input.oneLiner,
    stage: input.stage,
    videoUrl: input.videoUrl,
    deckFileName: deck ? deck.name.slice(0, 120) : "",
    deckPath: null,
    status: "sent",
    adminNote: "",
  });
  if (!deck) return toMemberSubmission(created);
  const path = await repo().saveDeck(created.id, { bytes: deck.bytes, contentType: "application/pdf" });
  return toMemberSubmission(await repo().updateSubmission(created.id, { deckPath: path }));
}

/** Contagens usadas pelas missões do PASS (check-in, RUN, Founders). */
export async function liveMissionCounts(userId: string): Promise<{ checkins: number; runSignups: number; foundersSubmissions: number }> {
  const [tickets, submissions] = await Promise.all([repo().listTickets({ userId }), repo().listSubmissions({ userId })]);
  return {
    checkins: tickets.filter((t) => t.status === "used").length,
    runSignups: tickets.filter((t) => t.code.startsWith("RUN-") && (t.status === "valid" || t.status === "used")).length,
    foundersSubmissions: submissions.length,
  };
}

/* -------------------------------------------------------------------------- */
/* Admin                                                                       */
/* -------------------------------------------------------------------------- */

export interface EventStats {
  total: number;
  pending: number;
  valid: number;
  used: number;
  cancelled: number;
  confirmedRevenue: number;
  pendingRevenue: number;
  capacityLeft: number | null;
}

export function eventStats(event: Pick<LiveEvent, "capacity">, tickets: ReadonlyArray<LiveTicket>): EventStats {
  const by = (status: TicketStatus) => tickets.filter((t) => t.status === status);
  const active = tickets.filter(isActiveTicket).length;
  const sum = (list: LiveTicket[]) => Math.round(list.reduce((acc, t) => acc + t.price, 0) * 100) / 100;
  return {
    total: tickets.length,
    pending: by("pending_payment").length,
    valid: by("valid").length,
    used: by("used").length,
    cancelled: by("cancelled").length,
    confirmedRevenue: sum([...by("valid"), ...by("used")].filter((t) => t.source === "purchase")),
    pendingRevenue: sum(by("pending_payment")),
    capacityLeft: event.capacity === null ? null : Math.max(0, event.capacity - active),
  };
}

export type AdminEvent = LiveEvent & { stats: EventStats; ended: boolean };

export async function listAdminEvents(): Promise<AdminEvent[]> {
  const events = await repo().listEvents();
  const result: AdminEvent[] = [];
  for (const event of events) {
    const tickets = await ticketsWithExpiry(event);
    result.push({ ...event, stats: eventStats(event, tickets), ended: eventHasEnded(event) });
  }
  return result.sort((a, b) => Number(a.ended) - Number(b.ended) || a.startsAt.localeCompare(b.startsAt));
}

async function partnerNameFor(partnerId: string | null): Promise<string | null> {
  if (!partnerId) return null;
  const partner = await getPartnerRepository().getPartner(partnerId);
  if (!partner) throw new PartnerError("Parceiro não encontrado.", 422);
  if (partner.status === "BLOQUEADO") throw new PartnerError("Este parceiro está bloqueado e não pode ser ligado a eventos.", 422);
  return partner.tradeName;
}

export async function createEvent(input: EventInput, actor: string): Promise<LiveEvent> {
  const partnerName = await partnerNameFor(input.partnerId);
  return repo().insertEvent({ ...input, run: input.series === "run" ? input.run : null, partnerName, createdBy: actor });
}

export async function updateEvent(id: string, input: EventInput): Promise<LiveEvent> {
  const current = await repo().getEvent(id);
  if (!current) throw new PartnerError("Evento não encontrado.", 404);
  const tickets = await repo().listTickets({ eventId: id });
  const usedBatches = new Set(tickets.filter((t) => t.source !== "invite").map((t) => t.batchId));
  const kept = new Set(input.batches.map((b) => b.id));
  const removed = [...usedBatches].filter((b) => !kept.has(b));
  if (removed.length > 0) throw new PartnerError("Lotes com ingressos não podem ser removidos. Encerre o lote em vez de excluir.", 409);
  if (tickets.length > 0 && current.series !== input.series && (current.series === "run" || input.series === "run")) {
    throw new PartnerError("Com inscrições feitas, o evento não pode mudar de/para PRX RUN.", 409);
  }
  const partnerName = input.partnerId === current.partnerId ? current.partnerName : await partnerNameFor(input.partnerId);
  const run = input.series === "run" && input.run ? { ...input.run, results: input.run.results.length > 0 ? input.run.results : (current.run?.results ?? []) } : null;
  // O status muda só por setEventStatus, que confere ingressos e cancelamentos.
  return repo().updateEvent(id, { ...input, status: current.status, run, partnerName });
}

export async function setEventStatus(id: string, status: EventStatus): Promise<LiveEvent> {
  const current = await repo().getEvent(id);
  if (!current) throw new PartnerError("Evento não encontrado.", 404);
  if (current.status === "cancelled" && status !== "cancelled") throw new PartnerError("Evento cancelado não pode ser reaberto. Crie um novo.", 409);
  if (status === "draft" && current.status === "published") {
    const tickets = await repo().listTickets({ eventId: id });
    if (tickets.some(isActiveTicket)) throw new PartnerError("Já há ingressos para este evento: cancele em vez de despublicar.", 409);
  }
  const updated = await repo().updateEvent(id, { status });
  if (status === "cancelled") {
    const cancelledAt = new Date().toISOString();
    for (const ticket of await repo().listTickets({ eventId: id })) {
      if (ticket.status === "pending_payment") await repo().updateTicket(ticket.id, { status: "cancelled", cancelledAt, note: "Evento cancelado." }, ["pending_payment"]);
    }
  }
  return updated;
}

export async function deleteEvent(id: string): Promise<void> {
  const tickets = await repo().listTickets({ eventId: id, limit: 1 });
  if (tickets.length > 0) throw new PartnerError("Este evento já tem ingressos. Cancele em vez de excluir.", 409);
  await repo().deleteEvent(id);
}

export async function eventAttendees(eventId: string): Promise<{ event: LiveEvent; tickets: LiveTicket[]; stats: EventStats }> {
  const event = await repo().getEvent(eventId);
  if (!event) throw new PartnerError("Evento não encontrado.", 404);
  const tickets = await ticketsWithExpiry(event);
  return { event, tickets, stats: eventStats(event, tickets) };
}

export async function confirmPayment(ticketId: string, note: string): Promise<LiveTicket> {
  const ticket = await repo().getTicket(ticketId);
  if (!ticket) throw new PartnerError("Ingresso não encontrado.", 404);
  if (ticket.status !== "pending_payment") throw new PartnerError("Este ingresso não está aguardando pagamento.", 409);
  const updated = await repo().updateTicket(ticketId, { status: "valid", paidAt: new Date().toISOString(), note: note.slice(0, 300) }, ["pending_payment"]);
  if (!updated) throw new PartnerError("A reserva mudou de situação (expirou ou foi cancelada). Atualize a lista.", 409);
  return updated;
}

export async function adminCancelTicket(ticketId: string, note: string): Promise<LiveTicket> {
  const updated = await repo().updateTicket(ticketId, { status: "cancelled", cancelledAt: new Date().toISOString(), note: note.slice(0, 300) }, ["pending_payment", "valid"]);
  if (!updated) throw new PartnerError("Só reservas e ingressos válidos podem ser cancelados.", 409);
  return updated;
}

/** Busca um membro PRX pelo e-mail (para convites/cortesias). */
async function findMemberByEmail(rawEmail: string): Promise<{ id: string; email: string; name: string } | null> {
  const email = rawEmail.toLowerCase().trim();
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin.from("profiles").select("id, email, full_name").eq("email", email).maybeSingle();
    if (error) throw new PartnerError("Não foi possível consultar o membro.", 500);
    if (data) return { id: data.id as string, email, name: (data.full_name as string | null) || email.split("@")[0] };
  }
  const user = userStore.findByEmail(email);
  return user ? { id: user.id, email, name: user.fullName } : null;
}

function assertEventTakesTickets(event: LiveEvent): void {
  if (event.status === "cancelled") throw new PartnerError("Evento cancelado.", 409);
  if (eventHasEnded(event)) throw new PartnerError("Este evento já terminou.", 409);
}

/** Quem recebe o ingresso: um membro ou, na lista da Resenha, um convidado sem conta. */
export interface TicketHolder {
  userId: string;
  email: string;
  name: string;
}

/**
 * Emite um ingresso gratuito (origem "invite") e confere a lotação depois de
 * inserir, para dois pedidos simultâneos do último lugar não passarem os dois.
 */
export async function issueTicketTo(
  event: LiveEvent,
  holder: TicketHolder,
  meta: { batchId: string; batchName: string; issuedBy: string; note: string }
): Promise<LiveTicket> {
  assertEventTakesTickets(event);
  const tickets = await ticketsWithExpiry(event);
  if (event.capacity !== null && tickets.filter(isActiveTicket).length >= event.capacity) throw new PartnerError("Evento lotado.", 409);

  const ticket = await insertWithFreshCode(event.series, {
    eventId: event.id,
    batchId: meta.batchId,
    batchName: meta.batchName,
    userId: holder.userId,
    userEmail: holder.email,
    holderName: holder.name,
    price: 0,
    status: "valid",
    source: "invite",
    runDetails: null,
    issuedBy: meta.issuedBy,
    note: meta.note.slice(0, 300),
    createdAt: new Date().toISOString(),
    paidAt: null,
    cancelledAt: null,
    checkedInAt: null,
    checkedInBy: null,
    checkedInByRole: null,
    checkedInByName: null,
  });
  const overflow = event.capacity !== null && !(await repo().firstActiveTicketIds(event.id, event.capacity)).includes(ticket.id);
  if (overflow) {
    await repo().deleteTicket(ticket.id);
    throw new PartnerError("Evento lotado.", 409);
  }
  return ticket;
}

/** Convite (cortesia): ingresso válido emitido pela PRX para um membro. Conta na lotação. */
export async function issueInvite(eventId: string, input: { email: string; note: string }, actor: string): Promise<LiveTicket> {
  const event = await repo().getEvent(eventId);
  if (!event) throw new PartnerError("Evento não encontrado.", 404);
  assertEventTakesTickets(event);
  const member = await findMemberByEmail(input.email);
  if (!member) throw new PartnerError("Nenhum membro PRX com este e-mail. O convidado precisa ter conta no app.", 404);
  return issueTicketTo(event, { userId: member.id, email: member.email, name: member.name }, { batchId: "cortesia", batchName: "Convite PRX", issuedBy: actor, note: input.note });
}

export async function setRunResults(eventId: string, text: string): Promise<{ event: LiveEvent; errors: string[] }> {
  const event = await repo().getEvent(eventId);
  if (!event) throw new PartnerError("Evento não encontrado.", 404);
  if (event.series !== "run" || !event.run) throw new PartnerError("Resultados só existem em etapas da PRX RUN.", 422);
  const { results, errors } = parseRunResults(text);
  if (errors.length > 0) return { event, errors };
  return { event: await repo().updateEvent(eventId, { run: { ...event.run, results } }), errors: [] };
}

export async function listFounders(): Promise<FoundersSubmission[]> {
  return repo().listSubmissions();
}

export async function setFoundersStatus(id: string, status: FoundersStatus, adminNote: string): Promise<FoundersSubmission> {
  if (!FOUNDERS_STATUSES.includes(status)) throw new PartnerError("Status inválido.", 422);
  return repo().updateSubmission(id, { status, adminNote: adminNote.slice(0, 1000) });
}

export async function foundersDeck(id: string) {
  const submission = await repo().getSubmission(id);
  if (!submission?.deckPath) throw new PartnerError("Esta submissão não tem pitch deck.", 404);
  const file = await repo().deckUrl(submission.deckPath);
  if (!file) throw new PartnerError("Arquivo indisponível.", 404);
  return { file, fileName: submission.deckFileName || "pitch-deck.pdf" };
}

/* -------------------------------------------------------------------------- */
/* Parceiro                                                                    */
/* -------------------------------------------------------------------------- */

/** Nome como aparece na portaria para quem não é da PRX: primeiro nome + inicial. */
export function doorName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Membro PRX";
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

export interface DoorEventView {
  event: PublicEvent;
  stats: EventStats;
  attendees: Array<{ code: string; name: string; batchName: string; status: TicketStatus; checkedInAt: string | null }>;
}

/**
 * Eventos que um validador opera na portaria: parceiro vê os ligados a ele;
 * equipe, os que aceitam a equipe; admin, todos. Terminados há mais de 30 dias saem.
 * Parceiro recebe só primeiro nome + inicial; nada de e-mails.
 */
export async function listDoorEvents(scope: { partnerId?: string; staffOnly?: boolean; fullNames: boolean }): Promise<DoorEventView[]> {
  const events = await repo().listEvents({
    statuses: ["published", "cancelled"],
    ...(scope.partnerId ? { partnerId: scope.partnerId } : {}),
    ...(scope.staffOnly ? { staffCheckin: true } : {}),
  });
  const cutoff = Date.now() - 30 * 86_400_000;
  const views: DoorEventView[] = [];
  for (const event of events) {
    const endsAt = event.endsAt ? new Date(event.endsAt).getTime() : new Date(event.startsAt).getTime() + 12 * 3_600_000;
    if (endsAt < cutoff) continue;
    const tickets = await ticketsWithExpiry(event);
    views.push({
      event: toPublicEvent(event, tickets),
      stats: eventStats(event, tickets),
      attendees: tickets
        .filter((t) => t.status === "valid" || t.status === "used")
        .sort((a, b) => a.holderName.localeCompare(b.holderName, "pt-BR"))
        .map((t) => ({ code: t.code, name: scope.fullNames ? t.holderName : doorName(t.holderName), batchName: t.batchName, status: t.status, checkedInAt: t.checkedInAt })),
    });
  }
  return views;
}
