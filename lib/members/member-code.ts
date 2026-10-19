// Hello World
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/client";
import { userStore } from "@/lib/auth";
import { buyerBirthDate } from "@/lib/live/buyer";
import { isMissingColumn } from "@/lib/partners/errors";

/**
 * ID PRX: código curto, único e público de cada cliente (PRX-7K3M9Q). É o que a
 * pessoa passa para um Insider convidá-la, sem expor e-mail, CPF ou o id interno.
 * No banco, profiles.member_code (migração 20261019) já nasce preenchido; quem
 * ainda não tem recebe um na primeira leitura.
 */

export const MEMBER_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const MEMBER_CODE_RE = /^PRX-[2-9A-HJ-NP-Z]{6}$/;

export function generateMemberCode(random: (max: number) => number = crypto.randomInt): string {
  return `PRX-${Array.from({ length: 6 }, () => MEMBER_CODE_ALPHABET[random(MEMBER_CODE_ALPHABET.length)]).join("")}`;
}

/** "prx 7k3m9q", "7K3M9Q" e "PRX-7K3M9Q" viram "PRX-7K3M9Q"; o resto vira null. */
export function normalizeMemberCode(raw: string): string | null {
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = compact.startsWith("PRX") && compact.length === 9 ? compact.slice(3) : compact;
  const code = `PRX-${body}`;
  return MEMBER_CODE_RE.test(code) ? code : null;
}

export interface MemberMatch {
  userId: string;
  name: string;
  memberCode: string;
  avatarUrl: string;
  birthDate: string | null;
}

/* Memória (desenvolvimento e testes) ----------------------------------------- */

const memoryCodes = (): Map<string, string> => ((globalThis as unknown as { __prxMemberCodes?: Map<string, string> }).__prxMemberCodes ??= new Map());

function memoryCodeOf(userId: string): string {
  const codes = memoryCodes();
  let code = codes.get(userId);
  while (!code || [...codes.entries()].some(([id, c]) => c === code && id !== userId)) code = generateMemberCode();
  codes.set(userId, code);
  return code;
}

async function memoryMatch(userId: string): Promise<MemberMatch | null> {
  const user = userStore.findById(userId);
  if (!user) return null;
  return { userId, name: user.fullName, memberCode: memoryCodeOf(userId), avatarUrl: user.avatarUrl || "", birthDate: (await buyerBirthDate(userId)).birthDate };
}

/* Supabase ------------------------------------------------------------------- */

type ProfileHit = { id: string; full_name: string | null; email: string | null; member_code: string | null; avatar_url: string | null; birth_date: string | null };
const SELECT = "id, full_name, email, member_code, avatar_url, birth_date";

async function assignCode(userId: string): Promise<string | null> {
  const db = supabaseAdmin!;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { error } = await db.from("profiles").update({ member_code: generateMemberCode() }).eq("id", userId).is("member_code", null);
    if (isMissingColumn(error)) return null;
    if (error && error.code !== "23505") return null;
    const { data } = await db.from("profiles").select("member_code").eq("id", userId).maybeSingle();
    if (data?.member_code) return String(data.member_code);
  }
  return null;
}

function toMatch(row: ProfileHit, code: string): MemberMatch {
  return { userId: row.id, name: row.full_name || row.email?.split("@")[0] || "Membro PRX", memberCode: code, avatarUrl: row.avatar_url || "", birthDate: row.birth_date ? String(row.birth_date).slice(0, 10) : null };
}

/** ID PRX da conta (cria se faltar). null = migração ainda não aplicada. */
export async function memberCodeOf(userId: string): Promise<string | null> {
  if (!supabaseAdmin) return memoryCodeOf(userId);
  const { data, error } = await supabaseAdmin.from("profiles").select("member_code").eq("id", userId).maybeSingle();
  if (error) return null;
  return data?.member_code ? String(data.member_code) : assignCode(userId);
}

export async function findMemberByCode(raw: string): Promise<MemberMatch | null> {
  const code = normalizeMemberCode(raw);
  if (!code) return null;
  if (!supabaseAdmin) {
    const userId = [...memoryCodes().entries()].find(([, c]) => c === code)?.[0];
    return userId ? memoryMatch(userId) : null;
  }
  const { data, error } = await supabaseAdmin.from("profiles").select(SELECT).eq("member_code", code).maybeSingle();
  if (error || !data) return null;
  return toMatch(data as ProfileHit, code);
}

export async function findMemberById(userId: string): Promise<MemberMatch | null> {
  if (!supabaseAdmin) return memoryMatch(userId);
  const { data, error } = await supabaseAdmin.from("profiles").select(SELECT).eq("id", userId).maybeSingle();
  if (error || !data) return null;
  const row = data as ProfileHit;
  const code = row.member_code || (await assignCode(row.id));
  return code ? toMatch(row, code) : null;
}

/** Busca por ID PRX (exato) ou por nome (3+ letras, contém). */
export async function searchMembers(query: string, limit = 8): Promise<MemberMatch[]> {
  const q = query.trim();
  const byCode = normalizeMemberCode(q);
  if (byCode) {
    const hit = await findMemberByCode(byCode);
    if (hit) return [hit];
  }
  if (q.replace(/\s/g, "").length < 3) return [];

  if (!supabaseAdmin) {
    const needle = fold(q);
    const users = userStore.getAllUsers().filter((u) => fold(u.fullName).includes(needle)).slice(0, limit);
    return (await Promise.all(users.map((u) => memoryMatch(u.id)))).filter((m): m is MemberMatch => m !== null);
  }
  // % e _ são curingas do ILIKE: entram como texto literal.
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const { data, error } = await supabaseAdmin.from("profiles").select(SELECT).ilike("full_name", pattern).order("full_name").limit(limit);
  if (error) return [];
  const rows = (data ?? []) as ProfileHit[];
  const matches = await Promise.all(rows.map(async (row) => {
    const code = row.member_code || (await assignCode(row.id));
    return code ? toMatch(row, code) : null;
  }));
  return matches.filter((m): m is MemberMatch => m !== null);
}

const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
