// Hello World
import type { NextRequest } from "next/server";
import { getCurrentUser, userStore, type StoredUser } from "@/lib/auth";
import { isReservedAdminEmail } from "@/lib/admin-allowlist";
import { supabaseAdmin } from "@/lib/supabase/client";
import { PartnerError } from "@/lib/partners/errors";
import { generateInsiderPassword } from "@/lib/resenha/password";
import { getResenhaRepository } from "@/lib/resenha/repository";
import type { Insider } from "@/lib/resenha/types";

/**
 * Login do portal dos Insiders. O Insider é uma conta PRX comum (nenhum papel novo
 * em profiles): quem libera o acesso é o cadastro em resenha_insiders, que o admin
 * cria ou vincula, e que pode ser desativado a qualquer momento.
 */

export interface InsiderAccount {
  userId: string;
  email: string;
  name: string;
  /** Presente só quando a conta foi criada agora: exibida uma única vez ao admin. */
  temporaryPassword?: string;
}

/** Conta PRX pelo e-mail (Supabase com a memória de demonstração como reserva). */
export async function findAccountByEmail(rawEmail: string): Promise<{ id: string; email: string; name: string } | null> {
  const email = rawEmail.toLowerCase().trim();
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin.from("profiles").select("id, email, full_name").eq("email", email).maybeSingle();
    if (error) throw new PartnerError("Não foi possível consultar a conta.", 500);
    if (data) return { id: data.id as string, email, name: (data.full_name as string | null) || email.split("@")[0] };
  }
  const user = userStore.findByEmail(email);
  return user ? { id: user.id, email, name: user.fullName } : null;
}

/** Vincula uma conta PRX existente ou cria o login com senha temporária. */
export async function provisionInsiderAccount(mode: "create" | "link", rawEmail: string, name: string): Promise<InsiderAccount> {
  const email = rawEmail.toLowerCase().trim();
  if (mode === "link") {
    const account = await findAccountByEmail(email);
    if (!account) throw new PartnerError("Nenhuma conta PRX com este e-mail. Use “Criar acesso”.", 404);
    return { userId: account.id, email, name: account.name };
  }

  if (isReservedAdminEmail(email)) throw new PartnerError("Este e-mail pertence a um administrador. Use “Vincular conta existente”.", 422);
  const temporaryPassword = generateInsiderPassword();

  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({ email, password: temporaryPassword, email_confirm: true, user_metadata: { full_name: name } });
    if (error || !data.user) {
      const exists = /already|registered|exists/i.test(error?.message || "");
      throw new PartnerError(exists ? "Já existe uma conta com este e-mail. Use “Vincular conta existente”." : "Não foi possível criar o acesso.", exists ? 409 : 500);
    }
    // O gatilho handle_new_user cria o perfil; aqui só garante o nome. O papel continua "user".
    await supabaseAdmin.from("profiles").upsert({ id: data.user.id, email, full_name: name }, { onConflict: "id" });
    return { userId: data.user.id, email, name, temporaryPassword };
  }

  if (userStore.findByEmail(email)) throw new PartnerError("Já existe uma conta com este e-mail. Use “Vincular conta existente”.", 409);
  const user = userStore.createUser(email, name, temporaryPassword);
  return { userId: user.id, email, name, temporaryPassword };
}

/** Define uma senha nova para o login do Insider (a anterior deixa de valer na hora). */
export async function setInsiderPassword(userId: string, email: string, password: string): Promise<void> {
  if (supabaseAdmin) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
    if (error) throw new PartnerError("Não foi possível trocar a senha.", 500);
    return;
  }
  if (!userStore.setPassword(userId, password) && !userStore.setPassword(email, password)) throw new PartnerError("Conta do Insider não encontrada.", 404);
}

/** Cadastro de Insider ativo da conta (por id da conta ou, na falta, pelo e-mail). */
export async function insiderForUser(user: Pick<StoredUser, "id" | "email">): Promise<Insider | null> {
  const repo = getResenhaRepository();
  const insider = (await repo.getInsiderByUser(user.id)) ?? (user.email ? await repo.getInsiderByEmail(user.email) : null);
  return insider && insider.active ? insider : null;
}

/** Sessão do portal: conta logada com cadastro de Insider ativo. */
export async function requireInsider(req?: NextRequest): Promise<{ user: StoredUser; insider: Insider }> {
  const user = await getCurrentUser(req);
  if (!user) throw new PartnerError("Sessão inválida ou expirada.", 401);
  const insider = await insiderForUser(user);
  if (!insider) throw new PartnerError("Esta conta não é de um Insider. Fale com a equipe PRX.", 403);
  return { user, insider };
}
