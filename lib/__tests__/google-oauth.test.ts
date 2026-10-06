// Hello World
import crypto from "crypto";
import { describe, expect, it, vi } from "vitest";
import {
  GoogleOAuthError,
  beginGoogleOAuth,
  exchangeGoogleCode,
  googleIdentity,
  googleOAuthConfig,
  readOAuthTransaction,
  requestOrigin,
  stateMatches,
  type OAuthTransaction,
} from "@/lib/google-oauth";

const CONFIG = { clientId: "cliente-123.apps.googleusercontent.com", clientSecret: "segredo-de-teste" };
const REDIRECT = "https://teste.prx.app.br/auth/callback";

const jwt = (claims: Record<string, unknown>) => ["e30", Buffer.from(JSON.stringify(claims)).toString("base64url"), "assinatura"].join(".");

function begin() {
  const { url, cookie } = beginGoogleOAuth(CONFIG, REDIRECT);
  const tx = readOAuthTransaction(cookie) as OAuthTransaction;
  return { url: new URL(url), cookie, tx };
}

const goodClaims = (tx: OAuthTransaction, over: Record<string, unknown> = {}) => ({
  iss: "https://accounts.google.com",
  aud: CONFIG.clientId,
  exp: Math.floor(Date.now() / 1000) + 3600,
  nonce: tx.nonce,
  email: "Gabi@Gmail.com",
  email_verified: true,
  name: "Gabi Teste",
  picture: "https://lh3.googleusercontent.com/a/foto",
  ...over,
});

describe("login com o Google direto pelo app", () => {
  it("só liga com as duas chaves; sem elas o app segue com o Supabase", () => {
    expect(googleOAuthConfig({})).toBeNull();
    expect(googleOAuthConfig({ GOOGLE_CLIENT_ID: "a" })).toBeNull();
    expect(googleOAuthConfig({ GOOGLE_CLIENT_SECRET: "b" })).toBeNull();
    expect(googleOAuthConfig({ GOOGLE_CLIENT_ID: "  a ", GOOGLE_CLIENT_SECRET: " b  " })).toEqual({ clientId: "a", clientSecret: "b" });
  });

  it("o endereço do Google leva o redirect do PRX, state, nonce e o desafio PKCE", () => {
    const { url, tx } = begin();
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe(CONFIG.clientId);
    expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("state")).toBe(tx.state);
    expect(url.searchParams.get("nonce")).toBe(tx.nonce);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(crypto.createHash("sha256").update(tx.verifier).digest("base64url"));
    // o segredo (verifier) nunca vai na URL
    expect(url.toString()).not.toContain(tx.verifier);
    expect(url.toString()).not.toContain(CONFIG.clientSecret);
  });

  it("cada tentativa tem state, nonce e verifier próprios", () => {
    const a = begin().tx;
    const b = begin().tx;
    expect(new Set([a.state, b.state, a.nonce, b.nonce, a.verifier, b.verifier]).size).toBe(6);
    expect(a.verifier.length).toBeGreaterThanOrEqual(43);
  });

  it("o cookie da ida só vale inteiro e dentro do prazo", () => {
    const { cookie } = begin();
    expect(readOAuthTransaction(cookie)).not.toBeNull();
    expect(readOAuthTransaction(undefined)).toBeNull();
    expect(readOAuthTransaction("lixo")).toBeNull();
    const [body] = cookie.split(".");
    expect(readOAuthTransaction(`${body}.assinatura-falsa`)).toBeNull();
    // corpo trocado com a assinatura antiga
    const forged = Buffer.from(JSON.stringify({ state: "x", nonce: "y", verifier: "z", redirectUri: "https://evil.example/cb", exp: 9_999_999_999 })).toString("base64url");
    expect(readOAuthTransaction(`${forged}.${cookie.split(".")[1]}`)).toBeNull();
    // 11 minutos depois já venceu
    expect(readOAuthTransaction(cookie, Date.now() + 11 * 60_000)).toBeNull();
  });

  it("o state da volta precisa ser o que saiu daqui", () => {
    const { tx } = begin();
    expect(stateMatches(tx, tx.state)).toBe(true);
    expect(stateMatches(tx, "outro")).toBe(false);
    expect(stateMatches(tx, null)).toBe(false);
    expect(stateMatches(tx, "")).toBe(false);
  });

  it("troca o código pelo token com a chave secreta e o verifier, direto com o Google", async () => {
    const { tx } = begin();
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ id_token: "token-do-google" }), { status: 200 }));
    await expect(exchangeGoogleCode(CONFIG, tx, "codigo-1", fetcher as unknown as typeof fetch)).resolves.toBe("token-do-google");
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect(init.method).toBe("POST");
    const body = new URLSearchParams(String(init.body));
    expect(Object.fromEntries(body)).toEqual({
      code: "codigo-1",
      client_id: CONFIG.clientId,
      client_secret: CONFIG.clientSecret,
      redirect_uri: REDIRECT,
      grant_type: "authorization_code",
      code_verifier: tx.verifier,
    });
  });

  it("recusa quando o Google responde erro ou não manda o token de identidade", async () => {
    const { tx } = begin();
    const denied = vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }));
    await expect(exchangeGoogleCode(CONFIG, tx, "x", denied as unknown as typeof fetch)).rejects.toThrow(GoogleOAuthError);
    const semToken = vi.fn(async () => new Response(JSON.stringify({ access_token: "a" }), { status: 200 }));
    await expect(exchangeGoogleCode(CONFIG, tx, "x", semToken as unknown as typeof fetch)).rejects.toThrow(/recusou/);
  });

  it("devolve quem entrou: e-mail em minúsculas, nome e foto", () => {
    const { tx } = begin();
    expect(googleIdentity(jwt(goodClaims(tx)), CONFIG, tx)).toEqual({ email: "gabi@gmail.com", name: "Gabi Teste", picture: "https://lh3.googleusercontent.com/a/foto" });
    // aceita o emissor sem https e o aud como lista
    expect(googleIdentity(jwt(goodClaims(tx, { iss: "accounts.google.com", aud: ["outro", CONFIG.clientId] })), CONFIG, tx).email).toBe("gabi@gmail.com");
  });

  it("não aceita token de outro emissor, outro aplicativo, vencido, de outra tentativa ou sem e-mail verificado", () => {
    const { tx } = begin();
    const recusa = (over: Record<string, unknown>) => () => googleIdentity(jwt(goodClaims(tx, over)), CONFIG, tx);
    expect(recusa({ iss: "https://evil.example" })).toThrow(/emissor/);
    expect(recusa({ aud: "outro-app.apps.googleusercontent.com" })).toThrow(/outro aplicativo/);
    expect(recusa({ exp: Math.floor(Date.now() / 1000) - 10 })).toThrow(/vencido/);
    expect(recusa({ nonce: "de-outra-tentativa" })).toThrow(/outra tentativa/);
    expect(recusa({ nonce: undefined })).toThrow(/outra tentativa/);
    expect(recusa({ email_verified: false })).toThrow(/verificado/);
    expect(recusa({ email: "" })).toThrow(/e-mail/);
    expect(recusa({ email: "sem-arroba" })).toThrow(/e-mail/);
    expect(() => googleIdentity("isso-nao-e-um-jwt", CONFIG, tx)).toThrow(GoogleOAuthError);
  });

  it("descobre o endereço do app pelo host encaminhado pela hospedagem", () => {
    const req = (headers: Record<string, string>, host = "interno.vercel.app", protocol = "https:") => ({ headers: new Headers(headers), nextUrl: { host, protocol } });
    expect(requestOrigin(req({ "x-forwarded-host": "teste.prx.app.br", "x-forwarded-proto": "https" }))).toBe("https://teste.prx.app.br");
    expect(requestOrigin(req({ host: "teste.prx.app.br", "x-forwarded-proto": "https" }))).toBe("https://teste.prx.app.br");
    expect(requestOrigin(req({}, "localhost:3100", "http:"))).toBe("http://localhost:3100");
  });
});
