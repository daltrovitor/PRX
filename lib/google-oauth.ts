// Hello World
import crypto from "crypto";
import { getSessionSecret } from "@/lib/server-secrets";

/*
 * Entrar com o Google direto pelo app (OAuth 2.0 com PKCE), sem a tela do Supabase no meio.
 * O Google mostra o endereço de quem pede o login: com o Supabase era o do projeto
 * (xxxx.supabase.co); agora é o da PRX. Precisa de GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET (o
 * mesmo cliente OAuth que o Supabase usava) e de <endereço do app>/auth/callback nas "URIs de
 * redirecionamento autorizadas" do cliente. Sem as chaves, o app segue com o Supabase.
 * Passo a passo em docs/LOGIN_GOOGLE.md.
 */

export const GOOGLE_OAUTH_COOKIE = "prx_google_oauth";
export const OAUTH_TTL_SECONDS = 10 * 60;

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const TOKEN_TIMEOUT_MS = 10_000;
const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

export class GoogleOAuthError extends Error {}

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
}

/** null quando as chaves do Google não estão no servidor: o app usa o Supabase. */
export function googleOAuthConfig(env: Record<string, string | undefined> = process.env): GoogleOAuthConfig | null {
  const clientId = (env.GOOGLE_CLIENT_ID ?? "").trim();
  const clientSecret = (env.GOOGLE_CLIENT_SECRET ?? "").trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** O que o app guarda (cookie assinado e httpOnly) entre sair para o Google e voltar. */
export interface OAuthTransaction {
  state: string;
  nonce: string;
  verifier: string;
  redirectUri: string;
  exp: number;
}

const base64url = (data: Buffer) => data.toString("base64url");
const sign = (body: string) => crypto.createHmac("sha256", getSessionSecret()).update(body).digest("base64url");

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/** Endereço do app que fez o pedido (o mesmo que precisa estar cadastrado no Google). */
export function requestOrigin(req: { headers: Headers; nextUrl: { host: string; protocol: string } }): string {
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || req.nextUrl.host).split(",")[0].trim().toLowerCase();
  const proto = (req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(":", "")).split(",")[0].trim();
  return `${proto}://${host}`;
}

/** Monta o endereço do Google (com state, nonce e PKCE) e o cookie assinado que guarda o segredo da volta. */
export function beginGoogleOAuth(config: GoogleOAuthConfig, redirectUri: string, now = Date.now()): { url: string; cookie: string } {
  const tx: OAuthTransaction = {
    state: base64url(crypto.randomBytes(24)),
    nonce: base64url(crypto.randomBytes(24)),
    verifier: base64url(crypto.randomBytes(48)),
    redirectUri,
    exp: Math.floor(now / 1000) + OAUTH_TTL_SECONDS,
  };
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: tx.state,
    nonce: tx.nonce,
    code_challenge: base64url(crypto.createHash("sha256").update(tx.verifier).digest()),
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  const body = Buffer.from(JSON.stringify(tx)).toString("base64url");
  return { url: `${AUTHORIZE_URL}?${params.toString()}`, cookie: `${body}.${sign(body)}` };
}

/** Lê o cookie da ida ao Google; null se foi adulterado ou venceu. */
export function readOAuthTransaction(token: string | undefined, now = Date.now()): OAuthTransaction | null {
  try {
    const [body, signature] = (token ?? "").split(".");
    if (!body || !signature || !sameText(signature, sign(body))) return null;
    const tx = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<OAuthTransaction>;
    if (typeof tx.state !== "string" || typeof tx.nonce !== "string" || typeof tx.verifier !== "string" || typeof tx.redirectUri !== "string") return null;
    if (typeof tx.exp !== "number" || tx.exp * 1000 < now) return null;
    return { state: tx.state, nonce: tx.nonce, verifier: tx.verifier, redirectUri: tx.redirectUri, exp: tx.exp };
  } catch {
    return null;
  }
}

/** A volta do Google traz o state que saiu daqui? */
export function stateMatches(tx: OAuthTransaction, state: string | null): boolean {
  return Boolean(state) && sameText(state as string, tx.state);
}

/** Troca o código pelo token de identidade (id_token), direto com o Google e com a chave secreta do app. */
export async function exchangeGoogleCode(config: GoogleOAuthConfig, tx: OAuthTransaction, code: string, fetcher: typeof fetch = fetch): Promise<string> {
  const res = await fetcher(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: tx.redirectUri,
      grant_type: "authorization_code",
      code_verifier: tx.verifier,
    }),
    signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => ({}))) as { id_token?: unknown; error?: unknown };
  if (!res.ok || typeof json.id_token !== "string") throw new GoogleOAuthError(`O Google recusou o código (${String(json.error ?? res.status)}).`);
  return json.id_token;
}

export interface GoogleIdentity {
  email: string;
  name: string;
  picture: string;
}

/**
 * Confere o token de identidade e devolve quem entrou. O token chegou direto do Google, por TLS,
 * em troca do código e da chave secreta do app (OpenID Connect Core 3.1.3.7): não precisa conferir
 * a assinatura, só o emissor, o destinatário, a validade, o nonce e o e-mail verificado.
 */
export function googleIdentity(idToken: string, config: GoogleOAuthConfig, tx: OAuthTransaction, now = Date.now()): GoogleIdentity {
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new GoogleOAuthError("Token do Google ilegível.");
  }
  const audience = claims.aud;
  const audienceOk = audience === config.clientId || (Array.isArray(audience) && audience.includes(config.clientId));
  if (!ISSUERS.has(String(claims.iss))) throw new GoogleOAuthError("Token de outro emissor.");
  if (!audienceOk) throw new GoogleOAuthError("Token de outro aplicativo.");
  if (typeof claims.exp !== "number" || claims.exp * 1000 < now) throw new GoogleOAuthError("Token vencido.");
  if (typeof claims.nonce !== "string" || !sameText(claims.nonce, tx.nonce)) throw new GoogleOAuthError("Token de outra tentativa de login.");
  if (claims.email_verified !== true && claims.email_verified !== "true") throw new GoogleOAuthError("E-mail do Google não verificado.");
  const email = String(claims.email ?? "").toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new GoogleOAuthError("O Google não informou o e-mail.");
  return { email, name: String(claims.name ?? "").trim(), picture: String(claims.picture ?? "") };
}
