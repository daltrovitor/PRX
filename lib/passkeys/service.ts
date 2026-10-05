// Hello World
import crypto from "crypto";
import type { NextRequest } from "next/server";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { PRX_ZONE, isPrxZoneHost } from "@/lib/domains";
import { getSessionSecret } from "@/lib/server-secrets";
import { getPasskeyRepository, type PasskeyRecord } from "@/lib/passkeys/repository";

/**
 * Entrada com biometria (WebAuthn). O desafio de cada cerimônia viaja num
 * cookie httpOnly assinado e de vida curta, amarrado ao propósito e ao usuário:
 * não há como reaproveitar um desafio de cadastro para entrar, nem o de outra conta.
 */

export const PASSKEY_CHALLENGE_COOKIE = "prx_passkey_challenge";
const CHALLENGE_TTL_SECONDS = 5 * 60;
const RP_NAME = "PRX";

export class PasskeyError extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

type Purpose = "register" | "login" | "transaction";

interface ChallengeClaims {
  challenge: string;
  purpose: Purpose;
  userId: string;
  /** Operação confirmada (ex.: id do pedido de Pix): o desafio não serve para outra. */
  ref?: string;
  exp: number;
}

function sign(body: string): string {
  return crypto.createHmac("sha256", getSessionSecret()).update(`passkey.${body}`).digest("base64url");
}

export function sealChallenge(claims: Omit<ChallengeClaims, "exp">): string {
  const body = Buffer.from(JSON.stringify({ ...claims, exp: Math.floor(Date.now() / 1000) + CHALLENGE_TTL_SECONDS })).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function openChallenge(sealed: string | undefined, purpose: Purpose): ChallengeClaims {
  const [body, signature] = (sealed || "").split(".");
  if (!body || !signature) throw new PasskeyError("A confirmação expirou. Tente de novo.", 400);
  const given = Buffer.from(signature);
  const expected = Buffer.from(sign(body));
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    throw new PasskeyError("A confirmação expirou. Tente de novo.", 400);
  }
  const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ChallengeClaims;
  if (claims.purpose !== purpose || claims.exp < Math.floor(Date.now() / 1000)) throw new PasskeyError("A confirmação expirou. Tente de novo.", 400);
  return claims;
}

export const challengeCookie = (value: string) => ({
  name: PASSKEY_CHALLENGE_COOKIE,
  value,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/api/auth/passkeys",
  maxAge: value ? CHALLENGE_TTL_SECONDS : 0,
});

/**
 * RP ID e origem esperados. Em prx.app.br o RP ID é o próprio domínio, não o
 * subdomínio: a biometria cadastrada em teste.prx.app.br continua valendo quando o
 * app trocar de subdomínio (ou for para o apex). Fora dele (localhost, previews) é o
 * host da requisição, preso ao endereço em que foi cadastrada. PRX_WEBAUTHN_RP_ID e
 * PRX_WEBAUTHN_ORIGINS (vírgula) fixam os dois atrás de proxies.
 */
export function relyingParty(req: NextRequest): { rpID: string; origins: string[] } {
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || req.nextUrl.host).split(",")[0].trim().toLowerCase();
  const proto = (req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(":", "")).split(",")[0].trim();
  const hostname = host.split(":")[0];
  const rpID = process.env.PRX_WEBAUTHN_RP_ID || (isPrxZoneHost(hostname) ? PRX_ZONE : hostname);
  const configured = (process.env.PRX_WEBAUTHN_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return { rpID, origins: configured.length > 0 ? configured : [`${proto}://${host}`] };
}

const transports = (list: string[]): AuthenticatorTransportFuture[] => list as AuthenticatorTransportFuture[];

/** Nome curto do aparelho a partir do User-Agent, só para a lista do perfil. */
export function deviceLabel(userAgent: string | null): string {
  const ua = userAgent || "";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/Macintosh/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows";
  return "Este aparelho";
}

export async function registrationOptions(req: NextRequest, user: { id: string; email: string; name: string }) {
  const { rpID } = relyingParty(req);
  const existing = await getPasskeyRepository().listByUser(user.id);
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: user.email,
    userDisplayName: user.name || user.email,
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({ id: c.id, transports: transports(c.transports) })),
    // Credencial presa a este aparelho (não é passkey sincronizada): o sistema abre direto o
    // Windows Hello / a digital do Android, sem perguntar em qual app ou gerenciador salvar.
    authenticatorSelection: { residentKey: "discouraged", userVerification: "required", authenticatorAttachment: "platform" },
    preferredAuthenticatorType: "localDevice",
  });
  return { options, sealed: sealChallenge({ challenge: options.challenge, purpose: "register", userId: user.id }) };
}

export async function verifyRegistration(req: NextRequest, userId: string, sealed: string | undefined, response: RegistrationResponseJSON): Promise<PasskeyRecord> {
  const claims = openChallenge(sealed, "register");
  if (claims.userId !== userId) throw new PasskeyError("A confirmação pertence a outra conta.", 403);
  const { rpID, origins } = relyingParty(req);
  const result = await verifyRegistrationResponse({
    response,
    expectedChallenge: claims.challenge,
    expectedOrigin: origins,
    expectedRPID: rpID,
    requireUserVerification: true,
  }).catch((err: unknown) => {
    throw new PasskeyError(err instanceof Error ? `Não foi possível confirmar a biometria: ${err.message}` : "Não foi possível confirmar a biometria.");
  });
  if (!result.verified) throw new PasskeyError("A biometria não foi confirmada.");
  const { credential } = result.registrationInfo;
  const repo = getPasskeyRepository();
  if (await repo.get(credential.id)) throw new PasskeyError("Esta biometria já está cadastrada.", 409);
  const record: PasskeyRecord = {
    id: credential.id,
    userId,
    publicKey: Buffer.from(credential.publicKey).toString("base64url"),
    counter: credential.counter,
    transports: credential.transports ?? response.response.transports ?? [],
    deviceName: deviceLabel(req.headers.get("user-agent")),
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  };
  await repo.insert(record);
  return record;
}

/**
 * Desafio de entrada. Com `credentialId` (a biometria cadastrada neste aparelho), a
 * lista traz só ela, como autenticador interno: o navegador pula a escolha de
 * aparelho ou app e abre direto o rosto ou a digital.
 */
export async function authenticationOptions(req: NextRequest, userId: string, credentialId?: string) {
  const { rpID } = relyingParty(req);
  const credentials = await getPasskeyRepository().listByUser(userId);
  if (credentials.length === 0) throw new PasskeyError("Biometria não cadastrada para esta conta. Entre com a senha.", 404);
  const local = credentialId ? credentials.find((c) => c.id === credentialId) : undefined;
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: local ? [{ id: local.id, transports: ["internal"] }] : credentials.map((c) => ({ id: c.id, transports: transports(c.transports) })),
    userVerification: "required",
  });
  return {
    options: { ...options, hints: ["client-device" as const] },
    sealed: sealChallenge({ challenge: options.challenge, purpose: "login", userId }),
  };
}

/** Confere a assinatura do aparelho e devolve o dono da credencial. */
export async function verifyAuthentication(req: NextRequest, sealed: string | undefined, response: AuthenticationResponseJSON): Promise<string> {
  return verifyAssertion(req, openChallenge(sealed, "login"), response);
}

/**
 * Desafio para confirmar uma operação do PRX BANK com a biometria do aparelho,
 * amarrado ao membro e ao pedido. null quando o membro não tem biometria.
 */
export async function transactionOptions(req: NextRequest, userId: string, ref: string) {
  const { rpID } = relyingParty(req);
  const credentials = await getPasskeyRepository().listByUser(userId);
  if (credentials.length === 0) return null;
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: credentials.map((c) => ({ id: c.id, transports: transports(c.transports) })),
    userVerification: "required",
  });
  return {
    options: { ...options, hints: ["client-device" as const] },
    sealed: sealChallenge({ challenge: options.challenge, purpose: "transaction", userId, ref }),
  };
}

/** Confere a biometria da confirmação: mesmo membro, mesma operação, desafio no prazo. */
export async function verifyTransaction(req: NextRequest, sealed: string | undefined, response: AuthenticationResponseJSON, userId: string, ref: string): Promise<void> {
  const claims = openChallenge(sealed, "transaction");
  if (claims.userId !== userId || claims.ref !== ref) throw new PasskeyError("A confirmação pertence a outra operação.", 403);
  await verifyAssertion(req, claims, response);
}

async function verifyAssertion(req: NextRequest, claims: ChallengeClaims, response: AuthenticationResponseJSON): Promise<string> {
  const repo = getPasskeyRepository();
  const credential = await repo.get(response.id);
  if (!credential || credential.userId !== claims.userId) throw new PasskeyError("Biometria não reconhecida para esta conta.", 401);
  const { rpID, origins } = relyingParty(req);
  const result = await verifyAuthenticationResponse({
    response,
    expectedChallenge: claims.challenge,
    expectedOrigin: origins,
    expectedRPID: rpID,
    requireUserVerification: true,
    credential: {
      id: credential.id,
      publicKey: new Uint8Array(Buffer.from(credential.publicKey, "base64url")),
      counter: credential.counter,
      transports: transports(credential.transports),
    },
  }).catch((err: unknown) => {
    throw new PasskeyError(err instanceof Error ? `Biometria não confirmada: ${err.message}` : "Biometria não confirmada.", 401);
  });
  if (!result.verified) throw new PasskeyError("Biometria não confirmada.", 401);
  await repo.touch(credential.id, result.authenticationInfo.newCounter);
  return credential.userId;
}
