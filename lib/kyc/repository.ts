// Hello World
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/client";
import { PartnerError, dbError } from "@/lib/partners/errors";
import type { DocumentRef, IncomeRange, TeenPath } from "@/lib/family/types";
import type { BankKycApplication, KycAddress, KycStatus, RiskFlag } from "@/lib/kyc/types";

/**
 * Pedidos de abertura do PRX BANK: tabela bank_kyc_applications no Supabase
 * (só service role; o cliente não lê nem grava); memória no desenvolvimento.
 */
export interface KycRepository {
  insert(app: Omit<BankKycApplication, "id" | "status" | "reviewNote" | "reviewedBy" | "reviewedAt" | "createdAt">): Promise<BankKycApplication>;
  latestForUser(userId: string): Promise<BankKycApplication | null>;
  get(id: string): Promise<BankKycApplication | null>;
  list(status: KycStatus | "all"): Promise<BankKycApplication[]>;
  /** Pedidos aprovados com este CPF (no máximo um, pelo índice único). */
  approvedForCpf(cpf: string): Promise<BankKycApplication[]>;
  /** Decide só pedidos pendentes (null se outra pessoa decidiu antes). */
  decide(id: string, status: KycStatus, note: string, reviewer: string): Promise<BankKycApplication | null>;
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
}

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
});

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
};

const globalState = globalThis as unknown as { __prxKyc?: BankKycApplication[] };
const memory = () => (globalState.__prxKyc ??= [structuredClone(DEMO_KYC)]);

const memoryRepository: KycRepository = {
  async insert(app) {
    // Mesmas regras de unicidade do Supabase (bank_kyc_one_pending): um pedido em análise por pessoa.
    if (memory().some((a) => a.userId === app.userId && a.status === "pending")) throw new PartnerError("Registro duplicado.", 409);
    const created: BankKycApplication = { ...app, id: `kyc-${crypto.randomUUID()}`, status: "pending", reviewNote: "", reviewedBy: null, reviewedAt: null, createdAt: new Date().toISOString() };
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
};

export function getKycRepository(): KycRepository {
  return supabaseAdmin ? supabaseRepository() : memoryRepository;
}

export function resetKycMemory() {
  delete globalState.__prxKyc;
}
