// Hello World
import { ageOn } from "@/lib/family/age";
import { getKycRepository } from "@/lib/kyc/repository";
import { identityChecklist, identityHistory, identitySchemaReady } from "@/lib/kyc/identity";
import { guardianReady } from "@/lib/kyc/service";
import { activeGrant } from "@/lib/bank/access";
import type { BankKycApplication, IdentityDocumentItem, KycEvent, KycStatus } from "@/lib/kyc/types";

/**
 * Fila e ficha da análise de identidade para o admin. Dados pessoais só aqui
 * (rota de admin, sem cache); os arquivos abrem por link assinado de 60 s,
 * pedido um a um e registrado no histórico.
 */

export const IDENTITY_FILTERS = ["pending", "resubmission", "approved", "rejected", "all"] as const;
export type IdentityFilter = (typeof IDENTITY_FILTERS)[number];

export interface IdentityRow {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  cpfMasked: string;
  age: number;
  status: KycStatus;
  resubmissionRequested: boolean;
  riskFlags: string[];
  documents: IdentityDocumentItem[];
  reviewedBy: string | null;
  createdAt: string;
}

export interface IdentityDetail {
  application: Omit<BankKycApplication, "documents"> & { documents: Array<{ kind: string; name: string }> };
  age: number;
  documents: IdentityDocumentItem[];
  events: KycEvent[];
  guardianReady: boolean;
  /** Acima de 29 anos: a liberação vigente (null = sem liberação). */
  overAgeGrant: { grantedBy: string; grantedAt: string; note: string } | null;
  overAge: boolean;
  schemaReady: boolean;
}

const maskCpf = (cpf: string) => (cpf.length === 11 ? `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**` : "***");

function row(app: BankKycApplication): IdentityRow {
  return {
    id: app.id,
    userId: app.userId,
    fullName: app.fullName,
    email: app.email,
    cpfMasked: maskCpf(app.cpf),
    age: ageOn(app.birthDate),
    status: app.status,
    resubmissionRequested: app.status === "pending" && app.resubmissionRequestedAt !== null,
    riskFlags: app.riskFlags,
    documents: identityChecklist(app),
    reviewedBy: app.reviewedBy,
    createdAt: app.createdAt,
  };
}

export async function identityQueue(filter: IdentityFilter, q: string, page: number, pageSize: number): Promise<{ items: IdentityRow[]; total: number; pendingCount: number }> {
  const repo = getKycRepository();
  const [result, pending] = await Promise.all([
    repo.search({ status: filter, q, offset: (page - 1) * pageSize, limit: pageSize }),
    repo.search({ status: "pending", q: "", offset: 0, limit: 1 }),
  ]);
  return { items: result.items.map(row), total: result.total, pendingCount: pending.total };
}

export async function identityDetail(id: string): Promise<IdentityDetail | null> {
  const app = await getKycRepository().get(id);
  if (!app) return null;
  const age = ageOn(app.birthDate);
  const [events, guardian, grant, schemaReady] = await Promise.all([
    identityHistory(app.id),
    app.riskFlags.includes("minor") && app.minorPath !== "emancipated" ? guardianReady(app.userId, app.birthDate) : Promise.resolve(true),
    age > 29 ? activeGrant(app.userId).catch(() => null) : Promise.resolve(null),
    identitySchemaReady().catch(() => false),
  ]);
  return {
    // Caminhos dos arquivos nunca saem: o admin abre cada um pela rota do documento.
    application: { ...app, documents: app.documents.map((d) => ({ kind: d.kind, name: d.name ?? "" })) },
    age,
    documents: identityChecklist(app),
    events,
    guardianReady: guardian,
    overAgeGrant: grant ? { grantedBy: grant.grantedBy, grantedAt: grant.grantedAt, note: grant.note } : null,
    overAge: age > 29,
    schemaReady,
  };
}
