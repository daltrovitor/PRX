// Hello World
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/client";
import { PartnerError, dbError } from "@/lib/partners/errors";
import { GUARDIAN_MIGRATION_HINT, LAUNCH_MIGRATION_HINT, guardianSchemaReady, launchSchemaReady } from "@/lib/db-features";
import {
  EVENT_SERIES,
  EVENT_STATUSES,
  FOUNDERS_STATUSES,
  TICKET_STATUSES,
  type EventSeries,
  type EventStatus,
  type FoundersStatus,
  type FoundersSubmission,
  type GuardianApprovalStatus,
  type GuardianConsent,
  type LiveEvent,
  type LiveTicket,
  type RunConfig,
  type RunDetails,
  type StartupStage,
  type TicketBatch,
  type TicketStatus,
  type ValidatorRole,
} from "@/lib/live/types";

/**
 * Persistência do PRX LIVE. Com Supabase, tudo vai para o banco e erros sobem
 * (ingresso não pode existir só na memória de uma instância). Sem Supabase
 * (desenvolvimento), um store em memória preservado no globalThis.
 */

export type NewEvent = Omit<LiveEvent, "id" | "createdAt" | "updatedAt">;
export type EventPatch = Partial<Omit<LiveEvent, "id" | "createdAt" | "createdBy">>;
export type NewTicket = Omit<LiveTicket, "id">;
export type TicketPatch = Partial<Pick<LiveTicket, "status" | "paidAt" | "cancelledAt" | "checkedInAt" | "checkedInBy" | "checkedInByRole" | "checkedInByName" | "note" | "guardianConsent">>;
export interface TicketFilter {
  eventId?: string;
  eventIds?: string[];
  userId?: string;
  checkedInBy?: string;
  promoCodeId?: string;
  limit?: number;
}
export type NewSubmission = Omit<FoundersSubmission, "id" | "createdAt" | "updatedAt">;

export interface LiveRepository {
  readonly mode: "supabase" | "memory";
  listEvents(filter?: { statuses?: EventStatus[]; partnerId?: string; staffCheckin?: boolean }): Promise<LiveEvent[]>;
  getEvent(id: string): Promise<LiveEvent | null>;
  insertEvent(event: NewEvent): Promise<LiveEvent>;
  updateEvent(id: string, patch: EventPatch): Promise<LiveEvent>;
  deleteEvent(id: string): Promise<void>;

  listTickets(filter: TicketFilter): Promise<LiveTicket[]>;
  getTicket(id: string): Promise<LiveTicket | null>;
  getTicketByCode(code: string): Promise<LiveTicket | null>;
  getTicketByGuardianToken(token: string): Promise<LiveTicket | null>;
  insertTicket(ticket: NewTicket): Promise<LiveTicket>;
  /** Atualização condicional: só aplica se o status atual estiver em `fromStatuses`. */
  updateTicket(id: string, patch: TicketPatch, fromStatuses: TicketStatus[]): Promise<LiveTicket | null>;
  /** Grava a resposta do responsável. Condicional: só aplica se a liberação ainda estiver em `fromStatus` (padrão: pendente), então a primeira resposta vence. */
  updateGuardianConsent(ticketId: string, consent: GuardianConsent, fromStatus?: GuardianApprovalStatus): Promise<LiveTicket | null>;
  deleteTicket(id: string): Promise<void>;
  /** Ids dos N primeiros ingressos ativos (ordem de criação, sem os de teste): base do controle de lotação. */
  firstActiveTicketIds(eventId: string, limit: number, batchId?: string): Promise<string[]>;
  /** Ids dos N primeiros ingressos ativos (sem teste) com o cupom, opcionalmente de uma pessoa: limite de uso. */
  firstPromoTicketIds(promoCodeId: string, limit: number, userId?: string): Promise<string[]>;

  listSubmissions(filter?: { userId?: string }): Promise<FoundersSubmission[]>;
  getSubmission(id: string): Promise<FoundersSubmission | null>;
  insertSubmission(submission: NewSubmission): Promise<FoundersSubmission>;
  updateSubmission(id: string, patch: Partial<Pick<FoundersSubmission, "status" | "adminNote" | "deckPath">>): Promise<FoundersSubmission>;

  saveDeck(submissionId: string, file: { bytes: Uint8Array; contentType: string }): Promise<string>;
  deckUrl(path: string): Promise<{ url: string } | { bytes: Uint8Array; contentType: string } | null>;
}

/* -------------------------------------------------------------------------- */
/* Mapeamento de linhas                                                        */
/* -------------------------------------------------------------------------- */

interface EventRow {
  id: string;
  series: string;
  title: string;
  summary: string;
  starts_at: string;
  ends_at: string | null;
  venue: string;
  city: string;
  address: string | null;
  cover_url: string | null;
  capacity: number | null;
  per_user_limit: number;
  min_prx_level: number;
  partner_id: string | null;
  partner_name: string | null;
  staff_checkin: boolean;
  min_age?: number | null;
  id_check_required?: boolean | null;
  entry_requirements?: string | null;
  cancellation_policy?: string | null;
  organizer_name?: string | null;
  door_test_verified_at?: string | null;
  door_test_verified_by?: string | null;
  status: string;
  batches: unknown;
  run: unknown;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
}

interface TicketRow {
  id: string;
  code: string;
  event_id: string;
  batch_id: string;
  batch_name: string;
  user_id: string;
  user_email: string;
  holder_name: string;
  price: number | string;
  status: string;
  source: string;
  run_details: unknown;
  issued_by: string | null;
  note: string | null;
  created_at: string;
  paid_at: string | null;
  cancelled_at: string | null;
  checked_in_at: string | null;
  checked_in_by: string | null;
  checked_in_by_role: string | null;
  checked_in_by_name: string | null;
  is_test?: boolean | null;
  original_price?: number | string | null;
  discount?: number | string | null;
  promo_code_id?: string | null;
  guardian_consent?: unknown | null;
}

interface SubmissionRow {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  startup_name: string;
  one_liner: string;
  stage: string;
  video_url: string | null;
  deck_file_name: string | null;
  deck_path: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
  updated_at: string | null;
}

const oneOf = <T extends string>(list: readonly T[], value: unknown, fallback: T): T => (list.includes(value as T) ? (value as T) : fallback);

function mapEvent(r: EventRow): LiveEvent {
  return {
    id: r.id,
    series: oneOf<EventSeries>(EVENT_SERIES, r.series, "outro"),
    title: r.title,
    summary: r.summary,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    venue: r.venue,
    city: r.city,
    address: r.address ?? "",
    coverUrl: r.cover_url ?? "",
    capacity: r.capacity,
    perUserLimit: r.per_user_limit,
    minPrxLevel: r.min_prx_level,
    partnerId: r.partner_id,
    partnerName: r.partner_name,
    staffCheckin: r.staff_checkin,
    minAge: r.min_age ?? null,
    idCheckRequired: Boolean(r.id_check_required),
    entryRequirements: r.entry_requirements ?? "",
    cancellationPolicy: r.cancellation_policy ?? "",
    organizerName: r.organizer_name ?? "",
    doorTestVerifiedAt: r.door_test_verified_at ?? null,
    doorTestVerifiedBy: r.door_test_verified_by ?? null,
    status: oneOf<EventStatus>(EVENT_STATUSES, r.status, "draft"),
    batches: Array.isArray(r.batches) ? (r.batches as TicketBatch[]) : [],
    run: (r.run as RunConfig | null) ?? null,
    createdBy: r.created_by ?? "",
    createdAt: r.created_at,
    updatedAt: r.updated_at ?? r.created_at,
  };
}

function eventToRow(e: EventPatch): Record<string, unknown> {
  const map: Record<string, string> = {
    series: "series",
    title: "title",
    summary: "summary",
    startsAt: "starts_at",
    endsAt: "ends_at",
    venue: "venue",
    city: "city",
    address: "address",
    coverUrl: "cover_url",
    capacity: "capacity",
    perUserLimit: "per_user_limit",
    minPrxLevel: "min_prx_level",
    partnerId: "partner_id",
    partnerName: "partner_name",
    staffCheckin: "staff_checkin",
    minAge: "min_age",
    idCheckRequired: "id_check_required",
    entryRequirements: "entry_requirements",
    cancellationPolicy: "cancellation_policy",
    organizerName: "organizer_name",
    doorTestVerifiedAt: "door_test_verified_at",
    doorTestVerifiedBy: "door_test_verified_by",
    status: "status",
    batches: "batches",
    run: "run",
  };
  const row: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(map)) {
    const value = (e as Record<string, unknown>)[key];
    if (value !== undefined) row[column] = value;
  }
  return row;
}

/** Liberação do responsável: coluna jsonb própria (nunca dentro da nota, que o admin reescreve ao confirmar ou cancelar). */
function parseGuardianConsent(r: TicketRow): GuardianConsent | null {
  const value = r.guardian_consent;
  if (value && typeof value === "object") return value as GuardianConsent;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as GuardianConsent;
    } catch {
      return null;
    }
  }
  return null;
}

function mapTicket(r: TicketRow): LiveTicket {
  return {
    id: r.id,
    code: r.code,
    eventId: r.event_id,
    batchId: r.batch_id,
    batchName: r.batch_name,
    userId: r.user_id,
    userEmail: r.user_email,
    holderName: r.holder_name,
    price: Number(r.price),
    status: oneOf<TicketStatus>(TICKET_STATUSES, r.status, "valid"),
    source: r.source === "invite" ? "invite" : r.source === "free" ? "free" : "purchase",
    runDetails: (r.run_details as RunDetails | null) ?? null,
    issuedBy: r.issued_by,
    note: r.note ?? "",
    createdAt: r.created_at,
    paidAt: r.paid_at,
    cancelledAt: r.cancelled_at,
    checkedInAt: r.checked_in_at,
    checkedInBy: r.checked_in_by,
    checkedInByRole: (r.checked_in_by_role as ValidatorRole | null) ?? null,
    checkedInByName: r.checked_in_by_name,
    isTest: Boolean(r.is_test),
    originalPrice: r.original_price === null || r.original_price === undefined ? null : Number(r.original_price),
    discount: Number(r.discount ?? 0),
    promoCodeId: r.promo_code_id ?? null,
    guardianConsent: parseGuardianConsent(r),
  };
}

function ticketToRow(t: Partial<LiveTicket>): Record<string, unknown> {
  const map: Record<string, string> = {
    code: "code",
    eventId: "event_id",
    batchId: "batch_id",
    batchName: "batch_name",
    userId: "user_id",
    userEmail: "user_email",
    holderName: "holder_name",
    price: "price",
    status: "status",
    source: "source",
    runDetails: "run_details",
    issuedBy: "issued_by",
    note: "note",
    createdAt: "created_at",
    paidAt: "paid_at",
    cancelledAt: "cancelled_at",
    checkedInAt: "checked_in_at",
    checkedInBy: "checked_in_by",
    checkedInByRole: "checked_in_by_role",
    checkedInByName: "checked_in_by_name",
    isTest: "is_test",
    originalPrice: "original_price",
    discount: "discount",
    promoCodeId: "promo_code_id",
    guardianConsent: "guardian_consent",
  };
  const row: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(map)) {
    const value = (t as Record<string, unknown>)[key];
    if (value !== undefined) row[column] = value;
  }
  return row;
}

function mapSubmission(r: SubmissionRow): FoundersSubmission {
  return {
    id: r.id,
    userId: r.user_id,
    userEmail: r.user_email,
    userName: r.user_name,
    startupName: r.startup_name,
    oneLiner: r.one_liner,
    stage: oneOf<StartupStage>(["ideia", "mvp", "tracao"], r.stage, "ideia"),
    videoUrl: r.video_url ?? "",
    deckFileName: r.deck_file_name ?? "",
    deckPath: r.deck_path,
    status: oneOf<FoundersStatus>(FOUNDERS_STATUSES, r.status, "sent"),
    adminNote: r.admin_note ?? "",
    createdAt: r.created_at,
    updatedAt: r.updated_at ?? r.created_at,
  };
}

/* -------------------------------------------------------------------------- */
/* Supabase                                                                    */
/* -------------------------------------------------------------------------- */

type SupabaseClient = NonNullable<typeof supabaseAdmin>;
const FOUNDERS_BUCKET = "founders";

/** Colunas da migração do lançamento e o valor que elas têm quando o recurso não é usado. */
const LAUNCH_EVENT_DEFAULTS: Record<string, unknown> = {
  min_age: null,
  id_check_required: false,
  entry_requirements: "",
  cancellation_policy: "",
  organizer_name: "",
  door_test_verified_at: null,
  door_test_verified_by: null,
};
const LAUNCH_TICKET_DEFAULTS: Record<string, unknown> = { is_test: false, original_price: null, discount: 0, promo_code_id: null };

/**
 * Antes da migração do lançamento, grava só as colunas antigas. Se o pedido usa
 * um recurso novo (idade mínima, teste, cupom), recusa em vez de perder o dado.
 */
async function compatRow(row: Record<string, unknown>, defaults: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (await launchSchemaReady()) return row;
  const legacy: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(row)) {
    if (!(column in defaults)) {
      legacy[column] = value;
      continue;
    }
    if (value !== undefined && value !== defaults[column]) throw new PartnerError(LAUNCH_MIGRATION_HINT, 503);
  }
  return legacy;
}

/**
 * A coluna guardian_consent vem em outra migração (20261012). Sem ela, o ingresso
 * de maior de idade segue normal (a coluna vazia é descartada); o de menor é
 * recusado com o aviso, em vez de perder o registro da liberação do responsável.
 */
async function guardianCompat(row: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!("guardian_consent" in row) || (await guardianSchemaReady())) return row;
  if (row.guardian_consent !== null && row.guardian_consent !== undefined) throw new PartnerError(GUARDIAN_MIGRATION_HINT, 503);
  const legacy = { ...row };
  delete legacy.guardian_consent;
  return legacy;
}

class SupabaseLiveRepository implements LiveRepository {
  readonly mode = "supabase" as const;
  constructor(private readonly db: SupabaseClient) {}

  async listEvents(filter?: { statuses?: EventStatus[]; partnerId?: string; staffCheckin?: boolean }) {
    let query = this.db.from("live_events").select("*").order("starts_at", { ascending: true });
    if (filter?.statuses) query = query.in("status", filter.statuses);
    if (filter?.partnerId) query = query.eq("partner_id", filter.partnerId);
    if (filter?.staffCheckin !== undefined) query = query.eq("staff_checkin", filter.staffCheckin);
    const { data, error } = await query;
    if (error) throw dbError(error, "Não foi possível listar os eventos");
    return (data as EventRow[]).map(mapEvent);
  }

  async getEvent(id: string) {
    const { data, error } = await this.db.from("live_events").select("*").eq("id", id).maybeSingle();
    if (error) {
      if (error.code === "22P02") return null;
      throw dbError(error, "Não foi possível consultar o evento");
    }
    return data ? mapEvent(data as EventRow) : null;
  }

  async insertEvent(event: NewEvent) {
    const { data, error } = await this.db
      .from("live_events")
      .insert({ ...(await compatRow(eventToRow(event), LAUNCH_EVENT_DEFAULTS)), created_by: event.createdBy })
      .select("*")
      .single();
    if (error) throw dbError(error, "Não foi possível criar o evento");
    return mapEvent(data as EventRow);
  }

  async updateEvent(id: string, patch: EventPatch) {
    const { data, error } = await this.db
      .from("live_events")
      .update({ ...(await compatRow(eventToRow(patch), LAUNCH_EVENT_DEFAULTS)), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw dbError(error, "Não foi possível atualizar o evento");
    if (!data) throw new PartnerError("Evento não encontrado.", 404);
    return mapEvent(data as EventRow);
  }

  async deleteEvent(id: string) {
    const { error } = await this.db.from("live_events").delete().eq("id", id);
    if (error) throw dbError(error, "Não foi possível excluir o evento");
  }

  async listTickets(filter: TicketFilter) {
    let query = this.db.from("live_tickets").select("*").order("created_at", { ascending: false });
    if (filter.promoCodeId) {
      if (!(await launchSchemaReady())) return [];
      query = query.eq("promo_code_id", filter.promoCodeId);
    }
    if (filter.eventId) query = query.eq("event_id", filter.eventId);
    if (filter.eventIds) {
      if (filter.eventIds.length === 0) return [];
      query = query.in("event_id", filter.eventIds);
    }
    if (filter.userId) query = query.eq("user_id", filter.userId);
    if (filter.checkedInBy) query = query.eq("checked_in_by", filter.checkedInBy);
    query = query.limit(filter.limit ?? 20_000);
    const { data, error } = await query;
    if (error) {
      if (error.code === "22P02") return [];
      throw dbError(error, "Não foi possível listar os ingressos");
    }
    return (data as TicketRow[]).map(mapTicket);
  }

  async getTicket(id: string) {
    const { data, error } = await this.db.from("live_tickets").select("*").eq("id", id).maybeSingle();
    if (error) {
      if (error.code === "22P02") return null;
      throw dbError(error, "Não foi possível consultar o ingresso");
    }
    return data ? mapTicket(data as TicketRow) : null;
  }

  async getTicketByCode(code: string) {
    const { data, error } = await this.db.from("live_tickets").select("*").eq("code", code).maybeSingle();
    if (error) throw dbError(error, "Não foi possível consultar o ingresso");
    return data ? mapTicket(data as TicketRow) : null;
  }

  async getTicketByGuardianToken(token: string) {
    if (!(await guardianSchemaReady())) return null;
    const { data, error } = await this.db.from("live_tickets").select("*").eq("guardian_consent->>token", token).maybeSingle();
    if (error) throw dbError(error, "Não foi possível consultar a liberação do responsável");
    return data ? mapTicket(data as TicketRow) : null;
  }

  async insertTicket(ticket: NewTicket) {
    const { data, error } = await this.db
      .from("live_tickets")
      .insert(await guardianCompat(await compatRow(ticketToRow(ticket), LAUNCH_TICKET_DEFAULTS)))
      .select("*")
      .single();
    if (error) throw dbError(error, "Não foi possível emitir o ingresso");
    return mapTicket(data as TicketRow);
  }

  async updateTicket(id: string, patch: TicketPatch, fromStatuses: TicketStatus[]) {
    const { data, error } = await this.db.from("live_tickets").update(await guardianCompat(ticketToRow(patch))).eq("id", id).in("status", fromStatuses).select("*");
    if (error) throw dbError(error, "Não foi possível atualizar o ingresso");
    const rows = data as TicketRow[];
    return rows.length > 0 ? mapTicket(rows[0]) : null;
  }

  async updateGuardianConsent(ticketId: string, consent: GuardianConsent, fromStatus: GuardianApprovalStatus = "pending") {
    if (!(await guardianSchemaReady())) throw new PartnerError(GUARDIAN_MIGRATION_HINT, 503);
    const { data, error } = await this.db
      .from("live_tickets")
      .update({ guardian_consent: consent })
      .eq("id", ticketId)
      .eq("guardian_consent->>status", fromStatus)
      .select("*")
      .maybeSingle();
    if (error) throw dbError(error, "Não foi possível registrar a liberação do responsável");
    return data ? mapTicket(data as TicketRow) : null;
  }

  async deleteTicket(id: string) {
    const { error } = await this.db.from("live_tickets").delete().eq("id", id);
    if (error) throw dbError(error, "Não foi possível desfazer a reserva");
  }

  async firstActiveTicketIds(eventId: string, limit: number, batchId?: string) {
    let query = this.db
      .from("live_tickets")
      .select("id")
      .eq("event_id", eventId)
      .in("status", ["pending_payment", "valid", "used"])
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(limit);
    if (batchId) query = query.eq("batch_id", batchId);
    if (await launchSchemaReady()) query = query.eq("is_test", false);
    const { data, error } = await query;
    if (error) throw dbError(error, "Não foi possível conferir a lotação");
    return (data as Array<{ id: string }>).map((r) => r.id);
  }

  async firstPromoTicketIds(promoCodeId: string, limit: number, userId?: string) {
    let query = this.db
      .from("live_tickets")
      .select("id")
      .eq("promo_code_id", promoCodeId)
      .eq("is_test", false)
      .in("status", ["pending_payment", "valid", "used"])
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(limit);
    if (userId) query = query.eq("user_id", userId);
    const { data, error } = await query;
    if (error) throw dbError(error, "Não foi possível conferir o uso do cupom");
    return (data as Array<{ id: string }>).map((r) => r.id);
  }

  async listSubmissions(filter?: { userId?: string }) {
    let query = this.db.from("live_founders_submissions").select("*").order("created_at", { ascending: false });
    if (filter?.userId) query = query.eq("user_id", filter.userId);
    const { data, error } = await query;
    if (error) {
      if (error.code === "22P02") return [];
      throw dbError(error, "Não foi possível listar as submissões");
    }
    return (data as SubmissionRow[]).map(mapSubmission);
  }

  async getSubmission(id: string) {
    const { data, error } = await this.db.from("live_founders_submissions").select("*").eq("id", id).maybeSingle();
    if (error) {
      if (error.code === "22P02") return null;
      throw dbError(error, "Não foi possível consultar a submissão");
    }
    return data ? mapSubmission(data as SubmissionRow) : null;
  }

  async insertSubmission(s: NewSubmission) {
    const { data, error } = await this.db
      .from("live_founders_submissions")
      .insert({
        user_id: s.userId,
        user_email: s.userEmail,
        user_name: s.userName,
        startup_name: s.startupName,
        one_liner: s.oneLiner,
        stage: s.stage,
        video_url: s.videoUrl || null,
        deck_file_name: s.deckFileName || null,
        deck_path: s.deckPath,
        status: s.status,
        admin_note: s.adminNote || null,
      })
      .select("*")
      .single();
    if (error) throw dbError(error, "Não foi possível enviar a startup");
    return mapSubmission(data as SubmissionRow);
  }

  async updateSubmission(id: string, patch: Partial<Pick<FoundersSubmission, "status" | "adminNote" | "deckPath">>) {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.adminNote !== undefined) row.admin_note = patch.adminNote;
    if (patch.deckPath !== undefined) row.deck_path = patch.deckPath;
    const { data, error } = await this.db.from("live_founders_submissions").update(row).eq("id", id).select("*").maybeSingle();
    if (error) throw dbError(error, "Não foi possível atualizar a submissão");
    if (!data) throw new PartnerError("Submissão não encontrada.", 404);
    return mapSubmission(data as SubmissionRow);
  }

  async saveDeck(submissionId: string, file: { bytes: Uint8Array; contentType: string }) {
    const path = `${submissionId}/${crypto.randomBytes(6).toString("hex")}.pdf`;
    const { error } = await this.db.storage.from(FOUNDERS_BUCKET).upload(path, file.bytes, { contentType: file.contentType, upsert: false });
    if (error) throw new PartnerError("Não foi possível guardar o pitch deck. Tente de novo.", 500);
    return path;
  }

  async deckUrl(path: string) {
    const { data, error } = await this.db.storage.from(FOUNDERS_BUCKET).createSignedUrl(path, 300);
    if (error || !data?.signedUrl) return null;
    return { url: data.signedUrl };
  }
}

/* -------------------------------------------------------------------------- */
/* Memória (desenvolvimento)                                                   */
/* -------------------------------------------------------------------------- */

interface MemoryState {
  events: LiveEvent[];
  tickets: LiveTicket[];
  submissions: FoundersSubmission[];
  decks: Map<string, { bytes: Uint8Array; contentType: string }>;
}

const clone = <T,>(value: T): T => structuredClone(value);
const newId = (prefix: string) => `${prefix}_${crypto.randomBytes(6).toString("hex")}`;

class MemoryLiveRepository implements LiveRepository {
  readonly mode = "memory" as const;
  constructor(private readonly state: MemoryState) {}

  async listEvents(filter?: { statuses?: EventStatus[]; partnerId?: string; staffCheckin?: boolean }) {
    return clone(
      this.state.events
        .filter((e) => !filter?.statuses || filter.statuses.includes(e.status))
        .filter((e) => !filter?.partnerId || e.partnerId === filter.partnerId)
        .filter((e) => filter?.staffCheckin === undefined || e.staffCheckin === filter.staffCheckin)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    );
  }

  async getEvent(id: string) {
    const found = this.state.events.find((e) => e.id === id);
    return found ? clone(found) : null;
  }

  async insertEvent(event: NewEvent) {
    const now = new Date().toISOString();
    const created: LiveEvent = { ...clone(event), id: newId("evt"), createdAt: now, updatedAt: now };
    this.state.events.push(created);
    return clone(created);
  }

  async updateEvent(id: string, patch: EventPatch) {
    const index = this.state.events.findIndex((e) => e.id === id);
    if (index === -1) throw new PartnerError("Evento não encontrado.", 404);
    this.state.events[index] = { ...this.state.events[index], ...clone(patch), updatedAt: new Date().toISOString() };
    return clone(this.state.events[index]);
  }

  async deleteEvent(id: string) {
    this.state.events = this.state.events.filter((e) => e.id !== id);
  }

  async listTickets(filter: TicketFilter) {
    return clone(
      this.state.tickets
        .filter((t) => !filter.promoCodeId || t.promoCodeId === filter.promoCodeId)
        .filter((t) => !filter.eventId || t.eventId === filter.eventId)
        .filter((t) => !filter.eventIds || filter.eventIds.includes(t.eventId))
        .filter((t) => !filter.userId || t.userId === filter.userId)
        .filter((t) => !filter.checkedInBy || t.checkedInBy === filter.checkedInBy)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, filter.limit ?? 20_000)
    );
  }

  async getTicket(id: string) {
    const found = this.state.tickets.find((t) => t.id === id);
    return found ? clone(found) : null;
  }

  async getTicketByCode(code: string) {
    const found = this.state.tickets.find((t) => t.code === code);
    return found ? clone(found) : null;
  }

  async getTicketByGuardianToken(token: string) {
    const found = this.state.tickets.find((t) => t.guardianConsent?.token === token);
    return found ? clone(found) : null;
  }

  async insertTicket(ticket: NewTicket) {
    if (this.state.tickets.some((t) => t.code === ticket.code)) throw new PartnerError("Código repetido.", 409);
    const created: LiveTicket = { ...clone(ticket), id: newId("tkt") };
    this.state.tickets.push(created);
    return clone(created);
  }

  async updateTicket(id: string, patch: TicketPatch, fromStatuses: TicketStatus[]) {
    const index = this.state.tickets.findIndex((t) => t.id === id);
    if (index === -1 || !fromStatuses.includes(this.state.tickets[index].status)) return null;
    this.state.tickets[index] = { ...this.state.tickets[index], ...clone(patch) };
    return clone(this.state.tickets[index]);
  }

  async updateGuardianConsent(ticketId: string, consent: GuardianConsent, fromStatus: GuardianApprovalStatus = "pending") {
    const index = this.state.tickets.findIndex((t) => t.id === ticketId);
    if (index === -1 || this.state.tickets[index].guardianConsent?.status !== fromStatus) return null;
    this.state.tickets[index] = { ...this.state.tickets[index], guardianConsent: clone(consent) };
    return clone(this.state.tickets[index]);
  }

  async deleteTicket(id: string) {
    this.state.tickets = this.state.tickets.filter((t) => t.id !== id);
  }

  async firstActiveTicketIds(eventId: string, limit: number, batchId?: string) {
    return this.state.tickets
      .filter((t) => t.eventId === eventId && !t.isTest && (!batchId || t.batchId === batchId) && ["pending_payment", "valid", "used"].includes(t.status))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .slice(0, limit)
      .map((t) => t.id);
  }

  async firstPromoTicketIds(promoCodeId: string, limit: number, userId?: string) {
    return this.state.tickets
      .filter((t) => t.promoCodeId === promoCodeId && !t.isTest && (!userId || t.userId === userId) && ["pending_payment", "valid", "used"].includes(t.status))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .slice(0, limit)
      .map((t) => t.id);
  }

  async listSubmissions(filter?: { userId?: string }) {
    return clone(
      this.state.submissions.filter((s) => !filter?.userId || s.userId === filter.userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    );
  }

  async getSubmission(id: string) {
    const found = this.state.submissions.find((s) => s.id === id);
    return found ? clone(found) : null;
  }

  async insertSubmission(s: NewSubmission) {
    const now = new Date().toISOString();
    const created: FoundersSubmission = { ...clone(s), id: newId("fnd"), createdAt: now, updatedAt: now };
    this.state.submissions.push(created);
    return clone(created);
  }

  async updateSubmission(id: string, patch: Partial<Pick<FoundersSubmission, "status" | "adminNote" | "deckPath">>) {
    const index = this.state.submissions.findIndex((s) => s.id === id);
    if (index === -1) throw new PartnerError("Submissão não encontrada.", 404);
    this.state.submissions[index] = { ...this.state.submissions[index], ...patch, updatedAt: new Date().toISOString() };
    return clone(this.state.submissions[index]);
  }

  async saveDeck(submissionId: string, file: { bytes: Uint8Array; contentType: string }) {
    const key = `mem:${submissionId}`;
    this.state.decks.set(key, file);
    return key;
  }

  async deckUrl(path: string) {
    return this.state.decks.get(path) ?? null;
  }
}

const globalState = globalThis as unknown as { __prxLiveState?: MemoryState };

function memoryState(): MemoryState {
  globalState.__prxLiveState ??= { events: [], tickets: [], submissions: [], decks: new Map() };
  return globalState.__prxLiveState;
}

export function getLiveRepository(): LiveRepository {
  return supabaseAdmin ? new SupabaseLiveRepository(supabaseAdmin) : new MemoryLiveRepository(memoryState());
}
