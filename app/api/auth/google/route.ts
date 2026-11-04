// Hello World
import { NextRequest, NextResponse } from "next/server";
import { userStore, createSessionToken, AUTH_COOKIE_NAME, REMEMBER_SESSION_SECONDS, StoredUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/client";
import { DEMO_ACCOUNTS_ENABLED } from "@/lib/server-secrets";
import type { SessionCookieOptions } from "@/lib/db-rows";
import { createPendingGoogleToken, pendingGoogleCookie } from "@/lib/google-pending";
import { incidentResponse } from "@/lib/incidents";

/**
 * Login Google simulado — SOMENTE para desenvolvimento local.
 *
 * Esta rota aceita o e-mail enviado no corpo sem nenhuma prova de identidade.
 * Em produção isso permitiria entrar na conta de qualquer pessoa, por isso ela
 * responde 404. O login Google real passa pelo Supabase OAuth (/auth/callback).
 */
// nosemgrep: prx-mutation-route-without-auth — entrada com Google (fluxo simulado só no desenvolvimento): cria a sessão
export async function POST(req: NextRequest) {
  if (!DEMO_ACCOUNTS_ENABLED) {
    return NextResponse.json(
      { error: "Login com Google indisponível. Tente novamente em instantes." },
      { status: 404 }
    );
  }
  try {
    let body: { email?: string; name?: string; fullName?: string; avatarUrl?: string; rememberMe?: boolean } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const email = (body.email || "usuario.google@gmail.com").toLowerCase().trim();
    const name = (body.name || body.fullName || "Usuário Google").trim();
    const avatarUrl = body.avatarUrl || "";

    let authenticatedUser: StoredUser | null = null;

    if (supabaseAdmin) {
      try {
        const { data: existingProfile } = await supabaseAdmin
          .from("profiles")
          .select("*")
          .eq("email", email)
          .maybeSingle();

        if (existingProfile) {
          authenticatedUser = {
            id: existingProfile.id,
            email: existingProfile.email,
            fullName: existingProfile.full_name || name,
            passwordHash: "",
            salt: "",
            role: existingProfile.role || "user",
            prxScore: existingProfile.nxt_score ?? 300,
            prxLevel: existingProfile.nxt_level ?? 1,
            avatarUrl: existingProfile.avatar_url || avatarUrl,
            walletBalance: Number(existingProfile.wallet_balance ?? 0),
            emailConfirmed: true,
            cpf: existingProfile.cpf,
            phone: existingProfile.phone,
            createdAt: existingProfile.created_at || new Date().toISOString(),
          };
        }
      } catch (sbErr) {
        console.warn("Supabase Google auth fallback:", sbErr);
      }
    }

    const rememberMe = body.rememberMe !== false;
    authenticatedUser ??= userStore.findByEmail(email) ?? null;

    // Como no Google real: sem CPF e celular, nada é gravado e o app abre pedindo os dados.
    const complete = authenticatedUser && (authenticatedUser.role !== "user" || (authenticatedUser.cpf && authenticatedUser.phone));
    if (!authenticatedUser || !complete) {
      const pending = createPendingGoogleToken({ authUserId: supabaseAdmin ? authenticatedUser?.id : undefined, email, fullName: name, avatarUrl });
      const res = NextResponse.json({ success: true, pendingRegistration: true });
      res.cookies.set(pendingGoogleCookie(pending));
      return res;
    }

    const tokenExpSeconds = rememberMe ? REMEMBER_SESSION_SECONDS : 24 * 60 * 60;
    const token = createSessionToken(authenticatedUser, tokenExpSeconds);

    const response = NextResponse.json({
      success: true,
      rememberMe,
      user: {
        id: authenticatedUser.id,
        email: authenticatedUser.email,
        name: authenticatedUser.fullName,
        role: authenticatedUser.role,
        prxScore: authenticatedUser.prxScore,
        prxLevel: authenticatedUser.prxLevel,
        walletBalance: authenticatedUser.walletBalance,
        avatarUrl: authenticatedUser.avatarUrl,
      },
    });

    const cookieOptions: SessionCookieOptions = {
      name: AUTH_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    };

    if (rememberMe) {
      cookieOptions.maxAge = REMEMBER_SESSION_SECONDS;
    }

    response.cookies.set(cookieOptions);

    response.cookies.set({
      name: "prx_remember",
      value: rememberMe ? "1" : "0",
      path: "/",
      sameSite: "lax",
      maxAge: rememberMe ? REMEMBER_SESSION_SECONDS : undefined,
    });

    return response;
  } catch (err) {
    return incidentResponse(err, "Falha na autenticação com o Google.");
  }
}
