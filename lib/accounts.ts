// Hello World
import type { NextResponse } from "next/server";
import { userStore, createSessionToken, AUTH_COOKIE_NAME, REMEMBER_SESSION_SECONDS, type StoredUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/client";
import { isReservedAdminEmail } from "@/lib/admin-allowlist";
import { PartnerError } from "@/lib/partners/errors";
import { TERMS_VERSION } from "@/lib/legal";

/**
 * Criação de contas com e-mail e senha, compartilhada pelo cadastro do
 * membro, pela Conta Pai e pelas contas que o responsável cria para os filhos.
 * Supabase Auth (e-mail já confirmado) + perfil; memória no desenvolvimento.
 */
export const DUPLICATE_EMAIL = "Este e-mail já está cadastrado no sistema.";

export async function createAccount(input: { email: string; fullName: string; password: string; cpf?: string; phone?: string }): Promise<StoredUser> {
  const email = input.email.toLowerCase().trim();
  const fullName = input.fullName.trim();
  const cpfDigits = input.cpf ? input.cpf.replace(/\D/g, "") : undefined;
  const phoneDigits = input.phone ? input.phone.replace(/\D/g, "") : undefined;

  // E-mails da lista de administradores não podem nascer pelo cadastro público.
  if (isReservedAdminEmail(email)) throw new PartnerError(DUPLICATE_EMAIL, 409);

  const base = { prxScore: 250, prxLevel: 1, walletBalance: 0, avatarUrl: "" };
  let userId: string;

  if (supabaseAdmin) {
    if (cpfDigits) {
      const { data: existingCpf } = await supabaseAdmin.from("profiles").select("id").eq("cpf", cpfDigits).maybeSingle();
      if (existingCpf) throw new PartnerError("Este CPF já está cadastrado na PRX.", 409);
    }

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: "user", nxt_score: base.prxScore, nxt_level: base.prxLevel, wallet_balance: base.walletBalance },
    });
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("already registered") || msg.includes("unique") || msg.includes("exists")) throw new PartnerError(DUPLICATE_EMAIL, 409);
      throw new PartnerError(error.message || "Erro ao criar a conta.", 400);
    }
    if (!data?.user) throw new PartnerError("Falha ao registrar a conta.", 500);
    userId = data.user.id;
    const { data: savedProfile, error: profileError } = await supabaseAdmin.from("profiles").upsert(
      {
        id: userId,
        email,
        full_name: fullName,
        role: "user",
        nxt_score: base.prxScore,
        nxt_level: base.prxLevel,
        wallet_balance: base.walletBalance,
        avatar_url: base.avatarUrl,
        cpf: cpfDigits || null,
        phone: phoneDigits || null,
        terms_accepted_at: new Date().toISOString(),
        terms_version: TERMS_VERSION,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    ).select("id, cpf, phone").single();
    // Só emite sessão quando os dados enviados foram persistidos e relidos.
    if (profileError || !savedProfile || savedProfile.cpf !== (cpfDigits || null) || savedProfile.phone !== (phoneDigits || null)) {
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => undefined);
      throw new PartnerError(profileError?.code === "23505" ? "Este CPF já está cadastrado na PRX." : "Não foi possível salvar o cadastro. Tente novamente.", profileError?.code === "23505" ? 409 : 500);
    }
  } else {
    try {
      userId = userStore.createUser(email, fullName, input.password, cpfDigits, phoneDigits).id;
    } catch {
      throw new PartnerError(DUPLICATE_EMAIL, 409);
    }
  }

  return {
    id: userId,
    email,
    fullName,
    passwordHash: "",
    salt: "",
    role: "user",
    ...base,
    cpf: cpfDigits,
    phone: phoneDigits,
    emailConfirmed: true,
    createdAt: new Date().toISOString(),
  };
}

/** Desfaz uma conta recém-criada quando um passo seguinte falha (ex.: CPF já usado). */
export async function discardAccount(userId: string): Promise<void> {
  try {
    if (supabaseAdmin) await supabaseAdmin.auth.admin.deleteUser(userId);
    else userStore.deleteUser(userId);
  } catch {
    // melhor esforço: a conta fica sem identidade e o app pede os dados de novo
  }
}

/** Sessão de 14 dias ("lembrar de mim"), como no cadastro do membro (pentest H5). */
export function attachSession(response: NextResponse, user: StoredUser): NextResponse {
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: createSessionToken(user, REMEMBER_SESSION_SECONDS),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    sameSite: "lax",
    maxAge: REMEMBER_SESSION_SECONDS,
  });
  response.cookies.set({ name: "prx_remember", value: "1", path: "/", sameSite: "lax", maxAge: REMEMBER_SESSION_SECONDS });
  return response;
}

export function publicUser(user: StoredUser) {
  return {
    id: user.id,
    email: user.email,
    name: user.fullName,
    role: user.role,
    prxScore: user.prxScore,
    prxLevel: user.prxLevel,
    walletBalance: user.walletBalance,
    avatarUrl: user.avatarUrl,
    cpf: user.cpf,
    phone: user.phone,
  };
}
