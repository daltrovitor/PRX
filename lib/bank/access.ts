// Hello World
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/client";
import { PartnerError, dbError, isMissingTable } from "@/lib/partners/errors";
import { ageGroup, ageOn } from "@/lib/family/age";
import { MAX_MEMBER_AGE } from "@/lib/family/types";
import { getFamilyRepository } from "@/lib/family/repository";
import { buyerBirthDate, rememberBirthDate } from "@/lib/live/buyer";

/**
 * Liberação do PRX BANK para maiores de 29 anos. O ecossistema PRX é para
 * jovens até 29 (MAX_MEMBER_AGE); a equipe pode liberar a abertura da conta
 * para pessoas específicas acima disso. A liberação é só uma condição a mais
 * de elegibilidade: a identidade, a análise da PRX e o banco parceiro
 * continuam valendo, e nada é aprovado por causa dela. O servidor confere a
 * liberação no envio da abertura, na aprovação da identidade e na criação da
 * conta no banco parceiro: chamar as APIs direto não contorna a regra.
 * Tabela bank_access_grants (migração 20261015_prx_bank_identity.sql).
 */

export const BANK_GRANT_MIGRATION_HINT = "Falta aplicar a migração supabase/migrations/20261015_prx_bank_identity.sql no Supabase para liberar o PRX BANK a maiores de 29 anos.";
export const OVER_AGE_BANK_MESSAGE = `A conta PRX BANK é para jovens até ${MAX_MEMBER_AGE} anos. Se você foi convidado pela equipe da PRX, fale com o suporte para liberar a sua abertura.`;

export interface BankAccessGrant {
  id: string;
  userId: string;
  birthDate: string;
  ageAtGrant: number;
  note: string;
  grantedBy: string;
  grantedAt: string;
  revokedBy: string | null;
  revokedAt: string | null;
  revokeNote: string;
}

/** Pessoa na busca do admin, com a idade validada e a liberação vigente. */
export interface AccessCandidate {
  userId: string;
  name: string;
  email: string;
  age: number | null;
  birthSource: "identity" | "profile" | null;
  eligible: boolean;
  grant: { grantedBy: string; grantedAt: string; note: string } | null;
}

export interface VerifiedBirth {
  birthDate: string;
  /** identity: abertura/identidade da conta · profile: cadastro (conferido na Receita quando o Serpro está ligado). */
  source: "identity" | "profile";
  verified: boolean;
}

interface GrantRow {
  id: string;
  user_id: string;
  birth_date: string;
  age_at_grant: number;
  note: string | null;
  granted_by: string;
  granted_at: string;
  revoked_by: string | null;
  revoked_at: string | null;
  revoke_note: string | null;
}

const map = (r: GrantRow): BankAccessGrant => ({
  id: r.id,
  userId: r.user_id,
  birthDate: String(r.birth_date).slice(0, 10),
  ageAtGrant: r.age_at_grant,
  note: r.note ?? "",
  grantedBy: r.granted_by,
  grantedAt: r.granted_at,
  revokedBy: r.revoked_by,
  revokedAt: r.revoked_at,
  revokeNote: r.revoke_note ?? "",
});

const memory = () => ((globalThis as unknown as { __prxBankGrants?: BankAccessGrant[] }).__prxBankGrants ??= []);

/** Todas as liberações da pessoa (vigente primeiro, depois o histórico). */
export async function grantHistory(userId: string): Promise<BankAccessGrant[]> {
  if (!supabaseAdmin) return structuredClone(memory().filter((g) => g.userId === userId)).sort((a, b) => b.grantedAt.localeCompare(a.grantedAt));
  const { data, error } = await supabaseAdmin.from("bank_access_grants").select("*").eq("user_id", userId).order("granted_at", { ascending: false }).limit(50);
  if (isMissingTable(error)) return [];
  if (error) throw dbError(error, "Não foi possível ler a liberação do PRX BANK");
  return ((data ?? []) as GrantRow[]).map(map);
}

export async function activeGrant(userId: string): Promise<BankAccessGrant | null> {
  return (await grantHistory(userId)).find((g) => !g.revokedAt) ?? null;
}

/** Liberações vigentes (painel admin), mais recentes primeiro. */
export async function listActiveGrants(offset: number, limit: number): Promise<{ items: BankAccessGrant[]; total: number }> {
  if (!supabaseAdmin) {
    const active = memory()
      .filter((g) => !g.revokedAt)
      .sort((a, b) => b.grantedAt.localeCompare(a.grantedAt));
    return { items: structuredClone(active.slice(offset, offset + limit)), total: active.length };
  }
  const { data, error, count } = await supabaseAdmin
    .from("bank_access_grants")
    .select("*", { count: "exact" })
    .is("revoked_at", null)
    .order("granted_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (isMissingTable(error)) return { items: [], total: 0 };
  if (error) throw dbError(error, "Não foi possível listar as liberações do PRX BANK");
  return { items: ((data ?? []) as GrantRow[]).map(map), total: count ?? 0 };
}

/** Nascimento validado da conta: identidade da abertura primeiro, depois o do cadastro. */
export async function verifiedBirthDate(userId: string): Promise<VerifiedBirth | null> {
  const identity = await getFamilyRepository()
    .getIdentity(userId)
    .catch(() => null);
  if (identity?.birthDate) return { birthDate: identity.birthDate, source: "identity", verified: true };
  const birth = await buyerBirthDate(userId).catch(() => null);
  if (birth?.birthDate) return { birthDate: birth.birthDate, source: "profile", verified: birth.verified };
  return null;
}

/** Acima de 29 anos, só com a liberação vigente. Até 29, a regra de sempre (sem liberação). */
export async function bankAgeAllowed(userId: string, birthDate: string, now = new Date()): Promise<boolean> {
  if (ageGroup(birthDate, now) !== "over") return true;
  return Boolean(await activeGrant(userId));
}

/** AAAA-MM-DD de verdade, no passado e depois de 1900. */
export function isPlausibleBirthDate(value: string, now = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value) && date < now && date.getUTCFullYear() > 1900;
}

/**
 * Libera a abertura. A idade vem da data validada na conta; sem ela, o admin
 * informa a data do documento da pessoa (fica gravada no cadastro como
 * informada pelo admin, sem sobrescrever uma data que já exista). A análise da
 * identidade continua conferindo o documento depois.
 */
export async function grantBankAccess(userId: string, note: string, actor: string, now = new Date(), declaredBirthDate?: string): Promise<BankAccessGrant> {
  const verified = await verifiedBirthDate(userId);
  const declared = !verified && declaredBirthDate ? declaredBirthDate.trim() : "";
  if (!verified && !declared) throw new PartnerError("Esta pessoa não tem data de nascimento validada na conta. Informe a data do documento dela para liberar.", 409);
  if (declared && !isPlausibleBirthDate(declared, now)) throw new PartnerError("Data de nascimento inválida. Use a data do documento (dia, mês e ano).", 422);
  const birthDate = verified?.birthDate ?? declared;
  const age = ageOn(birthDate, now);
  if (age <= MAX_MEMBER_AGE) throw new PartnerError(`Esta pessoa tem ${age} anos: até ${MAX_MEMBER_AGE} anos a abertura já é permitida, sem liberação.`, 409);
  if (await activeGrant(userId)) throw new PartnerError("A abertura do PRX BANK já está liberada para esta pessoa.", 409);

  const cleanNote = note.trim();
  const record = { userId, birthDate, ageAtGrant: age, note: (declared ? `Nascimento informado pelo admin.${cleanNote ? ` ${cleanNote}` : ""}` : cleanNote).slice(0, 500), grantedBy: actor };
  // Sem data na conta: a do documento passa a valer no cadastro (abertura e prefill usam a mesma).
  if (declared) await rememberBirthDate(userId, declared, { source: "admin", verified: false });
  if (!supabaseAdmin) {
    const created: BankAccessGrant = { ...record, id: crypto.randomUUID(), grantedAt: now.toISOString(), revokedBy: null, revokedAt: null, revokeNote: "" };
    memory().push(created);
    return structuredClone(created);
  }
  const { data, error } = await supabaseAdmin
    .from("bank_access_grants")
    .insert({ user_id: userId, birth_date: record.birthDate, age_at_grant: age, note: record.note, granted_by: actor })
    .select("*")
    .single();
  if (isMissingTable(error)) throw new PartnerError(BANK_GRANT_MIGRATION_HINT, 503);
  if (error?.code === "23505") throw new PartnerError("A abertura do PRX BANK já está liberada para esta pessoa.", 409);
  if (error) throw dbError(error, "Não foi possível liberar o PRX BANK");
  return map(data as GrantRow);
}

/** Revoga a liberação vigente. Não encerra conta já aberta no banco parceiro (isso é outro processo). */
export async function revokeBankAccess(userId: string, note: string, actor: string, now = new Date()): Promise<BankAccessGrant> {
  const current = await activeGrant(userId);
  if (!current) throw new PartnerError("Não há liberação vigente para esta pessoa.", 404);
  const patch = { revokedBy: actor, revokedAt: now.toISOString(), revokeNote: note.trim().slice(0, 500) };
  if (!supabaseAdmin) {
    const found = memory().find((g) => g.id === current.id);
    if (found) Object.assign(found, patch);
    return { ...current, ...patch };
  }
  const { data, error } = await supabaseAdmin
    .from("bank_access_grants")
    .update({ revoked_by: patch.revokedBy, revoked_at: patch.revokedAt, revoke_note: patch.revokeNote })
    .eq("id", current.id)
    .is("revoked_at", null)
    .select("*")
    .maybeSingle();
  if (error) throw dbError(error, "Não foi possível revogar a liberação");
  if (!data) throw new PartnerError("A liberação já tinha sido revogada.", 409);
  return map(data as GrantRow);
}

/** Só para testes. */
export function resetBankGrantsMemory(): void {
  (globalThis as unknown as { __prxBankGrants?: BankAccessGrant[] }).__prxBankGrants = [];
}
