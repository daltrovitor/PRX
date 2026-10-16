// Hello World
import { userStore } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/client";
import { calculatePrxLevel } from "@/lib/pass-data";
import { isRegisteredMember } from "@/lib/members";
import { pgQuote } from "@/lib/postgrest";
import { dbError } from "@/lib/partners/errors";
import { launchSchemaReady } from "@/lib/db-features";

/**
 * Diretório de membros do admin com busca, filtros, ordenação e paginação
 * executados no banco (view admin_member_directory). Antes da migração do
 * lançamento, consulta profiles direto (também paginado), sem a junção do banco.
 */

export const MEMBER_ROLES = ["user", "partner", "staff", "admin"] as const;
export type DirectoryRole = (typeof MEMBER_ROLES)[number];
export const MEMBER_SORTS = ["recent", "oldest", "name", "score"] as const;
export type MemberSort = (typeof MEMBER_SORTS)[number];

export interface DirectoryMember {
  id: string;
  email: string;
  name: string;
  role: DirectoryRole;
  prxScore: number;
  prxLevel: number;
  bankStatus: string;
  bankBalance: number;
  createdAt: string;
}

export interface MemberQuery {
  page: number;
  pageSize: number;
  q?: string;
  role?: DirectoryRole;
  bank?: string;
  sort: MemberSort;
}

export interface MemberPage {
  members: DirectoryMember[];
  total: number;
  page: number;
  pageSize: number;
  /** "directory" = view com banco; "profiles" = antes da migração; "memory" = desenvolvimento. */
  source: "directory" | "profiles" | "memory";
}

/** Termo de busca só com caracteres seguros (sem sintaxe de filtro do PostgREST). */
export function searchTerm(raw: string | undefined): string {
  return (raw ?? "").normalize("NFC").replace(/[^\p{L}\p{N}@._\- ]/gu, "").trim().slice(0, 60);
}

const ORDER: Record<MemberSort, { column: string; ascending: boolean }> = {
  recent: { column: "created_at", ascending: false },
  oldest: { column: "created_at", ascending: true },
  name: { column: "full_name", ascending: true },
  score: { column: "nxt_score", ascending: false },
};

const roleOf = (value: unknown): DirectoryRole => (MEMBER_ROLES.includes(value as DirectoryRole) ? (value as DirectoryRole) : "user");

export async function listMembers(query: MemberQuery): Promise<MemberPage> {
  const { page, pageSize } = query;
  const term = searchTerm(query.q);
  if (!supabaseAdmin) return memoryMembers(query, term);

  const directory = await launchSchemaReady();
  const order = ORDER[query.sort];
  let request = directory
    ? supabaseAdmin.from("admin_member_directory").select("id, email, full_name, role, nxt_score, created_at, bank_status, bank_balance", { count: "exact" }).eq("is_member", true)
    : supabaseAdmin.from("profiles").select("id, email, full_name, role, nxt_score, created_at", { count: "exact" }).or("role.neq.user,cpf.not.is.null");
  if (term) request = request.or(`full_name.ilike.${pgQuote(`*${term}*`)},email.ilike.${pgQuote(`*${term}*`)}`);
  if (query.role) request = request.eq("role", query.role);
  if (directory && query.bank) request = request.eq("bank_status", query.bank);
  const { data, error, count } = await request
    .order(order.column, { ascending: order.ascending, nullsFirst: false })
    .order("id", { ascending: true })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throw dbError(error, "Não foi possível listar os membros");

  const members = (data as Array<Record<string, unknown>>).map((r) => {
    const score = Number(r.nxt_score ?? 250);
    return {
      id: String(r.id),
      email: String(r.email ?? ""),
      name: String(r.full_name || String(r.email ?? "").split("@")[0]),
      role: roleOf(r.role),
      prxScore: score,
      prxLevel: calculatePrxLevel(score),
      bankStatus: String(r.bank_status ?? "none"),
      bankBalance: Number(r.bank_balance ?? 0),
      createdAt: String(r.created_at ?? ""),
    } satisfies DirectoryMember;
  });
  return { members, total: count ?? members.length, page, pageSize, source: directory ? "directory" : "profiles" };
}

function memoryMembers(query: MemberQuery, term: string): MemberPage {
  const t = term.toLowerCase();
  const all = userStore
    .getAllUsers()
    .filter((u) => isRegisteredMember({ role: u.role, cpf: u.cpf }))
    .filter((u) => !t || u.fullName.toLowerCase().includes(t) || u.email.toLowerCase().includes(t))
    .filter((u) => !query.role || u.role === query.role)
    .map(
      (u): DirectoryMember => ({
        id: u.id,
        email: u.email,
        name: u.fullName,
        role: u.role,
        prxScore: u.prxScore,
        prxLevel: u.prxLevel,
        bankStatus: "none",
        bankBalance: 0,
        createdAt: u.createdAt,
      })
    );
  const sorted = all.sort((a, b) => {
    if (query.sort === "name") return a.name.localeCompare(b.name, "pt-BR");
    if (query.sort === "score") return b.prxScore - a.prxScore;
    return query.sort === "oldest" ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt);
  });
  const { page, pageSize } = query;
  return { members: sorted.slice((page - 1) * pageSize, page * pageSize), total: sorted.length, page, pageSize, source: "memory" };
}

export interface MemberContact {
  name: string;
  email: string;
}

/** Nome e e-mail de uma lista de contas (fichas do admin). Ids desconhecidos ficam de fora. */
export async function memberContacts(ids: ReadonlyArray<string>): Promise<Map<string, MemberContact>> {
  const unique = [...new Set(ids)].filter(Boolean).slice(0, 500);
  const out = new Map<string, MemberContact>();
  if (unique.length === 0) return out;
  if (!supabaseAdmin) {
    for (const id of unique) {
      const u = userStore.findById(id);
      if (u) out.set(id, { name: u.fullName, email: u.email });
    }
    return out;
  }
  const { data, error } = await supabaseAdmin.from("profiles").select("id, full_name, email").in("id", unique);
  if (error) throw dbError(error, "Não foi possível ler os membros");
  for (const r of (data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>) {
    out.set(r.id, { name: r.full_name || (r.email ?? "").split("@")[0], email: r.email ?? "" });
  }
  return out;
}
