// Hello World
import type { supabaseAdmin } from "@/lib/supabase/client";
import { dbError } from "@/lib/partners/errors";
import type {
  EditionPatch,
  InsiderPatch,
  NewEdition,
  NewInsider,
  NewParticipation,
  NewRequest,
  ParticipationPatch,
  RequestPatch,
  ResenhaRepository,
} from "@/lib/resenha/repository";
import {
  EDITION_STATUSES,
  HOST_ARTICLES,
  INSIDER_KINDS,
  REQUEST_STATUSES,
  type AccessRequest,
  type EditionInsider,
  type Insider,
  type RequestStatus,
  type ResenhaEdition,
} from "@/lib/resenha/types";

type SupabaseClient = NonNullable<typeof supabaseAdmin>;

const oneOf = <T extends string>(list: readonly T[], value: unknown, fallback: T): T => (list.includes(value as T) ? (value as T) : fallback);
/** Id fora do formato uuid (22P02) é "não achei", não erro. */
const isBadId = (error: { code?: string }) => error.code === "22P02";

interface EditionRow {
  id: string;
  event_id: string;
  number: number;
  slug: string;
  host_name: string;
  host_article: string;
  status: string;
  created_at: string;
  updated_at: string | null;
}
const mapEdition = (r: EditionRow): ResenhaEdition => ({
  id: r.id,
  eventId: r.event_id,
  number: r.number,
  slug: r.slug,
  hostName: r.host_name,
  hostArticle: oneOf(HOST_ARTICLES, r.host_article, "da"),
  status: oneOf(EDITION_STATUSES, r.status, "draft"),
  createdAt: r.created_at,
  updatedAt: r.updated_at ?? r.created_at,
});

interface InsiderRow {
  id: string;
  user_id: string;
  email: string;
  name: string;
  handle: string | null;
  avatar_url?: string | null;
  active: boolean;
  created_at: string;
}
const mapInsider = (r: InsiderRow): Insider => ({ id: r.id, userId: r.user_id, email: r.email, name: r.name, handle: r.handle ?? "", avatarUrl: r.avatar_url ?? "", active: r.active, createdAt: r.created_at });

interface ParticipationRow {
  id: string;
  edition_id: string;
  insider_id: string;
  kind: string;
  code: string;
  quota: number;
  active: boolean;
  created_at: string;
}
const mapParticipation = (r: ParticipationRow): EditionInsider => ({
  id: r.id,
  editionId: r.edition_id,
  insiderId: r.insider_id,
  kind: oneOf(INSIDER_KINDS, r.kind, "insider"),
  code: r.code,
  quota: r.quota,
  active: r.active,
  createdAt: r.created_at,
});

interface RequestRow {
  id: string;
  edition_id: string;
  edition_insider_id: string;
  name: string;
  email: string;
  whatsapp: string | null;
  instagram: string | null;
  birth_date: string;
  status: string;
  token: string;
  ticket_id: string | null;
  decided_at: string | null;
  decided_by: string | null;
  created_at: string;
}
const mapRequest = (r: RequestRow): AccessRequest => ({
  id: r.id,
  editionId: r.edition_id,
  editionInsiderId: r.edition_insider_id,
  name: r.name,
  email: r.email,
  whatsapp: r.whatsapp ?? "",
  instagram: r.instagram ?? "",
  birthDate: r.birth_date,
  status: oneOf(REQUEST_STATUSES, r.status, "pending"),
  token: r.token,
  ticketId: r.ticket_id,
  decidedAt: r.decided_at,
  decidedBy: r.decided_by,
  createdAt: r.created_at,
});

const compact = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));

export class SupabaseResenhaRepository implements ResenhaRepository {
  readonly mode = "supabase" as const;
  constructor(private readonly db: SupabaseClient) {}

  async listEditions() {
    const { data, error } = await this.db.from("resenha_editions").select("*").order("number", { ascending: false });
    if (error) throw dbError(error, "Não foi possível listar as edições");
    return (data as EditionRow[]).map(mapEdition);
  }

  async getEdition(id: string) {
    const { data, error } = await this.db.from("resenha_editions").select("*").eq("id", id).maybeSingle();
    if (error) {
      if (isBadId(error)) return null;
      throw dbError(error, "Não foi possível consultar a edição");
    }
    return data ? mapEdition(data as EditionRow) : null;
  }

  async getEditionBySlug(slug: string) {
    const { data, error } = await this.db.from("resenha_editions").select("*").eq("slug", slug).maybeSingle();
    if (error) throw dbError(error, "Não foi possível consultar a edição");
    return data ? mapEdition(data as EditionRow) : null;
  }

  async nextEditionNumber() {
    const { data, error } = await this.db.from("resenha_editions").select("number").order("number", { ascending: false }).limit(1);
    if (error) throw dbError(error, "Não foi possível numerar a edição");
    return ((data as Array<{ number: number }>)[0]?.number ?? 0) + 1;
  }

  async insertEdition(edition: NewEdition) {
    const { data, error } = await this.db
      .from("resenha_editions")
      .insert({ event_id: edition.eventId, number: edition.number, host_name: edition.hostName, host_article: edition.hostArticle, status: edition.status })
      .select("*")
      .single();
    if (error) throw dbError(error, "Não foi possível criar a edição");
    return mapEdition(data as EditionRow);
  }

  async updateEdition(id: string, patch: EditionPatch) {
    const row = compact({ host_name: patch.hostName, host_article: patch.hostArticle, status: patch.status, updated_at: new Date().toISOString() });
    const { data, error } = await this.db.from("resenha_editions").update(row).eq("id", id).select("*").single();
    if (error) throw dbError(error, "Não foi possível atualizar a edição");
    return mapEdition(data as EditionRow);
  }

  async listInsiders() {
    const { data, error } = await this.db.from("resenha_insiders").select("*").order("name", { ascending: true });
    if (error) throw dbError(error, "Não foi possível listar os Insiders");
    return (data as InsiderRow[]).map(mapInsider);
  }

  private async oneInsider(column: "id" | "user_id" | "email", value: string) {
    const { data, error } = await this.db.from("resenha_insiders").select("*").eq(column, value).maybeSingle();
    if (error) {
      if (isBadId(error)) return null;
      throw dbError(error, "Não foi possível consultar o Insider");
    }
    return data ? mapInsider(data as InsiderRow) : null;
  }
  getInsider(id: string) {
    return this.oneInsider("id", id);
  }
  getInsiderByUser(userId: string) {
    return this.oneInsider("user_id", userId);
  }
  getInsiderByEmail(email: string) {
    return this.oneInsider("email", email.toLowerCase());
  }

  async insertInsider(insider: NewInsider) {
    const { data, error } = await this.db
      .from("resenha_insiders")
      .insert({ user_id: insider.userId, email: insider.email, name: insider.name, handle: insider.handle || null, active: insider.active, ...(insider.avatarUrl && { avatar_url: insider.avatarUrl }) })
      .select("*")
      .single();
    if (error) throw dbError(error, "Não foi possível cadastrar o Insider");
    return mapInsider(data as InsiderRow);
  }

  async updateInsider(id: string, patch: InsiderPatch) {
    const row = compact({ name: patch.name, handle: patch.handle === undefined ? undefined : patch.handle || null, avatar_url: patch.avatarUrl === undefined ? undefined : patch.avatarUrl || null, active: patch.active, updated_at: new Date().toISOString() });
    const { data, error } = await this.db.from("resenha_insiders").update(row).eq("id", id).select("*").single();
    if (error) throw dbError(error, "Não foi possível atualizar o Insider");
    return mapInsider(data as InsiderRow);
  }

  async listParticipations(filter: { editionId?: string; insiderId?: string } = {}) {
    let query = this.db.from("resenha_edition_insiders").select("*").order("created_at", { ascending: true });
    if (filter.editionId) query = query.eq("edition_id", filter.editionId);
    if (filter.insiderId) query = query.eq("insider_id", filter.insiderId);
    const { data, error } = await query;
    if (error) throw dbError(error, "Não foi possível listar os Insiders da edição");
    return (data as ParticipationRow[]).map(mapParticipation);
  }

  async getParticipation(id: string) {
    const { data, error } = await this.db.from("resenha_edition_insiders").select("*").eq("id", id).maybeSingle();
    if (error) {
      if (isBadId(error)) return null;
      throw dbError(error, "Não foi possível consultar o Insider da edição");
    }
    return data ? mapParticipation(data as ParticipationRow) : null;
  }

  async getParticipationByCode(code: string) {
    const { data, error } = await this.db.from("resenha_edition_insiders").select("*").eq("code", code).maybeSingle();
    if (error) throw dbError(error, "Não foi possível consultar o link");
    return data ? mapParticipation(data as ParticipationRow) : null;
  }

  async insertParticipation(p: NewParticipation) {
    const { data, error } = await this.db
      .from("resenha_edition_insiders")
      .insert({ edition_id: p.editionId, insider_id: p.insiderId, kind: p.kind, code: p.code, quota: p.quota, active: p.active })
      .select("*")
      .single();
    if (error) throw dbError(error, "Não foi possível adicionar o Insider à edição");
    return mapParticipation(data as ParticipationRow);
  }

  async updateParticipation(id: string, patch: ParticipationPatch) {
    const { data, error } = await this.db.from("resenha_edition_insiders").update(compact({ kind: patch.kind, quota: patch.quota, active: patch.active })).eq("id", id).select("*").single();
    if (error) throw dbError(error, "Não foi possível atualizar o Insider da edição");
    return mapParticipation(data as ParticipationRow);
  }

  async listRequests(filter: { editionId?: string; editionInsiderId?: string }) {
    let query = this.db.from("resenha_requests").select("*").order("created_at", { ascending: false }).order("id", { ascending: false }).limit(5000);
    if (filter.editionId) query = query.eq("edition_id", filter.editionId);
    if (filter.editionInsiderId) query = query.eq("edition_insider_id", filter.editionInsiderId);
    const { data, error } = await query;
    if (error) throw dbError(error, "Não foi possível listar os pedidos");
    return (data as RequestRow[]).map(mapRequest);
  }

  async getRequest(id: string) {
    const { data, error } = await this.db.from("resenha_requests").select("*").eq("id", id).maybeSingle();
    if (error) {
      if (isBadId(error)) return null;
      throw dbError(error, "Não foi possível consultar o pedido");
    }
    return data ? mapRequest(data as RequestRow) : null;
  }

  async getRequestByToken(token: string) {
    const { data, error } = await this.db.from("resenha_requests").select("*").eq("token", token).maybeSingle();
    if (error) throw dbError(error, "Não foi possível consultar o pedido");
    return data ? mapRequest(data as RequestRow) : null;
  }

  async findRequest(editionId: string, email: string) {
    const { data, error } = await this.db.from("resenha_requests").select("*").eq("edition_id", editionId).eq("email", email.toLowerCase()).maybeSingle();
    if (error) throw dbError(error, "Não foi possível consultar o pedido");
    return data ? mapRequest(data as RequestRow) : null;
  }

  async insertRequest(r: NewRequest) {
    const { data, error } = await this.db
      .from("resenha_requests")
      .insert({
        edition_id: r.editionId,
        edition_insider_id: r.editionInsiderId,
        name: r.name,
        email: r.email,
        whatsapp: r.whatsapp || null,
        instagram: r.instagram || null,
        birth_date: r.birthDate,
        token: r.token,
      })
      .select("*")
      .single();
    if (error) throw dbError(error, "Não foi possível registrar o pedido");
    return mapRequest(data as RequestRow);
  }

  async updateRequest(id: string, patch: RequestPatch, fromStatuses: RequestStatus[]) {
    const row = compact({ status: patch.status, ticket_id: patch.ticketId, decided_at: patch.decidedAt, decided_by: patch.decidedBy });
    const { data, error } = await this.db.from("resenha_requests").update(row).eq("id", id).in("status", fromStatuses).select("*");
    if (error) throw dbError(error, "Não foi possível atualizar o pedido");
    const rows = data as RequestRow[];
    return rows[0] ? mapRequest(rows[0]) : null;
  }

  async firstApprovedIds(editionInsiderId: string, limit: number) {
    const { data, error } = await this.db
      .from("resenha_requests")
      .select("id")
      .eq("edition_insider_id", editionInsiderId)
      .eq("status", "approved")
      .order("decided_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(limit);
    if (error) throw dbError(error, "Não foi possível conferir a cota");
    return (data as Array<{ id: string }>).map((r) => r.id);
  }
}
