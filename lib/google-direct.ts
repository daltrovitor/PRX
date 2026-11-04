// Hello World
import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, createSessionToken, REMEMBER_SESSION_SECONDS, type StoredUser } from "@/lib/auth";
import { asMemberRole, type SessionCookieOptions } from "@/lib/db-rows";
import { CONSENT_COOKIE, TERMS_VERSION, recordConsent } from "@/lib/legal";
import { GOOGLE_OAUTH_COOKIE, GoogleOAuthError, exchangeGoogleCode, googleIdentity, googleOAuthConfig, readOAuthTransaction, stateMatches } from "@/lib/google-oauth";
import { createPendingGoogleToken, isBlankProfile, pendingGoogleCookie } from "@/lib/google-pending";
import { supabaseAdmin } from "@/lib/supabase/client";

/*
 * Volta do Google no login direto (lib/google-oauth.ts). Mesmo desenho do callback do Supabase
 * (app/auth/callback): perfil completo entra, o resto vira cadastro pendente e nada é gravado
 * antes do CPF. A diferença é que aqui o Supabase Auth nunca vê o Google: nenhum acesso nem
 * perfil vazio nasce até a conclusão do cadastro, então não sobra usuário fantasma.
 */

const expired = { value: "", path: "/", maxAge: 0, expires: new Date(0) } as const;

function homeRedirect(origin: string): NextResponse {
  const response = NextResponse.redirect(`${origin}/`);
  response.cookies.set({ name: GOOGLE_OAUTH_COOKIE, ...expired });
  return response;
}

/** null quando esta volta não é do login direto (sem o cookie da ida): segue o fluxo do Supabase. */
export async function handleDirectGoogleCallback(req: NextRequest, fetcher: typeof fetch = fetch): Promise<NextResponse | null> {
  const cookie = req.cookies.get(GOOGLE_OAUTH_COOKIE)?.value;
  if (!cookie) return null;
  const origin = req.nextUrl.origin;

  const config = googleOAuthConfig();
  const tx = readOAuthTransaction(cookie);
  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  if (!config || !tx || !supabaseAdmin || params.get("error") || !code || !stateMatches(tx, params.get("state"))) return homeRedirect(origin);

  let identity;
  try {
    identity = googleIdentity(await exchangeGoogleCode(config, tx, code, fetcher), config, tx);
  } catch (error) {
    console.warn("[google] login recusado:", error instanceof GoogleOAuthError ? error.message : "falha ao falar com o Google");
    return homeRedirect(origin);
  }

  const { email } = identity;
  const fullName = identity.name || email.split("@")[0] || "Membro PRX";
  const { data: existing } = await supabaseAdmin.from("profiles").select("*").eq("email", email).maybeSingle();
  const complete = existing && (asMemberRole(existing.role || "user") !== "user" || (existing.cpf && existing.phone));

  if (!complete) {
    // Cadastro incompleto: nada fica gravado. O app abre pedindo CPF, celular e o aceite; só a conclusão cria o acesso e o perfil.
    const pending = createPendingGoogleToken({ authUserId: existing?.id, welcome: isBlankProfile(existing), email, fullName, avatarUrl: identity.picture });
    const response = homeRedirect(origin);
    response.cookies.set(pendingGoogleCookie(pending));
    response.cookies.set({ name: CONSENT_COOKIE, ...expired });
    return response;
  }

  const { data: updated } = await supabaseAdmin
    .from("profiles")
    .update({
      ...(existing.avatar_url && !String(existing.avatar_url).includes("unsplash.com") ? {} : { avatar_url: identity.picture }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id)
    .select("*")
    .maybeSingle();
  const profile = updated ?? existing;

  if (req.cookies.get(CONSENT_COOKIE)?.value === TERMS_VERSION) await recordConsent(existing.id);

  const user: StoredUser = {
    id: existing.id,
    email,
    fullName: profile.full_name || fullName,
    passwordHash: "",
    salt: "",
    role: asMemberRole(profile.role || "user"),
    prxScore: profile.nxt_score ?? 300,
    prxLevel: profile.nxt_level ?? 1,
    avatarUrl: profile.avatar_url || identity.picture,
    walletBalance: Number(profile.wallet_balance ?? 0),
    emailConfirmed: true,
    cpf: profile.cpf || undefined,
    phone: profile.phone || undefined,
    createdAt: profile.created_at || new Date().toISOString(),
  };

  const rememberMe = req.cookies.get("prx_remember_pending")?.value !== "0";
  const sessionCookie: SessionCookieOptions = {
    name: AUTH_COOKIE_NAME,
    value: createSessionToken(user, rememberMe ? REMEMBER_SESSION_SECONDS : 24 * 60 * 60),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  };
  if (rememberMe) sessionCookie.maxAge = REMEMBER_SESSION_SECONDS;

  const response = homeRedirect(origin);
  response.cookies.set(sessionCookie);
  response.cookies.set({ name: "prx_remember", value: rememberMe ? "1" : "0", path: "/", sameSite: "lax", maxAge: rememberMe ? REMEMBER_SESSION_SECONDS : undefined });
  response.cookies.set({ name: CONSENT_COOKIE, ...expired });
  response.cookies.set({ name: "prx_remember_pending", ...expired });
  return response;
}
