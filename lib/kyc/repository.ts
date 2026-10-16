// Hello World
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/client";
import { PartnerError, dbError } from "@/lib/partners/errors";
import type { DocumentRef, IncomeRange, TeenPath } from "@/lib/family/types";
import type { BankKycApplication, DocumentReviews, KycAddress, KycEvent, KycStatus, RiskFlag } from "@/lib/kyc/types";

/**
 * Pedidos de abertura do PRX BANK: tabela bank_kyc_applications no Supabase
 * (só service role; o cliente não lê nem grava); memória no desenvolvimento.
 */
/** Campos da análise da PRX que mudam enquanto a abertura está em análise. */
export type KycReviewPatch = Partial<Pick<BankKycApplication, "documents" | "documentReviews" | "resubmissionRequestedAt" | "documentsPurgedAt">>;

export interface KycSearch {
  status: KycStatus | "all" | "resubmission";
  q: string;
  offset: number;
  limit: number;
}

export type NewKycEvent = Omit<KycEvent, "id" | "createdAt">;

export type NewKycApplication = Omit<
  BankKycApplication,
  "id" | "status" | "reviewNote" | "reviewedBy" | "reviewedAt" | "createdAt" | "documentReviews" | "resubmissionRequestedAt" | "documentsPurgedAt"
> & { documentReviews?: DocumentReviews };

export interface KycRepository {
  insert(app: NewKycApplication): Promise<BankKycApplication>;
  latestForUser(userId: string): Promise<BankKycApplication | null>;
  get(id: string): Promise<BankKycApplication | null>;
  list(status: KycStatus | "all"): Promise<BankKycApplication[]>;
  /** Pedidos aprovados com este CPF (no máximo um, pelo índice único). */
  approvedForCpf(cpf: string): Promise<BankKycApplication[]>;
  /** Decide só pedidos pendentes (null se outra pessoa decidiu antes). */
  decide(id: string, status: KycStatus, note: string, reviewer: string): Promise<BankKycApplication | null>;
  /** Grava a análise documento a documento (só em pedidos `onlyStatus`, padrão: em análise). null se o pedido mudou. */
  updateReview(id: string, patch: KycReviewPatch, onlyStatus?: KycStatus): Promise<BankKycApplication | null>;
  /** Fila do admin com busca (nome, e-mail ou CPF) e paginação. */
  search(query: KycSearch): Promise<{ items: BankKycApplication[]; total: number }>;
  /** Pedidos recusados antes de `before` que ainda guardam arquivos (retenção). */
  listForPurge(before: string, limit: number): Promise<BankKycApplication[]>;
  insertEvent(event: NewKycEvent): Promise<void>;
  listEvents(applicationId: string, limit: number): Promise<KycEvent[]>;
}

interface KycRow {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  cpf: string;
  birth_date: string;
  mother_name: string;
  phone: string;
  occupation: string;
  income_range: IncomeRange;
  pep: boolean;
  address: KycAddress;
  documents: DocumentRef[] | null;
  minor_path: TeenPath | null;
  risk_flags: RiskFlag[] | null;
  status: KycStatus;
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
  document_reviews?: DocumentReviews | null;
  resubmission_requested_at?: string | null;
  documents_purged_at?: string | null;
}

interface EventRow {
  id: string;
  application_id: string;
  user_id: string;
  actor: string;
  actor_role: KycEvent["actorRole"];
  action: KycEvent["action"];
  document_kind: KycEvent["documentKind"];
  detail: string | null;
  created_at: string;
}

const mapEvent = (r: EventRow): KycEvent => ({
  id: r.id,
  applicationId: r.application_id,
  userId: r.user_id,
  actor: r.actor,
  actorRole: r.actor_role,
  action: r.action,
  documentKind: r.document_kind,
  detail: r.detail ?? "",
  createdAt: r.created_at,
});

const map = (r: KycRow): BankKycApplication => ({
  id: r.id,
  userId: r.user_id,
  email: r.email,
  fullName: r.full_name,
  cpf: r.cpf,
  birthDate: String(r.birth_date).slice(0, 10),
  motherName: r.mother_name,
  phone: r.phone,
  occupation: r.occupation,
  incomeRange: r.income_range,
  pep: r.pep,
  address: r.address,
  documents: r.documents ?? [],
  minorPath: r.minor_path,
  riskFlags: r.risk_flags ?? [],
  status: r.status,
  reviewNote: r.review_note ?? "",
  reviewedBy: r.reviewed_by,
  reviewedAt: r.reviewed_at,
  ip: r.ip,
  userAgent: r.user_agent ?? "",
  createdAt: r.created_at,
  documentReviews: r.document_reviews ?? {},
  resubmissionRequestedAt: r.resubmission_requested_at ?? null,
  documentsPurgedAt: r.documents_purged_at ?? null,
});

/** Busca do admin: só letras, números, @, ponto, hífen e espaço (nada que quebre o filtro do PostgREST). */
export const cleanSearch = (q: string): string => q.replace(/[^\p{L}\p{N}@.\- ]/gu, "").trim().slice(0, 80);

function fail(action: string, error: { message: string; code?: string } | null): void {
  if (error) throw dbError(error, `Falha ao ${action}`);
}

function supabaseRepository(): KycRepository {
  const table = () => supabaseAdmin!.from("bank_kyc_applications");
  return {
    async insert(app) {
      const { data, error } = await table()
        .insert({
          user_id: app.userId,
          email: app.email,
          full_name: app.fullName,
          cpf: app.cpf,
          birth_date: app.birthDate,
          mother_name: app.motherName?.trim() || "Não informado",
          phone: app.phone,
          occupation: app.occupation,
          income_range: app.incomeRange,
          pep: app.pep,
          address: app.address,
          documents: app.documents,
          minor_path: app.minorPath,
          risk_flags: app.riskFlags,
          ip: app.ip,
          user_agent: app.userAgent,
          ...(app.documentReviews ? { document_reviews: app.documentReviews } : {}),
        })
        .select("*")
        .single();
      fail("salvar a abertura de conta", error);
      return map(data as KycRow);
    },
    async latestForUser(userId) {
      const { data, error } = await table().select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      fail("ler a abertura de conta", error);
      return data ? map(data as KycRow) : null;
    },
    async get(id) {
      const { data, error } = await table().select("*").eq("id", id).maybeSingle();
      fail("ler a abertura de conta", error);
      return data ? map(data as KycRow) : null;
    },
    async list(status) {
      let q = table().select("*").order("created_at", { ascending: status === "pending" }).limit(200);
      if (status !== "all") q = q.eq("status", status);
      const { data, error } = await q;
      fail("listar aberturas de conta", error);
      return ((data ?? []) as KycRow[]).map(map);
    },
    async approvedForCpf(cpf) {
      const { data, error } = await table().select("*").eq("cpf", cpf).eq("status", "approved");
      fail("ler a abertura de conta", error);
      return ((data ?? []) as KycRow[]).map(map);
    },
    async decide(id, status, note, reviewer) {
      const { data, error } = await table()
        .update({ status, review_note: note, reviewed_by: reviewer, reviewed_at: new Date().toISOString() })
        .eq("id", id)
        .select("*")
        .maybeSingle();
      fail("decidir a abertura de conta", error);
      return data ? map(data as KycRow) : null;
    },
    async updateReview(id, patch, onlyStatus = "pending") {
      const row: Record<string, unknown> = {};
      if (patch.documents) row.documents = patch.documents;
      if (patch.documentReviews) row.document_reviews = patch.documentReviews;
      if (patch.resubmissionRequestedAt !== undefined) row.resubmission_requested_at = patch.resubmissionRequestedAt;
      if (patch.documentsPurgedAt !== undefined) row.documents_purged_at = patch.documentsPurgedAt;
      const { data, error } = await table().update(row).eq("id", id).eq("status", onlyStatus).select("*").maybeSingle();
      fail("salvar a análise da abertura", error);
      return data ? map(data as KycRow) : null;
    },
    async search({ status, q, offset, limit }) {
      let query = table()
        .select("*", { count: "exact" })
        .order("created_at", { ascending: status === "pending" || status === "resubmission" })
        .range(offset, offset + limit - 1);
      if (status === "resubmission") query = query.eq("status", "pending").not("resubmission_requested_at", "is", null);
      else if (status !== "all") query = query.eq("status", status);
      const term = cleanSearch(q);
      const digits = term.replace(/\D/g, "");
      if (term) query = query.or([`full_name.ilike.%${term}%`, `email.ilike.%${term}%`, ...(digits.length >= 3 ? [`cpf.like.%${digits}%`] : [])].join(","));
      const { data, error, count } = await query;
      fail("listar aberturas de conta", error);
      return { items: ((data ?? []) as KycRow[]).map(map), total: count ?? 0 };
    },
    async listForPurge(before, limit) {
      const { data, error } = await table().select("*").eq("status", "rejected").lt("created_at", before).is("documents_purged_at", null).limit(limit);
      fail("listar aberturas para retenção", error);
      return ((data ?? []) as KycRow[]).map(map);
    },
    async insertEvent(event) {
      const { error } = await supabaseAdmin!.from("bank_kyc_events").insert({
        application_id: event.applicationId,
        user_id: event.userId,
        actor: event.actor.slice(0, 200),
        actor_role: event.actorRole,
        action: event.action,
        document_kind: event.documentKind,
        detail: event.detail.slice(0, 1000),
      });
      fail("registrar o histórico da abertura", error);
    },
    async listEvents(applicationId, limit) {
      const { data, error } = await supabaseAdmin!.from("bank_kyc_events").select("*").eq("application_id", applicationId).order("created_at", { ascending: false }).limit(limit);
      fail("ler o histórico da abertura", error);
      return ((data ?? []) as EventRow[]).map(mapEvent);
    },
  };
}

/* Memória (desenvolvimento). A conta de demonstração já nasce com a abertura aprovada. */
const DEMO_KYC: BankKycApplication = {
  id: "kyc-demo-member",
  userId: "usr_demo_member",
  email: "membro@prx.dev",
  fullName: "Membro Demo",
  cpf: "52998224725",
  birthDate: "2004-05-10",
  motherName: "Maria Demo",
  phone: "11988887777",
  occupation: "Estudante",
  incomeRange: "ate_3k",
  pep: false,
  address: { cep: "01310100", street: "Avenida Paulista", number: "1000", complement: "", district: "Bela Vista", city: "São Paulo", state: "SP" },
  documents: [],
  minorPath: null,
  riskFlags: [],
  status: "approved",
  reviewNote: "",
  reviewedBy: "seed",
  reviewedAt: "2026-01-01T00:00:00.000Z",
  ip: null,
  userAgent: "",
  createdAt: "2026-01-01T00:00:00.000Z",
  documentReviews: {},
  resubmissionRequestedAt: null,
  documentsPurgedAt: null,
};

const globalState = globalThis as unknown as { __prxKyc?: BankKycApplication[]; __prxKycEvents?: KycEvent[] };
const memory = () => (globalState.__prxKyc ??= [structuredClone(DEMO_KYC)]);
const memoryEvents = () => (globalState.__prxKycEvents ??= []);

const memoryRepository: KycRepository = {
  async insert(app) {
    // Mesmas regras de unicidade do Supabase (bank_kyc_one_pending): um pedido em análise por pessoa.
    if (memory().some((a) => a.userId === app.userId && a.status === "pending")) throw new PartnerError("Registro duplicado.", 409);
    const created: BankKycApplication = {
      ...app,
      documentReviews: app.documentReviews ?? {},
      resubmissionRequestedAt: null,
      documentsPurgedAt: null,
      id: `kyc-${crypto.randomUUID()}`,
      status: "pending",
      reviewNote: "",
      reviewedBy: null,
      reviewedAt: null,
      createdAt: new Date().toISOString(),
    };
    memory().unshift(created);
    return structuredClone(created);
  },
  async latestForUser(userId) {
    const found = memory().find((a) => a.userId === userId);
    return found ? structuredClone(found) : null;
  },
  async get(id) {
    const found = memory().find((a) => a.id === id);
    return found ? structuredClone(found) : null;
  },
  async list(status) {
    return structuredClone(memory().filter((a) => status === "all" || a.status === status));
  },
  async approvedForCpf(cpf) {
    return structuredClone(memory().filter((a) => a.cpf === cpf && a.status === "approved"));
  },
  async decide(id, status, note, reviewer) {
    const found = memory().find((a) => a.id === id);
    if (!found) return null;
    // bank_kyc_cpf_approved: um CPF aprovado por vez.
    if (status === "approved" && memory().some((a) => a.id !== id && a.cpf === found.cpf && a.status === "approved")) throw new PartnerError("Registro duplicado.", 409);
    Object.assign(found, { status, reviewNote: note, reviewedBy: reviewer, reviewedAt: new Date().toISOString() });
    return structuredClone(found);
  },
  async updateReview(id, patch, onlyStatus = "pending") {
    const found = memory().find((a) => a.id === id && a.status === onlyStatus);
    if (!found) return null;
    const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    Object.assign(found, structuredClone(defined));
    return structuredClone(found);
  },
  async search({ status, q, offset, limit }) {
    const term = cleanSearch(q).toLowerCase();
    const digits = term.replace(/\D/g, "");
    const rows = memory()
      .filter((a) => (status === "all" ? true : status === "resubmission" ? a.status === "pending" && a.resubmissionRequestedAt !== null : a.status === status))
      .filter((a) => !term || a.fullName.toLowerCase().includes(term) || a.email.toLowerCase().includes(term) || (digits.length >= 3 && a.cpf.includes(digits)))
      .sort((a, b) => (status === "pending" || status === "resubmission" ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt)));
    return { items: structuredClone(rows.slice(offset, offset + limit)), total: rows.length };
  },
  async listForPurge(before, limit) {
    return structuredClone(memory().filter((a) => a.status === "rejected" && a.createdAt < before && !a.documentsPurgedAt).slice(0, limit));
  },
  async insertEvent(event) {
    memoryEvents().unshift({ ...structuredClone(event), id: crypto.randomUUID(), createdAt: new Date().toISOString() });
  },
  async listEvents(applicationId, limit) {
    return structuredClone(memoryEvents().filter((e) => e.applicationId === applicationId).slice(0, limit));
  },
};

export function getKycRepository(): KycRepository {
  return supabaseAdmin ? supabaseRepository() : memoryRepository;
}

export function resetKycMemory() {
  delete globalState.__prxKyc;
  delete globalState.__prxKycEvents;
}
