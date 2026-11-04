// Hello World
import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, createSessionToken } from "@/lib/auth";
import { checkRateLimitPersistent } from "@/lib/security";
import { PartnerError } from "@/lib/partners/errors";
import { clientIp, errorResponse, readJson } from "@/lib/partners/http";
import { verifyAccountPassword } from "@/lib/partners/access";
import { findAccountByEmail, insiderForUser } from "@/lib/resenha/access";
import { insiderDenial } from "@/lib/resenha/session";

/** Insider entra pelo celular: sessão de 7 dias, só neste subdomínio (cookie sem domínio). */
const SESSION_SECONDS = 7 * 24 * 60 * 60;

/**
 * POST /api/insider/login — portal dos Insiders (insider.<domínio>).
 * Entra quem tem conta PRX e cadastro de Insider ativo; o admin cria ou vincula o cadastro.
 */
// nosemgrep: prx-mutation-route-without-auth — login do Insider: é aqui que a sessão nasce
export async function POST(req: NextRequest) {
  try {
    const limit = await checkRateLimitPersistent(`insider-login:${clientIp(req) ?? "anon"}`, 10, 60);
    if (!limit.allowed) throw new PartnerError(`Muitas tentativas. Aguarde ${limit.resetInSeconds}s.`, 429);

    const body = (await readJson(req)) as { email?: unknown; password?: unknown };
    const email = typeof body.email === "string" ? body.email.toLowerCase().trim().slice(0, 200) : "";
    const password = typeof body.password === "string" ? body.password.slice(0, 200) : "";
    if (!email || !password) throw new PartnerError("Informe e-mail e senha.", 400);

    if (!(await verifyAccountPassword(email, password))) throw new PartnerError("E-mail ou senha incorretos.", 401);
    const account = await findAccountByEmail(email);
    if (!account) throw new PartnerError("E-mail ou senha incorretos.", 401);
    const insider = await insiderForUser({ id: account.id, email });
    if (!insider) throw new PartnerError(await insiderDenial({ id: account.id, email }), 403);

    const token = createSessionToken(
      { id: account.id, email, fullName: insider.name, role: "user", passwordHash: "", salt: "", prxScore: 0, prxLevel: 1, avatarUrl: "", walletBalance: 0, emailConfirmed: true, createdAt: new Date().toISOString() },
      SESSION_SECONDS
    );
    const response = NextResponse.json({ success: true, user: { name: insider.name, email } }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(AUTH_COOKIE_NAME, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: SESSION_SECONDS, path: "/" });
    return response;
  } catch (error) {
    return errorResponse(error, "Não foi possível entrar agora.");
  }
}
