// Hello World
import { NextRequest, NextResponse } from "next/server";
import { userStore, createSessionToken, AUTH_COOKIE_NAME, StoredUser } from "@/lib/auth";
import { isPublicSupabaseKey, supabaseAdmin } from "@/lib/supabase/client";
import { createClient } from "@supabase/supabase-js";
import { errorMessage } from "@/lib/errors";
import { z } from "zod";
import { checkRateLimit } from "@/lib/security";
import { clientIp } from "@/lib/partners/http";

const LoginSchema = z.object({ email: z.string().trim().email().max(160), password: z.string().min(1).max(128) });

// nosemgrep: prx-mutation-route-without-auth — login do painel: é aqui que a sessão nasce (com limite de tentativas por IP)
export async function POST(req: NextRequest) {
  try {
    // Força bruta: no máximo 10 tentativas por minuto por IP.
    const limit = checkRateLimit(`admin-login:${clientIp(req) ?? "anon"}`, 10, 60);
    if (!limit.allowed) {
      return NextResponse.json({ error: `Muitas tentativas. Tente em ${limit.resetInSeconds}s.` }, { status: 429 });
    }
    const parsed = LoginSchema.safeParse(await req.json().catch(() => null));
    const { email, password } = parsed.success ? parsed.data : { email: "", password: "" };

    if (!email || !password) {
      return NextResponse.json(
        { error: "Informe e-mail e senha de administrador." },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    let authenticatedAdmin: StoredUser | null = null;

    // 1. Try Supabase Auth first
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.URL ||
      "https://ltiizrewiranhyrzbwds.supabase.co";
    const supabaseAnonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.ANON_KEY ||
      "";

    if (supabaseUrl && supabaseAnonKey && isPublicSupabaseKey(supabaseAnonKey)) {
      try {
        const client = createClient(supabaseUrl, supabaseAnonKey);
        const { data: signInData, error: signInError } = await client.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

        if (!signInError && signInData?.user) {
          const authUser = signInData.user;
          let profileRole = "user";
          let fullName = authUser.user_metadata?.full_name || normalizedEmail.split("@")[0];
          let prxScore = 250;
          let prxLevel = 1;
          let avatarUrl = "";
          let walletBalance = 0;

          if (supabaseAdmin) {
            const { data: profile } = await supabaseAdmin
              .from("profiles")
              .select("*")
              .eq("id", authUser.id)
              .maybeSingle();

            if (profile) {
              profileRole = profile.role || "user";
              fullName = profile.full_name || fullName;
              prxScore = profile.nxt_score ?? 250;
              prxLevel = profile.nxt_level ?? 1;
              avatarUrl = profile.avatar_url || avatarUrl;
              walletBalance = Number(profile.wallet_balance ?? 0);
            }
          }

          // STRICT CHECK: Only users with role === 'admin' can login through the admin portal
          if (profileRole !== "admin") {
            return NextResponse.json(
              {
                error: "Acesso negado. Esta conta não possui privilégios de administrador.",
                role: profileRole,
              },
              { status: 403 }
            );
          }

          authenticatedAdmin = {
            id: authUser.id,
            email: authUser.email || normalizedEmail,
            fullName,
            passwordHash: "",
            salt: "",
            role: "admin",
            prxScore,
            prxLevel,
            avatarUrl,
            walletBalance,
            emailConfirmed: true,
            createdAt: authUser.created_at || new Date().toISOString(),
          };
        }
      } catch (authErr) {
        console.warn("Supabase admin signIn error:", authErr);
      }
    }

    // 2. Fallback to in-memory store (e.g. demo users)
    if (!authenticatedAdmin) {
      const demoUser = userStore.findByEmail(normalizedEmail);
      if (demoUser) {
        const computedHash = userStore.hashPassword(password, demoUser.salt);
        if (computedHash === demoUser.passwordHash) {
          if (demoUser.role !== "admin") {
            return NextResponse.json(
              {
                error: "Acesso negado. Esta conta não possui privilégios de administrador.",
                role: demoUser.role,
              },
              { status: 403 }
            );
          }
          authenticatedAdmin = demoUser;
        }
      }
    }

    if (!authenticatedAdmin) {
      return NextResponse.json(
        { error: "Credenciais inválidas ou conta inexistente." },
        { status: 401 }
      );
    }

    const sessionToken = createSessionToken(authenticatedAdmin, 7 * 24 * 60 * 60);

    const response = NextResponse.json({
      success: true,
      message: "Login administrativo realizado com sucesso.",
      user: {
        id: authenticatedAdmin.id,
        email: authenticatedAdmin.email,
        name: authenticatedAdmin.fullName,
        role: authenticatedAdmin.role,
        prxLevel: authenticatedAdmin.prxLevel,
        prxScore: authenticatedAdmin.prxScore,
      },
      rememberMe: true,
    });

    response.cookies.set(AUTH_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });

    response.cookies.set("prx_remember", "1", {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error) || "Erro no processamento do login administrativo." },
      { status: 500 }
    );
  }
}
