// Hello World
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/client";
import type { AcceptanceRow, BenefitEventRow, CampaignRevisionRow, CampaignRow, PartnerRow } from "@/lib/db-rows";
import { PartnerError, dbError } from "@/lib/partners/errors";
import { normalizeBadges } from "@/lib/badges/catalog";
import { prepareBadgesWrite } from "@/lib/badges/schema";
import type { AgeBand, MetricEvent } from "@/lib/partners/metrics";
import { isAgeBand } from "@/lib/partners/metrics";
import {
  CAMPAIGN_STATUSES,
  PARTNER_STATUSES,
  type Campaign,
  type CampaignRevision,
  type CampaignStatus,
  type CommercialSummary,
  type ContractAcceptance,
  type Partner,
  type PartnerContact,
  type PartnerRepresentative,
  type PartnerSnapshot,
  type PartnerStatus,
} from "@/lib/partners/types";

/**
 * Persistência do programa de parceiros.
 *
 * Com Supabase configurado, tudo vai para o banco e erros sobem: contrato e
 * aceite nunca podem ficar só em memória (sumiriam no próximo cold start).
 * Sem Supabase (desenvolvimento local), usa um store em memória preservado no
 * globalThis entre recarregamentos do Next.
 */

/** Selos são opcionais no cadastro (sem eles, lista vazia). */
export type NewPartner = Omit<Partner, "id" | "createdAt" | "updatedAt" | "badges"> & Partial<Pick<Partner, "badges">>;
export type PartnerPatch = Partial<Omit<Partner, "id" | "createdAt" | "updatedAt">>;
export type NewCampaign = Omit<Campaign, "id" | "createdAt" | "updatedAt">;
export type CampaignPatch = Partial<Omit<Campaign, "id" | "partnerId" | "createdAt" | "createdBy">>;
export type NewAcceptance = Omit<ContractAcceptance, "id">;

export interface EventInput {
  benefitId: string;
  partnerId: string;
  kind: "impression" | "click";
  ageBand: AgeBand;
}

export interface PartnerRepository {
  readonly mode: "supabase" | "memory";
  listPartners(): Promise<Partner[]>;
  getPartner(id: string): Promise<Partner | null>;
  getPartnerByOwner(userId: string, email?: string | null): Promise<Partner | null>;
  insertPartner(partner: NewPartner): Promise<Partner>;
  updatePartner(id: string, patch: PartnerPatch): Promise<Partner>;

  listCampaigns(filter?: { partnerId?: string }): Promise<Campaign[]>;
  getCampaign(id: string): Promise<Campaign | null>;
  insertCampaign(campaign: NewCampaign): Promise<Campaign>;
  /**
   * Atualização condicional: só aplica se o status (e a versão, quando informada)
   * ainda forem os esperados. Retorna null quando outra ação chegou antes.
   */
  updateCampaign(id: string, patch: CampaignPatch, expected: { statuses: CampaignStatus[]; version?: number }): Promise<Campaign | null>;
  insertRevision(revision: CampaignRevision): Promise<void>;
  listRevisions(campaignId: string): Promise<CampaignRevision[]>;

  insertAcceptance(acceptance: NewAcceptance): Promise<ContractAcceptance>;
  getAcceptanceByCampaign(campaignId: string): Promise<ContractAcceptance | null>;
  listAcceptances(filter?: { partnerId?: string }): Promise<ContractAcceptance[]>;

  recordEvents(events: EventInput[]): Promise<void>;
  listEvents(benefitIds: string[], since: string): Promise<MetricEvent[]>;
}

/* -------------------------------------------------------------------------- */
/* Normalização de JSON vindo do banco                                         */
/* -------------------------------------------------------------------------- */

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asRepresentative(value: unknown): PartnerRepresentative {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return { name: str(v.name), document: str(v.document), role: str(v.role), email: str(v.email), phone: str(v.phone) };
}

function asContact(value: unknown): PartnerContact {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return { name: str(v.name), phone: str(v.phone), email: str(v.email) };
}

function asPartnerStatus(value: unknown): PartnerStatus {
  return (PARTNER_STATUSES as readonly string[]).includes(String(value)) ? (value as PartnerStatus) : "PENDENTE";
}

function asCampaignStatus(value: unknown): CampaignStatus {
  return (CAMPAIGN_STATUSES as readonly string[]).includes(String(value)) ? (value as CampaignStatus) : "draft";
}

function mapPartner(row: PartnerRow): Partner {
  return {
    id: row.id,
    tradeName: row.name,
    legalName: row.company_name || row.name,
    documentType: row.document_type === "CPF" ? "CPF" : "CNPJ",
    document: row.document || "",
    categoryId: row.category_id || "",
    location: row.location || "",
    description: row.description || "",
    logoUrl: row.logo_url || "",
    bannerUrl: row.banner_url || "",
    status: asPartnerStatus(row.status),
    ownerUserId: row.owner_id || null,
    ownerEmail: row.owner_email || null,
    representative: asRepresentative(row.representative),
    contact: asContact(row.contact),
    badges: normalizeBadges(row.badges),
    createdAt: row.created_at || new Date(0).toISOString(),
    updatedAt: row.updated_at || row.created_at || new Date(0).toISOString(),
  };
}

function partnerToRow(p: PartnerPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (p.tradeName !== undefined) row.name = p.tradeName;
  if (p.legalName !== undefined) row.company_name = p.legalName;
  if (p.documentType !== undefined) row.document_type = p.documentType;
  if (p.document !== undefined) row.document = p.document;
  if (p.categoryId !== undefined) row.category_id = p.categoryId;
  if (p.location !== undefined) row.location = p.location;
  if (p.description !== undefined) row.description = p.description;
  if (p.logoUrl !== undefined) row.logo_url = p.logoUrl || null;
  if (p.bannerUrl !== undefined) row.banner_url = p.bannerUrl || null;
  if (p.status !== undefined) row.status = p.status;
  if (p.ownerUserId !== undefined) row.owner_id = p.ownerUserId;
  if (p.ownerEmail !== undefined) row.owner_email = p.ownerEmail;
  if (p.representative !== undefined) row.representative = p.representative;
  if (p.contact !== undefined) row.contact = p.contact;
  if (p.badges !== undefined) row.badges = p.badges;
  return row;
}

function mapCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    partnerId: row.partner_id,
    status: asCampaignStatus(row.status),
    version: Number(row.version) || 1,
    summary: row.summary as CommercialSummary,
    benefitId: row.benefit_id || null,
    createdBy: row.created_by || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
    sentAt: row.sent_at || null,
    acceptedAt: row.accepted_at || null,
    cancelledAt: row.cancelled_at || null,
    cancelReason: row.cancel_reason || null,
  };
}

function campaignToRow(c: CampaignPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (c.status !== undefined) row.status = c.status;
  if (c.version !== undefined) row.version = c.version;
  if (c.summary !== undefined) row.summary = c.summary;
  if (c.benefitId !== undefined) row.benefit_id = c.benefitId;
  if (c.updatedAt !== undefined) row.updated_at = c.updatedAt;
  if (c.sentAt !== undefined) row.sent_at = c.sentAt;
  if (c.acceptedAt !== undefined) row.accepted_at = c.acceptedAt;
  if (c.cancelledAt !== undefined) row.cancelled_at = c.cancelledAt;
  if (c.cancelReason !== undefined) row.cancel_reason = c.cancelReason;
  return row;
}

function mapAcceptance(row: AcceptanceRow): ContractAcceptance {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    partnerId: row.partner_id,
    certificateId: row.certificate_id,
    termsVersion: row.terms_version,
    campaignVersion: Number(row.campaign_version),
    contentHash: row.content_hash,
    partnerSnapshot: row.partner_snapshot as PartnerSnapshot,
    summarySnapshot: row.summary_snapshot as CommercialSummary,
    declaration: row.declaration,
    acceptedAt: row.accepted_at,
    userId: row.user_id,
    userEmail: row.user_email,
    authMethod: row.auth_method,
    ipAddress: row.ip_address ?? null,
    userAgent: row.user_agent ?? null,
  };
}

/* -------------------------------------------------------------------------- */
/* Supabase                                                                    */
/* -------------------------------------------------------------------------- */

type SupabaseClient = NonNullable<typeof supabaseAdmin>;

class SupabasePartnerRepository implements PartnerRepository {
  readonly mode = "supabase" as const;
  constructor(private readonly db: SupabaseClient) {}

  async listPartners() {
    const { data, error } = await this.db.from("partners").select("*").order("created_at", { ascending: false });
    if (error) throw dbError(error, "Não foi possível listar os parceiros");
    return (data as PartnerRow[]).map(mapPartner);
  }

  async getPartner(id: string) {
    const { data, error } = await this.db.from("partners").select("*").eq("id", id).maybeSingle();
    if (error) {
      if (error.code === "22P02") return null; // id que não é uuid
      throw dbError(error, "Não foi possível consultar o parceiro");
    }
    return data ? mapPartner(data as PartnerRow) : null;
  }

  async getPartnerByOwner(userId: string, email?: string | null) {
    const { data, error } = await this.db.from("partners").select("*").eq("owner_id", userId).maybeSingle();
    if (error && error.code !== "22P02") throw dbError(error, "Não foi possível consultar o parceiro da conta");
    if (data) return mapPartner(data as PartnerRow);
    if (!email) return null;
    const byEmail = await this.db.from("partners").select("*").eq("owner_email", email.toLowerCase()).maybeSingle();
    if (byEmail.error) throw dbError(byEmail.error, "Não foi possível consultar o parceiro da conta");
    return byEmail.data ? mapPartner(byEmail.data as PartnerRow) : null;
  }

  async insertPartner(partner: NewPartner) {
    const row = partnerToRow(partner);
    await prepareBadgesWrite("partners", row);
    const { data, error } = await this.db.from("partners").insert(row).select("*").single();
    if (error) throw dbError(error, "Não foi possível cadastrar o parceiro");
    return mapPartner(data as PartnerRow);
  }

  async updatePartner(id: string, patch: PartnerPatch) {
    const row = partnerToRow(patch);
    await prepareBadgesWrite("partners", row);
    const { data, error } = await this.db
      .from("partners")
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw dbError(error, "Não foi possível atualizar o parceiro");
    if (!data) throw new PartnerError("Parceiro não encontrado.", 404);
    return mapPartner(data as PartnerRow);
  }

  async listCampaigns(filter?: { partnerId?: string }) {
    let query = this.db.from("partner_campaigns").select("*").order("created_at", { ascending: false });
    if (filter?.partnerId) query = query.eq("partner_id", filter.partnerId);
    const { data, error } = await query;
    if (error) throw dbError(error, "Não foi possível listar as campanhas");
    return (data as CampaignRow[]).map(mapCampaign);
  }

  async getCampaign(id: string) {
    const { data, error } = await this.db.from("partner_campaigns").select("*").eq("id", id).maybeSingle();
    if (error) {
      if (error.code === "22P02") return null;
      throw dbError(error, "Não foi possível consultar a campanha");
    }
    return data ? mapCampaign(data as CampaignRow) : null;
  }

  async insertCampaign(campaign: NewCampaign) {
    const { data, error } = await this.db
      .from("partner_campaigns")
      .insert({ partner_id: campaign.partnerId, created_by: campaign.createdBy, ...campaignToRow(campaign) })
      .select("*")
      .single();
    if (error) throw dbError(error, "Não foi possível criar a campanha");
    return mapCampaign(data as CampaignRow);
  }

  async updateCampaign(id: string, patch: CampaignPatch, expected: { statuses: CampaignStatus[]; version?: number }) {
    let query = this.db
      .from("partner_campaigns")
      .update({ ...campaignToRow(patch), updated_at: new Date().toISOString() })
      .eq("id", id)
      .in("status", expected.statuses);
    if (expected.version !== undefined) query = query.eq("version", expected.version);
    const { data, error } = await query.select("*");
    if (error) throw dbError(error, "Não foi possível atualizar a campanha");
    const rows = data as CampaignRow[];
    return rows.length > 0 ? mapCampaign(rows[0]) : null;
  }

  async insertRevision(revision: CampaignRevision) {
    const row: CampaignRevisionRow = {
      campaign_id: revision.campaignId,
      version: revision.version,
      summary: revision.summary,
      changed_by: revision.changedBy,
      changed_at: revision.changedAt,
    };
    const { error } = await this.db.from("partner_campaign_revisions").insert(row);
    if (error) throw dbError(error, "Não foi possível registrar a revisão do Resumo Comercial");
  }

  async listRevisions(campaignId: string) {
    const { data, error } = await this.db
      .from("partner_campaign_revisions")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("version", { ascending: true });
    if (error) throw dbError(error, "Não foi possível listar as revisões");
    return (data as CampaignRevisionRow[]).map((r) => ({
      campaignId: r.campaign_id,
      version: r.version,
      summary: r.summary as CommercialSummary,
      changedBy: r.changed_by,
      changedAt: r.changed_at,
    }));
  }

  async insertAcceptance(a: NewAcceptance) {
    const { data, error } = await this.db
      .from("partner_contract_acceptances")
      .insert({
        campaign_id: a.campaignId,
        partner_id: a.partnerId,
        certificate_id: a.certificateId,
        terms_version: a.termsVersion,
        campaign_version: a.campaignVersion,
        content_hash: a.contentHash,
        partner_snapshot: a.partnerSnapshot,
        summary_snapshot: a.summarySnapshot,
        declaration: a.declaration,
        accepted_at: a.acceptedAt,
        user_id: a.userId,
        user_email: a.userEmail,
        auth_method: a.authMethod,
        ip_address: a.ipAddress,
        user_agent: a.userAgent,
      })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") throw new PartnerError("Esta campanha já foi aceita.", 409);
      throw dbError(error, "Não foi possível registrar o aceite");
    }
    return mapAcceptance(data as AcceptanceRow);
  }

  async getAcceptanceByCampaign(campaignId: string) {
    const { data, error } = await this.db.from("partner_contract_acceptances").select("*").eq("campaign_id", campaignId).maybeSingle();
    if (error) {
      if (error.code === "22P02") return null;
      throw dbError(error, "Não foi possível consultar o aceite");
    }
    return data ? mapAcceptance(data as AcceptanceRow) : null;
  }

  async listAcceptances(filter?: { partnerId?: string }) {
    let query = this.db.from("partner_contract_acceptances").select("*").order("accepted_at", { ascending: false });
    if (filter?.partnerId) query = query.eq("partner_id", filter.partnerId);
    const { data, error } = await query;
    if (error) throw dbError(error, "Não foi possível listar os aceites");
    return (data as AcceptanceRow[]).map(mapAcceptance);
  }

  async recordEvents(events: EventInput[]) {
    if (events.length === 0) return;
    const { error } = await this.db.from("benefit_events").insert(
      events.map((e) => ({ benefit_id: e.benefitId, partner_id: e.partnerId, kind: e.kind, age_band: e.ageBand }))
    );
    if (error) throw dbError(error, "Não foi possível registrar as métricas");
  }

  async listEvents(benefitIds: string[], since: string) {
    if (benefitIds.length === 0) return [];
    const { data, error } = await this.db
      .from("benefit_events")
      .select("benefit_id, kind, age_band, created_at")
      .in("benefit_id", benefitIds)
      .gte("created_at", since)
      .limit(50_000);
    if (error) throw dbError(error, "Não foi possível consultar as métricas");
    return (data as BenefitEventRow[]).map((row) => ({
      benefitId: row.benefit_id,
      kind: row.kind === "click" ? ("click" as const) : ("impression" as const),
      ageBand: isAgeBand(row.age_band) ? row.age_band : ("nao_informado" as const),
      createdAt: row.created_at,
    }));
  }
}

/* -------------------------------------------------------------------------- */
/* Memória (desenvolvimento)                                                   */
/* -------------------------------------------------------------------------- */

interface MemoryState {
  partners: Partner[];
  campaigns: Campaign[];
  revisions: CampaignRevision[];
  acceptances: ContractAcceptance[];
  events: Array<MetricEvent & { partnerId: string }>;
}

const clone = <T,>(value: T): T => structuredClone(value);
const newId = (prefix: string) => `${prefix}_${crypto.randomBytes(6).toString("hex")}`;

class MemoryPartnerRepository implements PartnerRepository {
  readonly mode = "memory" as const;
  constructor(private readonly state: MemoryState) {}

  async listPartners() {
    return clone([...this.state.partners].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }

  async getPartner(id: string) {
    const found = this.state.partners.find((p) => p.id === id);
    return found ? clone(found) : null;
  }

  async getPartnerByOwner(userId: string, email?: string | null) {
    const lower = email?.toLowerCase();
    const found =
      this.state.partners.find((p) => p.ownerUserId === userId) ??
      (lower ? this.state.partners.find((p) => p.ownerEmail?.toLowerCase() === lower) : undefined);
    return found ? clone(found) : null;
  }

  async insertPartner(partner: NewPartner) {
    if (partner.ownerUserId && this.state.partners.some((p) => p.ownerUserId === partner.ownerUserId)) {
      throw new PartnerError("Esta conta já está vinculada a outro parceiro.", 409);
    }
    const now = new Date().toISOString();
    const created: Partner = { badges: [], ...clone(partner), id: newId("prt"), createdAt: now, updatedAt: now };
    this.state.partners.push(created);
    return clone(created);
  }

  async updatePartner(id: string, patch: PartnerPatch) {
    const index = this.state.partners.findIndex((p) => p.id === id);
    if (index === -1) throw new PartnerError("Parceiro não encontrado.", 404);
    if (patch.ownerUserId && this.state.partners.some((p) => p.id !== id && p.ownerUserId === patch.ownerUserId)) {
      throw new PartnerError("Esta conta já está vinculada a outro parceiro.", 409);
    }
    this.state.partners[index] = { ...this.state.partners[index], ...clone(patch), updatedAt: new Date().toISOString() };
    return clone(this.state.partners[index]);
  }

  async listCampaigns(filter?: { partnerId?: string }) {
    return clone(
      this.state.campaigns
        .filter((c) => !filter?.partnerId || c.partnerId === filter.partnerId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    );
  }

  async getCampaign(id: string) {
    const found = this.state.campaigns.find((c) => c.id === id);
    return found ? clone(found) : null;
  }

  async insertCampaign(campaign: NewCampaign) {
    const now = new Date().toISOString();
    const created: Campaign = { ...clone(campaign), id: newId("cmp"), createdAt: now, updatedAt: now };
    this.state.campaigns.push(created);
    return clone(created);
  }

  async updateCampaign(id: string, patch: CampaignPatch, expected: { statuses: CampaignStatus[]; version?: number }) {
    const index = this.state.campaigns.findIndex((c) => c.id === id);
    if (index === -1) return null;
    const current = this.state.campaigns[index];
    if (!expected.statuses.includes(current.status)) return null;
    if (expected.version !== undefined && current.version !== expected.version) return null;
    this.state.campaigns[index] = { ...current, ...clone(patch), updatedAt: new Date().toISOString() };
    return clone(this.state.campaigns[index]);
  }

  async insertRevision(revision: CampaignRevision) {
    this.state.revisions.push(clone(revision));
  }

  async listRevisions(campaignId: string) {
    return clone(this.state.revisions.filter((r) => r.campaignId === campaignId).sort((a, b) => a.version - b.version));
  }

  async insertAcceptance(a: NewAcceptance) {
    if (this.state.acceptances.some((x) => x.campaignId === a.campaignId)) {
      throw new PartnerError("Esta campanha já foi aceita.", 409);
    }
    const created: ContractAcceptance = { ...clone(a), id: newId("acc") };
    this.state.acceptances.push(created);
    return clone(created);
  }

  async getAcceptanceByCampaign(campaignId: string) {
    const found = this.state.acceptances.find((a) => a.campaignId === campaignId);
    return found ? clone(found) : null;
  }

  async listAcceptances(filter?: { partnerId?: string }) {
    return clone(this.state.acceptances.filter((a) => !filter?.partnerId || a.partnerId === filter.partnerId));
  }

  async recordEvents(events: EventInput[]) {
    const createdAt = new Date().toISOString();
    events.forEach((e) => this.state.events.push({ benefitId: e.benefitId, partnerId: e.partnerId, kind: e.kind, ageBand: e.ageBand, createdAt }));
  }

  async listEvents(benefitIds: string[], since: string) {
    const ids = new Set(benefitIds);
    return clone(
      this.state.events
        .filter((e) => ids.has(e.benefitId) && e.createdAt >= since)
        .map(({ benefitId, kind, ageBand, createdAt }) => ({ benefitId, kind, ageBand, createdAt }))
    );
  }
}

const globalState = globalThis as unknown as { __prxPartnerState?: MemoryState };

function memoryState(): MemoryState {
  if (!globalState.__prxPartnerState) {
    globalState.__prxPartnerState = { partners: [], campaigns: [], revisions: [], acceptances: [], events: [] };
  }
  return globalState.__prxPartnerState;
}

export function getPartnerRepository(): PartnerRepository {
  return supabaseAdmin ? new SupabasePartnerRepository(supabaseAdmin) : new MemoryPartnerRepository(memoryState());
}
