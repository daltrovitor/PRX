// Hello World
import crypto from "crypto";
import { getSessionSecret } from "@/lib/server-secrets";

export const PENDING_GOOGLE_COOKIE = "prx_pending_google";
const PENDING_TTL_SECONDS = 15 * 60;

/** Cookie httpOnly do cadastro Google pendente (vazio = apaga). */
export function pendingGoogleCookie(value: string) {
  return {
    name: PENDING_GOOGLE_COOKIE,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: value ? PENDING_TTL_SECONDS : 0,
  };
}

export interface PendingGooglePayload {
  authUserId?: string;
  /** Cadastro novo: ao concluir, vale o e-mail de boas-vindas. Tokens antigos não trazem o campo. */
  welcome?: boolean;
  email: string;
  fullName: string;
  avatarUrl?: string;
  exp: number;
}

/**
 * Perfil que nunca passou pelo cadastro da PRX: sem CPF, celular nem aceite dos Termos.
 * É o que o gatilho handle_new_user do banco cria no instante em que o Google cria o acesso,
 * por isso "já existe perfil" não quer dizer "já é membro".
 */
export function isBlankProfile(profile: { cpf?: string | null; phone?: string | null; terms_accepted_at?: string | null; role?: string | null } | null | undefined): boolean {
  return !profile || (!profile.cpf && !profile.phone && !profile.terms_accepted_at && (profile.role || "user") === "user");
}

/**
 * Cria token temporário assinado (15 minutos) para guardar dados do Google
 * antes do usuário informar CPF e telefone. O usuário NÃO é salvo no banco
 * enquanto não completar o cadastro.
 */
export function createPendingGoogleToken(data: { authUserId?: string; welcome?: boolean; email: string; fullName: string; avatarUrl?: string }): string {
  const payload: PendingGooglePayload = {
    authUserId: data.authUserId,
    welcome: data.welcome,
    email: data.email.toLowerCase().trim(),
    fullName: data.fullName.trim(),
    avatarUrl: data.avatarUrl || "",
    exp: Math.floor(Date.now() / 1000) + PENDING_TTL_SECONDS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", getSessionSecret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyPendingGoogleToken(token: string): PendingGooglePayload | null {
  try {
    const [body, signature] = token.split(".");
    if (!body || !signature) return null;

    const expected = crypto.createHmac("sha256", getSessionSecret()).update(body).digest("base64url");
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as PendingGooglePayload;
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}
