// Hello World
import { supabaseAdmin } from "@/lib/supabase/client";
import { PartnerError } from "@/lib/partners/errors";
import { birthDateSchema } from "@/lib/family/types";
import { launchSchemaReady } from "@/lib/db-features";

/**
 * Data de nascimento de quem compra, base da idade mínima de cada evento.
 * Fontes, na ordem: perfil (gravado no cadastro), a identidade da Conta
 * PRX/Conta Pai (KYC) e, por último, a confirmação na hora da compra. Só a
 * identidade aprovada no KYC conta como verificada. Uma vez gravada, a data
 * não muda pelo app (só pelo suporte).
 */

export type BirthSource = "signup" | "declared" | "kyc" | "admin";

export interface BuyerBirth {
  birthDate: string | null;
  verified: boolean;
  source: BirthSource | null;
}

const memory = (globalThis as unknown as { __prxBirth?: Map<string, BuyerBirth> }).__prxBirth ?? new Map<string, BuyerBirth>();
(globalThis as unknown as { __prxBirth?: Map<string, BuyerBirth> }).__prxBirth = memory;

const NONE: BuyerBirth = { birthDate: null, verified: false, source: null };

export async function buyerBirthDate(userId: string): Promise<BuyerBirth> {
  if (!supabaseAdmin) return memory.get(userId) ?? NONE;
  const { data: profile } = await supabaseAdmin.from("profiles").select("*").eq("id", userId).maybeSingle();
  const stored = profile?.birth_date ? String(profile.birth_date).slice(0, 10) : null;
  if (stored) {
    return { birthDate: stored, verified: Boolean(profile?.birth_date_verified), source: (profile?.birth_date_source as BirthSource | null) ?? "signup" };
  }
  const { data: identity } = await supabaseAdmin.from("family_identities").select("birth_date").eq("user_id", userId).maybeSingle();
  if (identity?.birth_date) return { birthDate: String(identity.birth_date).slice(0, 10), verified: true, source: "kyc" };
  return NONE;
}

/**
 * Grava a data só se a conta ainda não tem uma (nunca sobrescreve).
 * Melhor esforço no cadastro: falhar aqui não impede a conta de nascer.
 */
export async function rememberBirthDate(userId: string, birthDate: string, meta: { source: BirthSource; verified: boolean }): Promise<void> {
  if (!supabaseAdmin) {
    if (!memory.get(userId)?.birthDate) memory.set(userId, { birthDate, verified: meta.verified, source: meta.source });
    return;
  }
  const row: Record<string, unknown> = { birth_date: birthDate };
  if (await launchSchemaReady()) {
    row.birth_date_source = meta.source;
    row.birth_date_verified = meta.verified;
  }
  const { error } = await supabaseAdmin.from("profiles").update(row).eq("id", userId).is("birth_date", null);
  if (error) console.warn("[prx:birth] data de nascimento não gravada:", error.code);
}

/**
 * O membro confirma a data de nascimento para comprar um evento com idade
 * mínima e grava (autodeclarada: só o KYC aprovado marca como verificada).
 */
export async function confirmBuyerBirthDate(userId: string, raw: unknown): Promise<BuyerBirth> {
  const parsed = birthDateSchema.safeParse(raw);
  if (!parsed.success) throw new PartnerError(parsed.error.issues[0]?.message || "Data de nascimento inválida.", 422);
  const birthDate = parsed.data;
  const current = await buyerBirthDate(userId);
  if (current.birthDate) {
    if (current.birthDate !== birthDate) throw new PartnerError("A data de nascimento é diferente da já registrada na sua conta. Fale com o suporte PRX.", 409);
    return current;
  }
  await rememberBirthDate(userId, birthDate, { source: "declared", verified: false });
  const stored = await buyerBirthDate(userId);
  return stored.birthDate ? stored : { birthDate, verified: false, source: "declared" };
}
