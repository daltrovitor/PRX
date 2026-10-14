// Hello World
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { AUTH_COOKIE_NAME, createSessionToken, loadSessionUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/security";
import { PASSKEY_CHALLENGE_COOKIE, PasskeyError, authenticationOptions, challengeCookie, verifyAuthentication } from "@/lib/passkeys/service";
import { incidentResponse } from "@/lib/incidents";

const REMEMBER_SECONDS = 365 * 24 * 60 * 60;
const optionsSchema = z.object({
  userId: z.string().trim().min(1).max(200),
  credentialId: z
    .string()
    .trim()
    .max(512)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
});

function clientIp(req: NextRequest) {
  return (req.headers.get("x-forwarded-for") || "127.0.0.1").split(",")[0].trim();
}

/**
 * Entrada com biometria na tela "Lembrar de mim". GET ?userId=&credentialId= gera o
 * desafio (só da biometria deste aparelho, quando informada); POST confere a assinatura do aparelho e
 * abre a sessão, como o login com senha.
 */
export async function GET(req: NextRequest) {
  const rate = checkRateLimit(`passkey_options_${clientIp(req)}`, 20, 60);
  if (!rate.allowed) return NextResponse.json({ error: `Muitas tentativas. Tente em ${rate.resetInSeconds}s.` }, { status: 429 });
  const parsed = optionsSchema.safeParse({
    userId: req.nextUrl.searchParams.get("userId"),
    credentialId: req.nextUrl.searchParams.get("credentialId") || undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "Conta inválida." }, { status: 400 });
  try {
    const { options, sealed } = await authenticationOptions(req, parsed.data.userId, parsed.data.credentialId);
    const res = NextResponse.json({ options });
    res.cookies.set(challengeCookie(sealed));
    return res;
  } catch (err) {
    if (err instanceof PasskeyError) return NextResponse.json({ error: err.message }, { status: err.status });
    return incidentResponse(err, "Não foi possível iniciar a biometria.");
  }
}

// nosemgrep: prx-mutation-route-without-auth — entrada por biometria: a assinatura WebAuthn verificada é a autenticação
export async function POST(req: NextRequest) {
  const rate = checkRateLimit(`passkey_login_${clientIp(req)}`, 10, 60);
  if (!rate.allowed) return NextResponse.json({ error: `Muitas tentativas. Bloqueio de segurança temporário. Tente em ${rate.resetInSeconds}s.` }, { status: 429 });
  try {
    const body = (await req.json().catch(() => null)) as { response?: AuthenticationResponseJSON } | null;
    if (!body?.response?.id) return NextResponse.json({ error: "Resposta da biometria ausente." }, { status: 400 });
    const userId = await verifyAuthentication(req, req.cookies.get(PASSKEY_CHALLENGE_COOKIE)?.value, body.response);
    const user = await loadSessionUser(userId);
    if (!user) throw new PasskeyError("Conta não encontrada.", 404);

    const res = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.fullName,
        role: user.role,
        prxScore: user.prxScore,
        prxLevel: user.prxLevel,
        walletBalance: user.walletBalance,
        avatarUrl: user.avatarUrl,
      },
    });
    res.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: createSessionToken(user, REMEMBER_SECONDS),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      sameSite: "lax",
      maxAge: REMEMBER_SECONDS,
    });
    res.cookies.set({ name: "prx_remember", value: "1", path: "/", sameSite: "lax", maxAge: REMEMBER_SECONDS });
    res.cookies.set(challengeCookie(""));
    return res;
  } catch (err) {
    const res = err instanceof PasskeyError ? NextResponse.json({ error: err.message }, { status: err.status }) : await incidentResponse(err, "Não foi possível entrar com a biometria.");
    res.cookies.set(challengeCookie(""));
    return res;
  }
}
