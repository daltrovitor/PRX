// Hello World
import crypto from "crypto";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/client";
import { PartnerError, dbError, isMissingTable } from "@/lib/partners/errors";
import { requireTable } from "@/lib/db-features";
import { memberContacts } from "@/lib/admin/members";
import { founderIsCurrent, type FounderMember } from "@/lib/founders/member-types";

export { founderIsCurrent, type FounderMember };

/**
 * Founders da PRX: membros com o status de Founder, ligados à conta real de
 * cada um, com nome e informações de exibição, benefícios, elegibilidade e
 * vigência. Só o admin cria e altera. O app mostra os ativos que aceitam
 * aparecer, e cada pessoa vê o próprio status e benefícios.
 * Tabela founders_members (migração 20261016_prx_founders_members.sql).
 */

export const FOUNDERS_MIGRATION = "20261016_prx_founders_members.sql";


const iso = z.union([z.null(), z.string().trim().refine((v) => !Number.isNaN(Date.parse(v)), "Data inválida.")]).default(null);

export const founderInputSchema = z
  .object({
    userId: z.string().trim().min(1, "Escolha a conta do Founder.").max(80),
    displayName: z.string().trim().min(2, "Informe o nome de exibição.").max(80),
    headline: z.string().trim().max(140).default(""),
    bio: z.string().trim().max(1000).default(""),
    benefits: z
      .array(z.string().trim().max(160))
      .max(20)
      .default([])
      .transform((l) => l.filter(Boolean)),
    eligibility: z.string().trim().max(500).default(""),
    status: z.enum(["active", "inactive"]).default("active"),
    showPublicly: z.boolean().default(true),
    startsAt: iso,
    endsAt: iso,
  })
  .refine((f) => !f.startsAt || !f.endsAt || Date.parse(f.endsAt) > Date.parse(f.startsAt), { path: ["endsAt"], message: "O fim precisa ser depois do início." });
export type FounderInput = z.output<typeof founderInputSchema>;

type Row = Record<string, unknown>;
const map = (r: Row): FounderMember => ({
  id: String(r.id),
  userId: String(r.user_id),
  displayName: String(r.display_name),
  headline: String(r.headline ?? ""),
  bio: String(r.bio ?? ""),
  benefits: (r.benefits as string[]) ?? [],
  eligibility: String(r.eligibility ?? ""),
  status: r.status === "inactive" ? "inactive" : "active",
  showPublicly: r.show_publicly !== false,
  startsAt: (r.starts_at as string | null) ?? null,
  endsAt: (r.ends_at as string | null) ?? null,
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
});
const toRow = (f: FounderInput): Row => ({
  user_id: f.userId,
  display_name: f.displayName,
  headline: f.headline,
  bio: f.bio,
  benefits: f.benefits,
  eligibility: f.eligibility,
  status: f.status,
  show_publicly: f.showPublicly,
  starts_at: f.startsAt,
  ends_at: f.endsAt,
});

const memory = () => ((globalThis as unknown as { __prxFounderMembers?: FounderMember[] }).__prxFounderMembers ??= []);


export async function listFounders(query: { q: string; offset: number; limit: number }): Promise<{ items: Array<FounderMember & { email: string; accountName: string }>; total: number }> {
  let items: FounderMember[];
  let total: number;
  if (!supabaseAdmin) {
    const term = query.q.trim().toLowerCase();
    const rows = memory().filter((f) => !term || f.displayName.toLowerCase().includes(term));
    items = structuredClone(rows.slice(query.offset, query.offset + query.limit));
    total = rows.length;
  } else {
    await requireTable("founders_members", FOUNDERS_MIGRATION);
    let req = supabaseAdmin.from("founders_members").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(query.offset, query.offset + query.limit - 1);
    const term = query.q.replace(/[^\p{L}\p{N} ]/gu, "").trim().slice(0, 60);
    if (term) req = req.ilike("display_name", `%${term}%`);
    const { data, error, count } = await req;
    if (error) throw dbError(error, "Não foi possível listar os Founders");
    items = ((data ?? []) as Row[]).map(map);
    total = count ?? 0;
  }
  const contacts = await memberContacts(items.map((f) => f.userId));
  return { items: items.map((f) => ({ ...f, email: contacts.get(f.userId)?.email ?? "", accountName: contacts.get(f.userId)?.name ?? "Conta excluída" })), total };
}

export async function founderOf(userId: string): Promise<FounderMember | null> {
  if (!supabaseAdmin) return structuredClone(memory().find((f) => f.userId === userId) ?? null);
  const { data, error } = await supabaseAdmin.from("founders_members").select("*").eq("user_id", userId).maybeSingle();
  if (isMissingTable(error)) return null;
  if (error) throw dbError(error, "Não foi possível ler o Founder");
  return data ? map(data as Row) : null;
}

export async function isActiveFounder(userId: string, now = new Date()): Promise<boolean> {
  const f = await founderOf(userId).catch(() => null);
  return Boolean(f && founderIsCurrent(f, now));
}

/** Cria ou edita. A conta precisa existir; uma pessoa só tem um cadastro de Founder. */
export async function saveFounder(raw: unknown, actor: string, id?: string): Promise<FounderMember> {
  const parsed = founderInputSchema.safeParse(raw);
  if (!parsed.success) throw new PartnerError(parsed.error.issues[0]?.message ?? "Confira os dados do Founder.", 422);
  const input = parsed.data;
  if (!(await memberContacts([input.userId])).has(input.userId)) throw new PartnerError("Conta não encontrada. Busque a pessoa pelo nome ou e-mail.", 404);
  if (!supabaseAdmin) {
    const list = memory();
    const clash = list.find((f) => f.userId === input.userId && f.id !== id);
    if (clash) throw new PartnerError("Esta pessoa já é Founder. Edite o cadastro existente.", 409);
    const now = new Date().toISOString();
    if (id) {
      const found = list.find((f) => f.id === id);
      if (!found) throw new PartnerError("Founder não encontrado.", 404);
      Object.assign(found, structuredClone(input), { updatedAt: now });
      return structuredClone(found);
    }
    const created: FounderMember = { ...structuredClone(input), id: crypto.randomUUID(), createdAt: now, updatedAt: now };
    list.push(created);
    return structuredClone(created);
  }
  await requireTable("founders_members", FOUNDERS_MIGRATION);
  const res = id
    ? await supabaseAdmin.from("founders_members").update({ ...toRow(input), updated_at: new Date().toISOString() }).eq("id", id).select("*").maybeSingle()
    : await supabaseAdmin.from("founders_members").insert({ ...toRow(input), created_by: actor }).select("*").single();
  if (res.error?.code === "23505") throw new PartnerError("Esta pessoa já é Founder. Edite o cadastro existente.", 409);
  if (res.error) throw dbError(res.error, "Não foi possível salvar o Founder");
  if (!res.data) throw new PartnerError("Founder não encontrado.", 404);
  return map(res.data as Row);
}

export async function deleteFounder(id: string): Promise<void> {
  if (!supabaseAdmin) {
    const list = memory();
    const i = list.findIndex((f) => f.id === id);
    if (i >= 0) list.splice(i, 1);
    return;
  }
  await requireTable("founders_members", FOUNDERS_MIGRATION);
  const { error } = await supabaseAdmin.from("founders_members").delete().eq("id", id);
  if (error) throw dbError(error, "Não foi possível excluir o Founder");
}

export interface PublicFounder {
  displayName: string;
  headline: string;
}

/** Founders que o app mostra: ativos, na vigência e que aceitam aparecer (só nome e chamada). */
export async function publicFounders(now = new Date()): Promise<PublicFounder[]> {
  let rows: FounderMember[];
  if (!supabaseAdmin) rows = memory();
  else {
    const { data, error } = await supabaseAdmin.from("founders_members").select("*").eq("status", "active").eq("show_publicly", true).order("created_at").limit(200);
    if (isMissingTable(error)) return [];
    if (error) throw dbError(error, "Não foi possível ler os Founders");
    rows = ((data ?? []) as Row[]).map(map);
  }
  return rows.filter((f) => f.showPublicly && founderIsCurrent(f, now)).map((f) => ({ displayName: f.displayName, headline: f.headline }));
}

/** Só para testes. */
export function resetFounderMembersMemory(): void {
  (globalThis as unknown as { __prxFounderMembers?: FounderMember[] }).__prxFounderMembers = [];
}
