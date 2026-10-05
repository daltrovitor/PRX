// Hello World
import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, createSessionToken, userStore, type StoredUser } from "@/lib/auth";
import { isAllowlistedAdmin } from "@/lib/admin-allowlist";
import { supabaseAdmin } from "@/lib/supabase/client";
import { checkRateLimit } from "@/lib/security";
import { PartnerError } from "@/lib/partners/errors";
import { clientIp, errorResponse, readJson } from "@/lib/partners/http";
import { verifyAccountPassword } from "@/lib/partners/access";
import { getStaffRepository } from "@/lib/staff/repository";

const SESSION_SECONDS = 12 * 60 * 60;

/** Conta que acabou de autenticar: papel confiável (profiles/app_metadata ou contas de demo). */
async function accountFor(email: string): Promise<{ id: string; name: string; role: StoredUser["role"] } | null> {
  if (supabaseAdmin) {
    const { data } = await supabaseAdmin.from("profiles").select("id, full_name, role").eq("email", email).maybeSingle();
    if (data?.id) {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(data.id as string);
      const metaRole = authUser?.user?.app_metadata?.role;
      const role = (metaRole === "admin" || data.role === "admin" ? "admin" : metaRole === "staff" || data.role === "staff" ? "staff" : data.role || "user") as StoredUser["role"];
      return { id: data.id as string, name: (data.full_name as string | null) || email.split("@")[0], role };
    }
  }
  const user = userStore.findByEmail(email);
  return user ? { id: user.id, name: user.fullName, role: user.role } : null;
}

/**
 * POST /api/staff/login — portal da Equipe PRX (staff.prx.app.br).
 * Entra funcionário com cadastro ativo na equipe ou administrador.
 * Sessão de 12h: um turno de portaria.
 */
// nosemgrep: prx-mutation-route-without-auth — login da equipe: é aqui que a sessão nasce
export async function POST(req: NextRequest) {
  try {
    const limit = checkRateLimit(`staff-login:${clientIp(req) || "anon"}`, 10, 60);
    if (!limit.allowed) throw new PartnerError(`Muitas tentativas. Aguarde ${limit.resetInSeconds}s.`, 429);

    const body = (await readJson(req)) as { email?: unknown; password?: unknown };
    const email = typeof body.email === "string" ? body.email.toLowerCase().trim().slice(0, 200) : "";
    const password = typeof body.password === "string" ? body.password.slice(0, 200) : "";
    if (!email || !password) throw new PartnerError("Informe e-mail e senha.", 400);

    if (!(await verifyAccountPassword(email, password))) throw new PartnerError("E-mail ou senha incorretos.", 401);
    const account = await accountFor(email);
    if (!account) throw new PartnerError("E-mail ou senha incorretos.", 401);

    const isAdmin = account.role === "admin" || isAllowlistedAdmin(email);
    if (!isAdmin) {
      if (account.role !== "staff") throw new PartnerError("Esta conta não faz parte da Equipe PRX.", 403);
      const member = await getStaffRepository().getByUser(account.id, email);
      if (!member?.active) throw new PartnerError("Seu acesso à Equipe PRX está desativado. Fale com o administrador.", 403);
    }

    const role: StoredUser["role"] = isAdmin ? "admin" : "staff";
    const token = createSessionToken(
      { id: account.id, email, fullName: account.name, role, passwordHash: "", salt: "", prxScore: 0, prxLevel: 1, avatarUrl: "", walletBalance: 0, emailConfirmed: true, createdAt: new Date().toISOString() },
      SESSION_SECONDS
    );
    const response = NextResponse.json({ success: true, user: { id: account.id, email, name: account.name, role } }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_SECONDS,
      path: "/",
    });
    return response;
  } catch (error) {
    return errorResponse(error, "Não foi possível entrar agora.");
  }
}
