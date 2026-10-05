// Hello World
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { userStore } from "@/lib/auth";
import { isReservedAdminEmail } from "@/lib/admin-allowlist";
import { isPublicSupabaseKey, supabaseAdmin } from "@/lib/supabase/client";
import type { ProfileRow } from "@/lib/db-rows";
import { PartnerError } from "@/lib/partners/errors";

/**
 * Contas de acesso ao Portal do Parceiro. O papel "partner" só é gravado pelo
 * servidor (app_metadata + profiles.role), nunca pelo próprio usuário.
 */

export interface PartnerAccount {
  userId: string;
  email: string;
  /** Presente só quando a conta foi criada agora: exibida uma única vez ao admin. */
  temporaryPassword?: string;
}

const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** 16 caracteres sem ambiguidade (sem 0/O, 1/l/I), com dígito garantido. */
export function generateTemporaryPassword(length = 16): string {
  const chars = Array.from({ length }, () => PASSWORD_ALPHABET[crypto.randomInt(PASSWORD_ALPHABET.length)]);
  chars[crypto.randomInt(length)] = String(crypto.randomInt(2, 10));
  return chars.join("");
}

/** Papéis que o admin concede a logins de painel: parceiro ou Equipe PRX. */
export type PanelRole = "partner" | "staff";
const ROLE_NAME: Record<PanelRole, string> = { partner: "parceiro", staff: "Equipe PRX" };

function assertEmailAllowed(email: string, role: PanelRole) {
  if (isReservedAdminEmail(email)) {
    throw new PartnerError(`Este e-mail pertence a um administrador e não pode ser usado como acesso de ${ROLE_NAME[role]}.`, 422);
  }
}

/** Um login é de parceiro ou da Equipe PRX, nunca dos dois: trocar derrubaria o outro acesso. */
function assertNoOtherPanelRole(current: string | null | undefined, role: PanelRole) {
  const other: PanelRole = role === "partner" ? "staff" : "partner";
  if (current === other) {
    throw new PartnerError(`Esta conta já é acesso de ${ROLE_NAME[other]}. Use outro e-mail ou revogue o acesso atual antes.`, 409);
  }
}

async function promoteInSupabase(userId: string, role: PanelRole) {
  if (!supabaseAdmin) return;
  const { error: metaError } = await supabaseAdmin.auth.admin.updateUserById(userId, { app_metadata: { role } });
  if (metaError) throw new PartnerError(`Não foi possível conceder o acesso de ${ROLE_NAME[role]}.`, 500);
  await supabaseAdmin.from("profiles").update({ role }).eq("id", userId);
}

/** Vincula uma conta PRX existente, promovendo-a ao papel do painel (parceiro por padrão). */
export async function linkExistingAccount(rawEmail: string, role: PanelRole = "partner"): Promise<PartnerAccount> {
  const email = rawEmail.toLowerCase().trim();
  assertEmailAllowed(email, role);

  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin.from("profiles").select("id, email, role").eq("email", email).maybeSingle();
    if (error) throw new PartnerError("Não foi possível consultar a conta.", 500);
    const profile = data as Pick<ProfileRow, "id" | "email" | "role"> | null;
    if (!profile) throw new PartnerError("Nenhuma conta PRX com este e-mail. Use “Criar acesso”.", 404);
    if (profile.role === "admin") throw new PartnerError(`Contas de administrador não podem virar acesso de ${ROLE_NAME[role]}.`, 422);
    assertNoOtherPanelRole(profile.role, role);
    await promoteInSupabase(profile.id, role);
    return { userId: profile.id, email };
  }

  const user = userStore.findByEmail(email);
  if (!user) throw new PartnerError("Nenhuma conta PRX com este e-mail. Use “Criar acesso”.", 404);
  if (user.role === "admin") throw new PartnerError(`Contas de administrador não podem virar acesso de ${ROLE_NAME[role]}.`, 422);
  assertNoOtherPanelRole(user.role, role);
  userStore.updateRole(email, role);
  return { userId: user.id, email };
}

/** Cria o login do painel com senha temporária (parceiro por padrão). */
export async function createPartnerAccount(rawEmail: string, fullName: string, role: PanelRole = "partner"): Promise<PartnerAccount> {
  const email = rawEmail.toLowerCase().trim();
  assertEmailAllowed(email, role);
  const temporaryPassword = generateTemporaryPassword();

  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      app_metadata: { role },
      user_metadata: { full_name: fullName },
    });
    if (error || !data.user) {
      const exists = /already|registered|exists/i.test(error?.message || "");
      throw new PartnerError(exists ? "Já existe uma conta com este e-mail. Use “Vincular conta existente”." : "Não foi possível criar o acesso.", exists ? 409 : 500);
    }
    // O trigger handle_new_user cria o perfil como "user"; o papel confiável vem daqui.
    await supabaseAdmin.from("profiles").upsert({ id: data.user.id, email, full_name: fullName, role }, { onConflict: "id" });
    return { userId: data.user.id, email, temporaryPassword };
  }

  if (userStore.findByEmail(email)) throw new PartnerError("Já existe uma conta com este e-mail. Use “Vincular conta existente”.", 409);
  const user = userStore.createUser(email, fullName, temporaryPassword);
  userStore.updateRole(email, role);
  return { userId: user.id, email, temporaryPassword };
}

/** Rebaixa a conta para membro quando o vínculo com o parceiro é removido. */
export async function revokePartnerAccess(userId: string, email: string | null): Promise<void> {
  if (supabaseAdmin && /^[0-9a-f-]{36}$/i.test(userId)) {
    await supabaseAdmin.auth.admin.updateUserById(userId, { app_metadata: { role: "user" } });
    await supabaseAdmin.from("profiles").update({ role: "user" }).eq("id", userId);
  }
  if (email) userStore.updateRole(email, "user");
}

/**
 * Confirma a senha da conta no ato do aceite (assinatura com reautenticação).
 * Mesma origem de verdade do login do portal: Supabase Auth ou contas de demo.
 */
export async function verifyAccountPassword(rawEmail: string, password: string): Promise<boolean> {
  const email = rawEmail.toLowerCase().trim();
  if (!password) return false;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.URL || "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.ANON_KEY || "";
  if (url && isPublicSupabaseKey(anonKey)) {
    const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (!error && data.user) {
      await client.auth.signOut().catch(() => undefined);
      return true;
    }
  }

  const demo = userStore.findByEmail(email);
  if (!demo?.salt) return false;
  const computed = Buffer.from(userStore.hashPassword(password, demo.salt), "hex");
  const stored = Buffer.from(demo.passwordHash, "hex");
  return computed.length === stored.length && crypto.timingSafeEqual(computed, stored);
}
