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
  isRealActiveTicket,
  parseRunResults,
  purchaseCode,
  ticketQrPayload,
} from "@/lib/live/rules";
import { ageRatingLabel, checkAgeEligibility } from "@/lib/live/age";
import { buyerBirthDate, confirmBuyerBirthDate } from "@/lib/live/buyer";
import { getFamilyRepository } from "@/lib/family/repository";
import { isValidCpf } from "@/lib/prx/pix";
import { ageOn, maskCpf } from "@/lib/family/age";
import { assertCpfMatchesBirth } from "@/lib/cpf/verify";
import { activeConsentDocument, documentHash, type ConsentDocument } from "@/lib/live/consent-documents";
import { checkRateLimit } from "@/lib/security";
import { maskEmail } from "@/lib/notifications/format";
import { sendMinorAuthorizationEmail } from "@/lib/notifications/minor-authorization";
import { eventReadiness, type EventReadiness } from "@/lib/live/readiness";
import { automaticPromos, promoOverflow, resolvePromo } from "@/lib/live/promo-service";
import { combineDiscounts, promoLabel, type AppliedDiscount, type CheckoutMethod, type PriceQuote, type PromoCode } from "@/lib/live/promo";
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
  type GuardianApprovalStatus,
  type GuardianConsent,
  type LiveEvent,
  type LiveTicket,
  type RunResult,
  type TicketBatch,
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
export async function insertWithFreshCode(series: EventSeries, ticket: Omit<NewTicket, "code">): Promise<LiveTicket> {
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
export async function ticketsWithExpiry(event: LiveEvent): Promise<LiveTicket[]> {
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
  /** Idade mínima (null = a definir; 0 = livre) e as condições mostradas antes da compra. */
  minAge: number | null;
  ageRating: string;
  idCheckRequired: boolean;
  entryRequirements: string;
  cancellationPolicy: string;
  organizerName: string;
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
    minAge: event.minAge,
    ageRating: ageRatingLabel(event.minAge),
    idCheckRequired: event.idCheckRequired,
    entryRequirements: event.entryRequirements,
    cancellationPolicy: event.cancellationPolicy,
    organizerName: event.organizerName,
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
  originalPrice: number | null;
  discount: number;
  purchaseCode: string;
  status: TicketStatus;
  source: LiveTicket["source"];
  runDetails: LiveTicket["runDetails"];
  createdAt: string;
  paidAt: string | null;
  checkedInAt: string | null;
  checkedInByRole: ValidatorRole | null;
  holdUntil: string | null;
  event: PublicEvent | null;
  guardianConsent: MemberGuardianView | null;
}

/**
 * A liberação do responsável como o membro a vê. O token do link e os dados do
 * responsável (CPF, IP) ficam só no servidor e no e-mail dele: quem recebesse o
 * token pelo app (o menor!) poderia liberar a si mesmo.
 */
export interface MemberGuardianView {
  status: GuardianApprovalStatus;
  /** E-mail do responsável, parcialmente oculto. */
  guardianEmail: string;
  /** Só depois de aprovada. */
  guardianName: string | null;
  respondedAt: string | null;
}

function toMemberGuardian(consent: GuardianConsent | null | undefined): MemberGuardianView | null {
  if (!consent) return null;
  return {
    status: consent.status,
    guardianEmail: maskEmail(consent.guardianEmail),
    guardianName: consent.status === "approved" ? consent.guardianName ?? null : null,
    respondedAt: consent.respondedAt ?? null,
  };
}

/** Ingresso para o admin: a liberação aparece (status, nome, CPF parcial), mas sem o token do link nem IP. */
function redactGuardian<T extends { guardianConsent?: GuardianConsent | null }>(ticket: T): T {
  const consent = ticket.guardianConsent;
  if (!consent) return ticket;
  return { ...ticket, guardianConsent: { ...consent, token: "", guardianCpf: consent.guardianCpf ? maskCpf(consent.guardianCpf) : null, ip: null, userAgent: null } };
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
    originalPrice: ticket.originalPrice,
    discount: ticket.discount,
    purchaseCode: purchaseCode(ticket.id),
    status: ticket.status,
    source: ticket.source,
    runDetails: ticket.runDetails,
    createdAt: ticket.createdAt,
    paidAt: ticket.paidAt,
    checkedInAt: ticket.checkedInAt,
    checkedInByRole: ticket.checkedInByRole,
    holdUntil,
    event,
    guardianConsent: toMemberGuardian(ticket.guardianConsent),
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
  const [allTickets, submissions] = await Promise.all([repo().listTickets({ userId: user.id }), repo().listSubmissions({ userId: user.id })]);
  // Ingressos de teste (simulação do admin) nunca aparecem na carteira.
  const tickets = allTickets.filter((t) => !t.isTest);
  const eventIds = [...new Set(tickets.map((t) => t.eventId))];
  const events = new Map<string, PublicEvent>();
  for (const id of eventIds) {
    const event = await repo().getEvent(id);
    if (!event || event.status === "draft") continue;
    const eventTickets = await ticketsWithExpiry(event);
    events.set(id, toPublicEvent(event, eventTickets));
  }
  // Rebusca: a expiração acima pode ter cancelado reservas do próprio membro.
  const fresh = eventIds.length > 0 ? (await repo().listTickets({ userId: user.id })).filter((t) => !t.isTest) : tickets;
  return {
    tickets: fresh.map((t) => toMemberTicket(t, events.get(t.eventId) ?? null)),
    submissions: submissions.map(toMemberSubmission),
  };
}

export interface ReserveInput {
  eventId: string;
  batchId: string;
  run?: unknown;
  /** Código do cupom ou do link de divulgação. O valor do desconto nunca vem do navegador. */
  promoCode?: unknown;
  /** Data de nascimento confirmada na hora, quando o evento tem idade mínima e a conta ainda não tem a data. */
  birthDate?: unknown;
  /** E-mail do responsável legal quando o comprador for menor de idade (< 18 anos). */
  parentEmail?: unknown;
}

export interface TicketQuote extends PriceQuote {
  promo: { code: string; label: string } | null;
  /** Cada desconto aplicado (cupom e automático), para mostrar e registrar. */
  discounts: AppliedDiscount[];
  age?: {
    minAge: number | null;
    needsBirthDate: boolean;
    eligible: boolean;
    reason: string | null;
    isMinor: boolean;
    requiresParentEmail: boolean;
    suggestedParentEmail?: string | null;
  };
}

/** A pessoa pode comprar este evento pela idade? Se for menor (< 18), exige e valida o e-mail do responsável legal. */
async function assertBuyerAge(
  event: LiveEvent,
  user: StoredUser,
  rawBirthDate: unknown,
  rawParentEmail?: unknown
): Promise<{ isMinor: boolean; parentEmail?: string }> {
  let birth = await buyerBirthDate(user.id);
  if (!birth.birthDate && rawBirthDate !== undefined && rawBirthDate !== null && rawBirthDate !== "") {
    birth = await confirmBuyerBirthDate(user.id, rawBirthDate);
  }
  const check = checkAgeEligibility(event.minAge, birth.birthDate, event.startsAt);
  if (!check.ok) throw new PartnerError(check.reason, check.code === "BIRTH_DATE_REQUIRED" ? 422 : 403);

  if (check.requiresParentEmail) {
    let parentEmail = typeof rawParentEmail === "string" ? rawParentEmail.trim().toLowerCase() : "";
    if (!parentEmail) {
      try {
        const links = await getFamilyRepository().listLinksByChild(user.id);
        const activeLink = links.find((l) => l.status === "active" || l.status === "pending");
        if (activeLink?.parentEmail) parentEmail = activeLink.parentEmail.toLowerCase();
      } catch {
        // ignora
      }
    }
    if (!parentEmail) {
      throw new PartnerError("Como você é menor de idade, informe o e-mail do seu responsável legal para autorizar sua entrada no evento.", 422);
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(parentEmail)) {
      throw new PartnerError("E-mail do responsável legal inválido.", 422);
    }
    if (parentEmail === user.email.toLowerCase()) {
      throw new PartnerError("O e-mail do responsável legal deve ser diferente do seu e-mail.", 422);
    }
    return { isMinor: true, parentEmail };
  }

  return { isMinor: false };
}

/** O que a tela precisa saber da idade antes de reservar (sem expor a data guardada). */
async function ageStatus(event: LiveEvent, userId: string): Promise<TicketQuote["age"]> {
  const birth = await buyerBirthDate(userId);
  const check = checkAgeEligibility(event.minAge, birth.birthDate, event.startsAt);
  let suggestedParentEmail: string | null = null;
  if (check.ok && check.requiresParentEmail) {
    try {
      const links = await getFamilyRepository().listLinksByChild(userId);
      const activeLink = links.find((l) => l.status === "active" || l.status === "pending");
      if (activeLink?.parentEmail) suggestedParentEmail = activeLink.parentEmail;
    } catch {
      // ignora
    }
  }
  return {
    minAge: event.minAge,
    // Sem a data não dá para saber se é menor de idade: pede em qualquer evento (uma vez, fica na conta).
    needsBirthDate: !birth.birthDate,
    eligible: check.ok,
    reason: check.ok ? null : check.reason,
    isMinor: check.ok ? check.isMinor : false,
    requiresParentEmail: check.ok ? check.requiresParentEmail : false,
    suggestedParentEmail,
  };
}

/**
 * Cupom (se houver), descontos automáticos do evento e preço final, calculados
 * no servidor. `method`: forma de pagamento escolhida no checkout (descontos
 * restritos a uma forma só entram com ela). `promo` é o desconto principal,
 * gravado no ingresso para os limites de uso.
 */
export async function priceTicket(
  event: LiveEvent,
  batch: TicketBatch,
  userId: string,
  rawCode: unknown,
  test = false,
  method: CheckoutMethod | null = null,
  excludeTicketId?: string
): Promise<{ quote: TicketQuote; promo: PromoCode | null }> {
  const hasCode = typeof rawCode === "string" && rawCode.trim() !== "";
  const coded = hasCode ? await resolvePromo({ code: rawCode, event, batch, userId, test, method, excludeTicketId }) : null;
  const automatic = test || batch.price <= 0 ? [] : await automaticPromos(event, batch, userId, method, excludeTicketId);
  const combined = combineDiscounts(batch.price, coded, automatic);
  const primaryId = combined.applied.find((d) => !d.automatic)?.promoId ?? combined.applied[0]?.promoId ?? null;
  const promo = [coded, ...automatic].find((p) => p?.id === primaryId) ?? null;
  return {
    quote: {
      original: combined.original,
      discount: combined.discount,
      total: combined.total,
      promo: promo ? { code: promo.code, label: promo.label || promoLabel(promo) } : null,
      discounts: combined.applied,
    },
    promo,
  };
}

/** Resumo do pedido antes de reservar: valor original, desconto e total (servidor). */
export async function quoteTicket(user: StoredUser, input: ReserveInput): Promise<TicketQuote> {
  const event = await repo().getEvent(input.eventId);
  if (!event || event.status === "draft") throw new PartnerError("Evento não encontrado.", 404);
  const batch = event.batches.find((b) => b.id === input.batchId);
  if (!batch) throw new PartnerError("Lote não encontrado.", 404);
  const { quote } = await priceTicket(event, batch, user.id, input.promoCode);
  return { ...quote, age: await ageStatus(event, user.id) };
}

/**
 * Garante o ingresso. Gratuito sai válido na hora; pago vira reserva
 * aguardando pagamento. Lotação e limites são reconferidos depois de inserir,
 * para duas reservas simultâneas do último lugar não passarem as duas.
 * Se o comprador for menor de idade, emite pendência de liberação do responsável legal
 * e despacha o e-mail transacional com o link seguro.
 */
export async function reserveTicket(user: StoredUser, input: ReserveInput): Promise<MemberTicket> {
  const event = await repo().getEvent(input.eventId);
  if (!event || event.status === "draft") throw new PartnerError("Evento não encontrado.", 404);
  if (LIST_ONLY_SERIES.includes(event.series)) throw new PartnerError("Este evento é só por lista: o acesso vem do convite de um Insider.", 409);

  const eventTickets = await ticketsWithExpiry(event);
  const memberTickets = eventTickets.filter((t) => t.userId === user.id);
  const check = checkReservation({ event, batchId: input.batchId, eventTickets, memberTickets, memberLevel: user.prxLevel || 1 });
  if (!check.ok) throw new PartnerError(check.reason, 409);
  const ageValidation = await assertBuyerAge(event, user, input.birthDate, input.parentEmail);
  const { quote, promo } = await priceTicket(event, check.batch, user.id, input.promoCode);

  let runDetails: LiveTicket["runDetails"] = null;
  if (event.series === "run") {
    if (!event.run) throw new PartnerError("Inscrições desta etapa ainda não abriram.", 409);
    const parsed = runDetailsInputSchema.safeParse(input.run);
    if (!parsed.success) throw new PartnerError(parsed.error.issues[0]?.message || "Confira os dados da inscrição.", 422);
    if (!event.run.modalities.includes(parsed.data.modality)) throw new PartnerError("Distância indisponível nesta etapa.", 422);
    if (!event.run.categories.includes(parsed.data.category)) throw new PartnerError("Categoria indisponível nesta etapa.", 422);
    runDetails = { modality: parsed.data.modality, category: parsed.data.category, shirtSize: parsed.data.shirtSize, termsAcceptedAt: new Date().toISOString() };
  }

  let guardianConsent: GuardianConsent | null = null;
  if (ageValidation.isMinor && ageValidation.parentEmail) {
    const guardianToken = crypto.randomBytes(24).toString("hex");
    guardianConsent = {
      guardianEmail: ageValidation.parentEmail,
      status: "pending",
      token: guardianToken,
    };
  }

  const free = quote.total === 0 && check.batch.price === 0;
  const now = new Date().toISOString();
  const ticket = await insertWithFreshCode(event.series, {
    eventId: event.id,
    batchId: check.batch.id,
    batchName: check.batch.name,
    userId: user.id,
    userEmail: user.email.toLowerCase(),
    holderName: user.fullName || "Membro PRX",
    // Preço final calculado aqui; com desconto de 100% ainda é uma compra (confirmada pela PRX).
    price: quote.total,
    originalPrice: promo ? quote.original : null,
    discount: quote.discount,
    promoCodeId: promo?.id ?? null,
    isTest: false,
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
    guardianConsent,
  });

  const overflow = (await exceedsLimits(event, ticket)) ?? (promo ? await promoOverflow(promo, ticket) : null);
  if (overflow) {
    await repo().deleteTicket(ticket.id);
    throw new PartnerError(overflow, 409);
  }

  if (guardianConsent && ageValidation.parentEmail) {
    // Aguarda o envio (a função nunca lança): em serverless, tarefa solta depois da resposta pode ser cortada e o
    // responsável nunca receberia o link. Se o envio falhar, o membro reenvia pelo ingresso.
    await sendMinorAuthorizationEmail({
      ticketId: ticket.id,
      childUserId: user.id,
      childName: user.fullName || "Membro PRX",
      childEmail: user.email,
      parentEmail: ageValidation.parentEmail,
      token: guardianConsent.token,
      eventTitle: event.title,
      eventStartsAt: event.startsAt,
      eventVenue: event.venue,
      eventCity: event.city,
      eventAddress: event.address,
      eventAgeRating: ageRatingLabel(event.minAge),
      organizerName: event.organizerName,
    });
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
      .filter((t) => isRealActiveTicket(t) && t.source !== "invite")
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

/* -------------------------------------------------------------------------- */
/* Liberação e Autorização de Menores pelo Responsável Legal                  */
/* -------------------------------------------------------------------------- */

/** A liberação como a página do link mostra: sem o token (já é o endereço) nem IP; CPF só em parte. */
export type PublicGuardianConsent = Omit<GuardianConsent, "token" | "ip" | "userAgent">;

export interface GuardianAuthorizationView {
  token: string;
  status: GuardianApprovalStatus;
  ticketId: string;
  ticketCode: string;
  holderName: string;
  /** E-mail do menor, parcialmente oculto: o responsável só precisa reconhecer. */
  childEmail: string;
  parentEmail: string;
  event: {
    id: string;
    title: string;
    seriesLabel: string;
    startsAt: string;
    venue: string;
    city: string;
    address: string;
    ageRating: string;
    organizerName: string;
  };
  consent: PublicGuardianConsent;
  /** Documento que o responsável lê e aceita (versão vigente ou o texto padrão aguardando revisão jurídica). */
  document?: Pick<ConsentDocument, "title" | "version" | "body" | "certificateUrl" | "legalStatus">;
}

/** CPF da conta (identidade ou cadastro): o menor não pode se liberar com o próprio CPF. */
async function accountCpf(userId: string): Promise<string | null> {
  const identity = await getFamilyRepository()
    .getIdentity(userId)
    .catch(() => null);
  if (identity?.cpf) return identity.cpf;
  if (supabaseAdmin) {
    const { data } = await supabaseAdmin.from("profiles").select("cpf").eq("id", userId).maybeSingle();
    return String((data as { cpf?: string | null } | null)?.cpf ?? "").replace(/\D/g, "") || null;
  }
  return (userStore.findById(userId)?.cpf ?? "").replace(/\D/g, "") || null;
}

const docView = (doc: ConsentDocument) => ({ title: doc.title, version: doc.version, body: doc.body, certificateUrl: doc.certificateUrl, legalStatus: doc.legalStatus });

/** Ingresso, liberação e evento de um link de responsável (404 se o token não existe). */
async function findGuardianTicket(token: string): Promise<{ ticket: LiveTicket; consent: GuardianConsent; event: LiveEvent }> {
  if (!token || typeof token !== "string") throw new PartnerError("Token de autorização inválido.", 400);
  const ticket = await repo().getTicketByGuardianToken(token);
  if (!ticket || !ticket.guardianConsent) {
    throw new PartnerError("Pedido de autorização não encontrado ou link expirado.", 404);
  }
  const event = await repo().getEvent(ticket.eventId);
  if (!event) throw new PartnerError("Evento não encontrado.", 404);
  return { ticket, consent: ticket.guardianConsent, event };
}

function toAuthorizationView(token: string, ticket: LiveTicket, consent: GuardianConsent, event: LiveEvent): GuardianAuthorizationView {
  return {
    token,
    status: consent.status,
    ticketId: ticket.id,
    ticketCode: ticket.code,
    holderName: ticket.holderName,
    childEmail: maskEmail(ticket.userEmail),
    parentEmail: consent.guardianEmail,
    event: {
      id: event.id,
      title: event.title,
      seriesLabel: SERIES_LABEL[event.series],
      startsAt: event.startsAt,
      venue: event.venue,
      city: event.city,
      address: event.address,
      ageRating: ageRatingLabel(event.minAge),
      organizerName: event.organizerName,
    },
    consent: {
      guardianEmail: consent.guardianEmail,
      status: consent.status,
      guardianName: consent.guardianName ?? null,
      guardianCpf: consent.guardianCpf ? maskCpf(consent.guardianCpf) : null,
      relationship: consent.relationship ?? null,
      guardianPhone: consent.guardianPhone ?? null,
      respondedAt: consent.respondedAt ?? null,
      rejectionReason: consent.rejectionReason ?? null,
    },
  };
}

export async function getGuardianAuthorization(token: string): Promise<GuardianAuthorizationView> {
  const { ticket, consent, event } = await findGuardianTicket(token);
  return { ...toAuthorizationView(token, ticket, consent, event), document: docView(await activeConsentDocument()) };
}

export async function respondGuardianAuthorization(
  token: string,
  input: {
    action: "approve" | "reject";
    guardianName?: string;
    guardianCpf?: string;
    relationship?: string;
    guardianPhone?: string;
    rejectionReason?: string;
    guardianBirthDate?: string;
    consentAccepted?: boolean;
  },
  meta: { ip?: string; userAgent?: string } = {}
): Promise<GuardianAuthorizationView> {
  const { ticket, consent: current, event } = await findGuardianTicket(token);
  if (current.status !== "pending") {
    throw new PartnerError(`Esta autorização já foi ${current.status === "approved" ? "concedida" : "recusada"}.`, 409);
  }
  // Liberar um ingresso cancelado, ou de um evento que já terminou, não faz sentido.
  if (ticket.status === "cancelled") throw new PartnerError("Este ingresso foi cancelado: não há mais o que liberar.", 409);
  if (eventHasEnded(event)) throw new PartnerError("Este evento já terminou.", 409);

  const now = new Date().toISOString();
  let updatedConsent: GuardianConsent;

  if (input.action === "reject") {
    updatedConsent = {
      ...current,
      status: "rejected",
      respondedAt: now,
      rejectionReason: input.rejectionReason?.slice(0, 300) || "Recusado pelo responsável legal.",
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    };
  } else {
    const guardianName = (input.guardianName || "").trim();
    if (!guardianName || guardianName.length < 3) {
      throw new PartnerError("Informe o nome completo do responsável legal.", 422);
    }
    const rawCpf = (input.guardianCpf || "").replace(/\D/g, "");
    if (rawCpf.length !== 11 || !isValidCpf(rawCpf)) {
      throw new PartnerError("CPF do responsável legal inválido. Confira os 11 dígitos.", 422);
    }
    const relationship = (input.relationship || "").trim();
    if (!relationship) {
      throw new PartnerError("Informe o parentesco (Pai, Mãe ou Responsável Legal).", 422);
    }
    const birth = (input.guardianBirthDate || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birth) || Number.isNaN(Date.parse(birth))) throw new PartnerError("Informe a sua data de nascimento.", 422);
    if (ageOn(birth) < 18) throw new PartnerError("A liberação precisa ser feita por um responsável maior de idade.", 422);
    if (rawCpf === (await accountCpf(ticket.userId))) throw new PartnerError("O CPF do responsável precisa ser diferente do CPF do menor.", 422);
    if (input.consentAccepted !== true) throw new PartnerError("Leia e aceite o termo para liberar.", 422);
    // Receita (Serpro), quando configurada: CPF e nascimento precisam bater. Sem Serpro, fica registrado como autodeclarado.
    const check = await assertCpfMatchesBirth(rawCpf, birth, "guardian_consent");
    const doc = await activeConsentDocument();

    updatedConsent = {
      ...current,
      status: "approved",
      guardianName,
      guardianCpf: rawCpf,
      relationship,
      guardianPhone: input.guardianPhone?.trim() || null,
      respondedAt: now,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
      guardianBirthDate: birth,
      identityCheck: check === "verified" ? "receita" : "autodeclarado",
      documentVersion: doc.version,
      documentHash: documentHash(doc),
      documentLegalStatus: doc.legalStatus,
      biometric: "not_configured",
    };
  }

  // Condicional: só grava se ainda estiver pendente, então a primeira resposta vence (duas abas, dois cliques).
  const saved = await repo().updateGuardianConsent(ticket.id, updatedConsent);
  if (!saved) {
    const latest = (await repo().getTicket(ticket.id))?.guardianConsent?.status;
    if (latest && latest !== "pending") throw new PartnerError(`Esta autorização já foi ${latest === "approved" ? "concedida" : "recusada"}.`, 409);
    throw new PartnerError("Não foi possível atualizar a autorização.", 500);
  }

  return { ...toAuthorizationView(token, saved, updatedConsent, event), document: docView(await activeConsentDocument()) };
}

export async function resendGuardianAuthorization(user: StoredUser, ticketId: string): Promise<{ success: boolean; parentEmail: string }> {
  const ticket = await repo().getTicket(ticketId);
  if (!ticket || ticket.userId !== user.id) throw new PartnerError("Ingresso não encontrado.", 404);
  if (!ticket.guardianConsent) throw new PartnerError("Este ingresso não possui solicitação de autorização de responsável.", 400);
  if (ticket.guardianConsent.status !== "pending") {
    throw new PartnerError(`A autorização já foi ${ticket.guardianConsent.status === "approved" ? "aprovada" : "recusada"}.`, 409);
  }
  const event = await repo().getEvent(ticket.eventId);
  if (!event) throw new PartnerError("Evento não encontrado.", 404);
  // Não deixa o menor lotar a caixa de entrada do responsável.
  const limit = checkRateLimit(`guardian-resend:${ticket.id}`, 3, 3600);
  if (!limit.allowed) throw new PartnerError(`O e-mail já foi reenviado algumas vezes. Tente de novo em ${Math.ceil(limit.resetInSeconds / 60)} min.`, 429);

  await sendMinorAuthorizationEmail({
    ticketId: ticket.id,
    childUserId: user.id,
    childName: user.fullName || "Membro PRX",
    childEmail: user.email,
    parentEmail: ticket.guardianConsent.guardianEmail,
    token: ticket.guardianConsent.token,
    eventTitle: event.title,
    eventStartsAt: event.startsAt,
    eventVenue: event.venue,
    eventCity: event.city,
    eventAddress: event.address,
    eventAgeRating: ageRatingLabel(event.minAge),
    organizerName: event.organizerName,
    resend: true,
  });

  return { success: true, parentEmail: maskEmail(ticket.guardianConsent.guardianEmail) };
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
  /** Ingressos de teste (simulação/portaria): fora de todas as outras contas. */
  test: number;
  pending: number;
  valid: number;
  used: number;
  cancelled: number;
  confirmedRevenue: number;
  pendingRevenue: number;
  capacityLeft: number | null;
}

export function eventStats(event: Pick<LiveEvent, "capacity">, allTickets: ReadonlyArray<LiveTicket>): EventStats {
  const tickets = allTickets.filter((t) => !t.isTest);
  const by = (status: TicketStatus) => tickets.filter((t) => t.status === status);
  const active = tickets.filter(isActiveTicket).length;
  const sum = (list: LiveTicket[]) => Math.round(list.reduce((acc, t) => acc + t.price, 0) * 100) / 100;
  return {
    total: tickets.length,
    test: allTickets.length - tickets.length,
    pending: by("pending_payment").length,
    valid: by("valid").length,
    used: by("used").length,
    cancelled: by("cancelled").length,
    confirmedRevenue: sum([...by("valid"), ...by("used")].filter((t) => t.source === "purchase")),
    pendingRevenue: sum(by("pending_payment")),
    capacityLeft: event.capacity === null ? null : Math.max(0, event.capacity - active),
  };
}

export type AdminEvent = LiveEvent & { stats: EventStats; ended: boolean; readiness: EventReadiness };

export async function listAdminEvents(): Promise<AdminEvent[]> {
  const events = await repo().listEvents();
  const result: AdminEvent[] = [];
  for (const event of events) {
    const tickets = await ticketsWithExpiry(event);
    result.push({ ...event, stats: eventStats(event, tickets), ended: eventHasEnded(event), readiness: eventReadiness(event) });
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

/** Publicar exige os dados que o comprador precisa ver (idade, organizador, cancelamento…). */
function assertPublishable(event: Parameters<typeof eventReadiness>[0]) {
  const readiness = eventReadiness(event);
  if (!readiness.publishable) throw new PartnerError(`Antes de publicar, preencha: ${readiness.missing.join(", ")}.`, 422);
}

export async function createEvent(input: EventInput, actor: string): Promise<LiveEvent> {
  if (input.status === "published") assertPublishable({ ...input, doorTestVerifiedAt: null });
  const partnerName = await partnerNameFor(input.partnerId);
  return repo().insertEvent({ ...input, run: input.series === "run" ? input.run : null, partnerName, createdBy: actor, doorTestVerifiedAt: null, doorTestVerifiedBy: null });
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
  if (current.status === "published") assertPublishable({ ...input, status: current.status, doorTestVerifiedAt: current.doorTestVerifiedAt });
  // O status muda só por setEventStatus, que confere ingressos e cancelamentos.
  return repo().updateEvent(id, { ...input, status: current.status, run, partnerName });
}

export async function setEventStatus(id: string, status: EventStatus): Promise<LiveEvent> {
  const current = await repo().getEvent(id);
  if (!current) throw new PartnerError("Evento não encontrado.", 404);
  if (current.status === "cancelled" && status !== "cancelled") throw new PartnerError("Evento cancelado não pode ser reaberto. Crie um novo.", 409);
  if (status === "published" && current.status !== "published") assertPublishable(current);
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
  return { event, tickets: tickets.map(redactGuardian), stats: eventStats(event, tickets) };
}

export async function confirmPayment(ticketId: string, note: string): Promise<LiveTicket> {
  const ticket = await repo().getTicket(ticketId);
  if (!ticket) throw new PartnerError("Ingresso não encontrado.", 404);
  if (ticket.status !== "pending_payment") throw new PartnerError("Este ingresso não está aguardando pagamento.", 409);
  const updated = await repo().updateTicket(ticketId, { status: "valid", paidAt: new Date().toISOString(), note: note.slice(0, 300) }, ["pending_payment"]);
  if (!updated) throw new PartnerError("A reserva mudou de situação (expirou ou foi cancelada). Atualize a lista.", 409);
  return redactGuardian(updated);
}

export async function adminCancelTicket(ticketId: string, note: string): Promise<LiveTicket> {
  const updated = await repo().updateTicket(ticketId, { status: "cancelled", cancelledAt: new Date().toISOString(), note: note.slice(0, 300) }, ["pending_payment", "valid"]);
  if (!updated) throw new PartnerError("Só reservas e ingressos válidos podem ser cancelados.", 409);
  return redactGuardian(updated);
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
    originalPrice: null,
    discount: 0,
    promoCodeId: null,
    isTest: false,
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
  // Convite também respeita a idade do evento. Sem data na conta, a portaria confere o documento.
  if (event.minAge) {
    const birth = await buyerBirthDate(member.id);
    const check = checkAgeEligibility(event.minAge, birth.birthDate, event.startsAt);
    if (!check.ok && check.code === "UNDER_AGE") throw new PartnerError(`Este membro não tem a idade mínima do evento (${event.minAge} anos).`, 409);
  }
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

/** Na portaria: só contagens de entrada, sem nenhum valor financeiro. */
export type DoorStats = Pick<EventStats, "total" | "pending" | "valid" | "used" | "capacityLeft">;

export interface DoorEventView {
  event: PublicEvent;
  stats: DoorStats;
  attendees: Array<{ code: string; name: string; batchName: string; status: TicketStatus; checkedInAt: string | null; isTest: boolean }>;
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
    const stats = eventStats(event, tickets);
    views.push({
      event: toPublicEvent(event, tickets),
      stats: { total: stats.total, pending: stats.pending, valid: stats.valid, used: stats.used, capacityLeft: stats.capacityLeft },
      attendees: tickets
        .filter((t) => t.status === "valid" || t.status === "used")
        .sort((a, b) => Number(a.isTest) - Number(b.isTest) || a.holderName.localeCompare(b.holderName, "pt-BR"))
        .map((t) => ({ code: t.code, name: scope.fullNames ? t.holderName : doorName(t.holderName), batchName: t.batchName, status: t.status, checkedInAt: t.checkedInAt, isTest: t.isTest })),
    });
  }
  return views;
}
