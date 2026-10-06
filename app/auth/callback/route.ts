// Hello World
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createSessionToken, AUTH_COOKIE_NAME, StoredUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/client";
import { asMemberRole, type SessionCookieOptions } from "@/lib/db-rows";
import { CONSENT_COOKIE, TERMS_VERSION, recordConsent } from "@/lib/legal";
import { createPendingGoogleToken, isBlankProfile, pendingGoogleCookie } from "@/lib/google-pending";
import { handleDirectGoogleCallback } from "@/lib/google-direct";

/** Conta criada agora pelo próprio Google (sem senha nem outro provedor): pode ser desfeita sem perda. */
function isFreshGoogleOnly(user: { created_at?: string; identities?: ReadonlyArray<{ provider: string }> | null }): boolean {
  const created = user.created_at ? new Date(user.created_at).getTime() : 0;
  const identities = user.identities ?? [];
  return Date.now() - created < 15 * 60_000 && identities.length > 0 && identities.every((i) => i.provider === "google");
}

export async function GET(req: NextRequest) {
  // Login com o Google feito direto pelo app (cookie da ida): não passa pelo Supabase.
  const direct = await handleDirectGoogleCallback(req);
  if (direct) return direct;

  const requestUrl = new URL(req.url);
  const code = requestUrl.searchParams.get("code");
  const origin = requestUrl.origin;

  if (code) {
    try {
      const cookieStore = await cookies();
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.URL || "https://ltiizrewiranhyrzbwds.supabase.co",
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.ANON_KEY || "",
        {
          cookies: {
            getAll() {
              return cookieStore.getAll();
            },
            setAll(cookiesToSet) {
              try {
                cookiesToSet.forEach(({ name, value, options }) =>
                  cookieStore.set(name, value, options)
                );
              } catch {
                // Ignore in Server Component
              }
            },
          },
        }
      );

      const { data, error } = await supabase.auth.exchangeCodeForSession(code);

      if (!error && data?.user) {
        const authUser = data.user;
        const email = (authUser.email || "").toLowerCase().trim();
        const fullName =
          authUser.user_metadata?.full_name ||
          authUser.user_metadata?.name ||
          email.split("@")[0] ||
          "Membro PRX";
        const avatarUrl =
          authUser.user_metadata?.avatar_url ||
          authUser.user_metadata?.picture ||
          "";

        let role = "user";
        let prxScore = 300;
        let prxLevel = 1;
        let walletBalance = 0;
        let userCpf: string | undefined;
        let userPhone: string | undefined;

        if (supabaseAdmin) {
          const { data: existing } = await supabaseAdmin.from("profiles").select("*").eq("id", authUser.id).maybeSingle();
          const complete = existing && (asMemberRole(existing.role || "user") !== "user" || (existing.cpf && existing.phone));

          if (!complete) {
            // Cadastro incompleto: nada fica gravado. O app abre pedindo CPF, celular e o aceite;
            // só a conclusão cria o perfil (e a conta de acesso, se o Google acabou de criá-la).
            // O gatilho handle_new_user cria um perfil vazio quando o Google cria o acesso: "existe perfil" não é "já é membro".
            // Acesso criado agora, só com o Google e sem nada preenchido: desfaz (a conclusão cria de novo). Se não desfizer, o acesso fica
            // no cadastro pendente. Perfil vazio = cadastro novo, que ao concluir recebe o e-mail de boas-vindas.
            const blank = isBlankProfile(existing);
            let authUserId: string | undefined = existing ? authUser.id : undefined;
            if (blank && isFreshGoogleOnly(authUser)) {
              const removed = await supabaseAdmin.auth.admin.deleteUser(authUser.id).then(({ error: removeError }) => !removeError, () => false);
              if (removed) authUserId = undefined;
            }
            const pending = createPendingGoogleToken({ authUserId, welcome: blank, email, fullName: String(fullName), avatarUrl: String(avatarUrl) });
            const pendingResponse = NextResponse.redirect(`${origin}/`);
            pendingResponse.cookies.set(pendingGoogleCookie(pending));
            pendingResponse.cookies.set({ name: CONSENT_COOKIE, value: "", path: "/", maxAge: 0, expires: new Date(0) });
            for (const c of cookieStore.getAll()) if (c.name.startsWith("sb-")) pendingResponse.cookies.set({ name: c.name, value: "", path: "/", maxAge: 0, expires: new Date(0) });
            return pendingResponse;
          }

          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .update({
              email,
              ...(existing.avatar_url && !String(existing.avatar_url).includes("unsplash.com") ? {} : { avatar_url: avatarUrl }),
              updated_at: new Date().toISOString(),
            })
            .eq("id", authUser.id)
            .select("*")
            .maybeSingle();

          if (profile) {
            role = profile.role || "user";
            prxScore = profile.nxt_score ?? 300;
            prxLevel = profile.nxt_level ?? 1;
            walletBalance = Number(profile.wallet_balance ?? 0);
            userCpf = profile.cpf || undefined;
            userPhone = profile.phone || undefined;
          }

          if (cookieStore.get(CONSENT_COOKIE)?.value === TERMS_VERSION) await recordConsent(authUser.id);
        }

        const sessionUser: StoredUser = {
          id: authUser.id,
          email,
          fullName,
          passwordHash: "",
          salt: "",
          role: asMemberRole(role),
          prxScore,
          prxLevel,
          avatarUrl,
          walletBalance,
          emailConfirmed: true,
          cpf: userCpf,
          phone: userPhone,
          createdAt: authUser.created_at || new Date().toISOString(),
        };

        const rememberPending = cookieStore.get("prx_remember_pending")?.value;
        const rememberMe = rememberPending !== "0";

        const tokenExpSeconds = rememberMe ? 365 * 24 * 60 * 60 : 24 * 60 * 60;
        const token = createSessionToken(sessionUser, tokenExpSeconds);

        const response = NextResponse.redirect(`${origin}/`);
        
        const cookieOptions: SessionCookieOptions = {
          name: AUTH_COOKIE_NAME,
          value: token,
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
        };

        if (rememberMe) {
          cookieOptions.maxAge = 365 * 24 * 60 * 60;
        }

        response.cookies.set(cookieOptions);

        response.cookies.set({
          name: "prx_remember",
          value: rememberMe ? "1" : "0",
          path: "/",
          sameSite: "lax",
          maxAge: rememberMe ? 365 * 24 * 60 * 60 : undefined,
        });

        response.cookies.set({ name: CONSENT_COOKIE, value: "", path: "/", maxAge: 0, expires: new Date(0) });

        // Delete the temporary pending cookie
        response.cookies.set({
          name: "prx_remember_pending",
          value: "",
          path: "/",
          maxAge: 0,
          expires: new Date(0),
        });

        // Limpeza defensiva de cookies do Supabase (sb-*) para evitar HTTP ERROR 431
        // (Request Header Fields Too Large) decorrente de chunks acumulados no localhost
        try {
          const allCookies = cookieStore.getAll();
          for (const c of allCookies) {
            if (c.name.startsWith("sb-")) {
              response.cookies.delete(c.name);
              response.cookies.set({
                name: c.name,
                value: "",
                path: "/",
                maxAge: 0,
                expires: new Date(0),
              });
            }
          }
        } catch {
          // Ignore
        }

        return response;
      } else if (error) {
        console.error("Erro ao trocar código por sessão no Supabase:", error.message);
      }
    } catch (e) {
      console.error("Exceção no callback do Google OAuth:", e);
    }
  }

  // If there's an error or no code, clean sb- cookies and redirect cleanly to root /
  const fallbackResponse = NextResponse.redirect(`${origin}/`);
  try {
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();
    for (const c of allCookies) {
      if (c.name.startsWith("sb-")) {
        fallbackResponse.cookies.delete(c.name);
        fallbackResponse.cookies.set({
          name: c.name,
          value: "",
          path: "/",
          maxAge: 0,
          expires: new Date(0),
        });
      }
    }
  } catch {
    // Ignore
  }

  return fallbackResponse;
}
