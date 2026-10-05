// Hello World
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { userStore, createSessionToken, AUTH_COOKIE_NAME, StoredUser } from "@/lib/auth";
import { checkRateLimit, sanitizeInput } from "@/lib/security";
import { isPublicSupabaseKey, supabaseAdmin } from "@/lib/supabase/client";
import { createClient } from "@supabase/supabase-js";
import { errorMessage } from "@/lib/errors";
import { asMemberRole, type SessionCookieOptions } from "@/lib/db-rows";
import { recordConsent } from "@/lib/legal";

const LoginSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(6, "A senha deve ter no mínimo 6 caracteres"),
  rememberMe: z.boolean().optional().default(true),
  /** Ciência dos Termos/LGPD marcada na tela de entrada: renova o registro do aceite. */
  termsAccepted: z.boolean().optional(),
});

// nosemgrep: prx-mutation-route-without-auth — login: é aqui que a sessão nasce (limite de tentativas e senha verificada)
export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
    
    // Anti-Brute Force Rate Limiting: 10 attempts per minute per IP
    const rateCheck = checkRateLimit(`login_${ip}`, 10, 60);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: `Muitas tentativas. Bloqueio de segurança temporário. Tente em ${rateCheck.resetInSeconds}s.` },
        { status: 429 }
      );
    }

    const body = await req.json();
    const parseResult = LoginSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || "Dados inválidos." },
        { status: 400 }
      );
    }

    const email = sanitizeInput(parseResult.data.email.toLowerCase().trim());
    const password = parseResult.data.password;
    const rememberMe = parseResult.data.rememberMe ?? true;

    let authenticatedUser: StoredUser | null = null;

    // 1. Try Supabase Auth
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.URL || "https://ltiizrewiranhyrzbwds.supabase.co";
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.ANON_KEY || "";

    if (supabaseUrl && supabaseAnonKey && isPublicSupabaseKey(supabaseAnonKey)) {
      try {
        const client = createClient(supabaseUrl, supabaseAnonKey);
        const { data: signInData, error: signInError } = await client.auth.signInWithPassword({
          email,
          password,
        });

        if (!signInError && signInData?.user) {
          const authUser = signInData.user;
          let profile = null;

          if (supabaseAdmin) {
            const { data } = await supabaseAdmin
              .from("profiles")
              .select("*")
              .eq("id", authUser.id)
              .maybeSingle();
            profile = data;
          }

          authenticatedUser = {
            id: authUser.id,
            email: authUser.email || email,
            fullName: profile?.full_name || authUser.user_metadata?.full_name || email.split("@")[0],
            passwordHash: "",
            salt: "",
            role: asMemberRole(profile?.role || authUser.app_metadata?.role),
            prxScore: profile?.nxt_score ?? 250,
            prxLevel: profile?.nxt_level ?? 1,
            avatarUrl: profile?.avatar_url || "",
            walletBalance: Number(profile?.wallet_balance ?? 0),
            emailConfirmed: true,
            createdAt: authUser.created_at || new Date().toISOString(),
          };
        }
      } catch (authErr) {
        console.warn("Supabase signIn attempt notice:", authErr);
      }
    }

    // 2. Fallback to in-memory store for demo users
    if (!authenticatedUser) {
      const demoUser = userStore.findByEmail(email);
      if (demoUser) {
        const inputHash = userStore.hashPassword(password, demoUser.salt);
        if (inputHash === demoUser.passwordHash) {
          authenticatedUser = demoUser;
        }
      }
    }

    if (!authenticatedUser) {
      return NextResponse.json(
        { error: "Credenciais inválidas. Verifique o e-mail e senha." },
        { status: 401 }
      );
    }

    // Remember me logic: 1 year (31536000s) if true, session (24h token, no cookie maxAge) if false
    const tokenExpSeconds = rememberMe ? 365 * 24 * 60 * 60 : 24 * 60 * 60;
    if (parseResult.data.termsAccepted) await recordConsent(authenticatedUser.id);
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

    const cookieConfig: SessionCookieOptions = {
      name: AUTH_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      sameSite: "lax",
    };

    if (rememberMe) {
      cookieConfig.maxAge = 365 * 24 * 60 * 60; // 1 year persistence
    }

    response.cookies.set(cookieConfig);

    response.cookies.set({
      name: "prx_remember",
      value: rememberMe ? "1" : "0",
      path: "/",
      sameSite: "lax",
      maxAge: rememberMe ? 365 * 24 * 60 * 60 : undefined,
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error) || "Erro no processamento do login." },
      { status: 500 }
    );
  }
}
