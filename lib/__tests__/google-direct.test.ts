// Hello World
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_COOKIE_NAME, REMEMBER_SESSION_SECONDS } from "@/lib/auth";
import { CONSENT_COOKIE, TERMS_VERSION } from "@/lib/legal-version";
import { GOOGLE_OAUTH_COOKIE, beginGoogleOAuth } from "@/lib/google-oauth";
import { PENDING_GOOGLE_COOKIE, verifyPendingGoogleToken } from "@/lib/google-pending";

/** Tudo o que as fábricas de vi.mock usam precisa nascer junto com elas (vi.mock sobe para o topo do arquivo). */
const mocks = vi.hoisted(() => {
  const state = { profile: null as Record<string, unknown> | null, updates: [] as Array<Record<string, unknown>> };

  function query(ops: string[] = [], payload: Record<string, unknown> = {}) {
    return {
      select: () => query([...ops, "select"], payload),
      update: (values: Record<string, unknown>) => query([...ops, "update"], values),
      eq: () => query(ops, payload),
      maybeSingle: async () => {
        if (ops.includes("update")) {
          state.updates.push(payload);
          return { data: { ...state.profile, ...payload }, error: null };
        }
        return { data: state.profile, error: null };
      },
    };
  }

  return { state, recordConsent: vi.fn(async () => undefined), fakeSupabase: { from: () => query() } };
});

vi.mock("@/lib/supabase/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/supabase/client")>()), supabaseAdmin: mocks.fakeSupabase }));
vi.mock("@/lib/legal", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/legal")>()), recordConsent: mocks.recordConsent }));

import { handleDirectGoogleCallback } from "@/lib/google-direct";

const CLIENT_ID = "cliente-123.apps.googleusercontent.com";
const REDIRECT = "https://teste.prx.app.br/auth/callback";

const jwt = (claims: Record<string, unknown>) => ["e30", Buffer.from(JSON.stringify(claims)).toString("base64url"), "assinatura"].join(".");

/** Ida ao Google: o cookie assinado e os valores que o Google devolveria. */
function trip() {
  const { url, cookie } = beginGoogleOAuth({ clientId: CLIENT_ID, clientSecret: "segredo" }, REDIRECT);
  const params = new URL(url).searchParams;
  return { cookie, state: params.get("state") as string, nonce: params.get("nonce") as string };
}

const claims = (nonce: string, over: Record<string, unknown> = {}) => ({
  iss: "https://accounts.google.com",
  aud: CLIENT_ID,
  exp: Math.floor(Date.now() / 1000) + 3600,
  nonce,
  email: "gabi@gmail.com",
  email_verified: true,
  name: "Gabi Teste",
  picture: "https://lh3.googleusercontent.com/a/foto",
  ...over,
});

const okFetch = (idToken: string) => vi.fn(async () => new Response(JSON.stringify({ id_token: idToken }), { status: 200 }));

function back(opts: { cookie?: string; state?: string; extra?: string; query?: string } = {}) {
  const cookie = [opts.cookie ? `${GOOGLE_OAUTH_COOKIE}=${opts.cookie}` : "", opts.extra ?? ""].filter(Boolean).join("; ");
  const search = opts.query ?? `code=codigo-1&state=${opts.state ?? ""}`;
  return new NextRequest(`${REDIRECT}?${search}`, { headers: cookie ? { cookie } : {} });
}

const run = (req: NextRequest, fetcher: typeof fetch) => handleDirectGoogleCallback(req, fetcher);

beforeEach(() => {
  vi.stubEnv("GOOGLE_CLIENT_ID", CLIENT_ID);
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "segredo");
  mocks.state.profile = null;
  mocks.state.updates.length = 0;
  mocks.recordConsent.mockClear();
});

describe("volta do login direto com o Google", () => {
  it("sem o cookie da ida não é o login direto: devolve null e o fluxo do Supabase segue", async () => {
    const fetcher = vi.fn();
    expect(await run(back({ query: "code=abc" }), fetcher as unknown as typeof fetch)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("e-mail novo: vira cadastro pendente, sem acesso nem perfil gravados, e o e-mail de boas-vindas vale", async () => {
    const { cookie, state, nonce } = trip();
    const response = await run(back({ cookie, state }), okFetch(jwt(claims(nonce))) as unknown as typeof fetch);

    expect(response?.headers.get("location")).toBe("https://teste.prx.app.br/");
    const pending = verifyPendingGoogleToken(response?.cookies.get(PENDING_GOOGLE_COOKIE)?.value ?? "");
    expect(pending).toMatchObject({ email: "gabi@gmail.com", fullName: "Gabi Teste", avatarUrl: "https://lh3.googleusercontent.com/a/foto", welcome: true });
    expect(pending?.authUserId).toBeUndefined();
    expect(response?.cookies.get(AUTH_COOKIE_NAME)?.value).toBeFalsy();
    expect(response?.cookies.get(GOOGLE_OAUTH_COOKIE)?.value).toBe("");
    expect(mocks.state.updates).toEqual([]);
  });

  it("perfil vazio que o gatilho do banco criou: continua cadastro pendente, ligado a esse acesso", async () => {
    mocks.state.profile = { id: "acesso-1", email: "gabi@gmail.com", role: "user", cpf: null, phone: null, terms_accepted_at: null };
    const { cookie, state, nonce } = trip();
    const response = await run(back({ cookie, state }), okFetch(jwt(claims(nonce))) as unknown as typeof fetch);

    const pending = verifyPendingGoogleToken(response?.cookies.get(PENDING_GOOGLE_COOKIE)?.value ?? "");
    expect(pending).toMatchObject({ authUserId: "acesso-1", welcome: true });
    expect(response?.cookies.get(AUTH_COOKIE_NAME)?.value).toBeFalsy();
  });

  it("membro antigo sem CPF e celular: pendente, sem novo e-mail de boas-vindas", async () => {
    mocks.state.profile = { id: "acesso-2", email: "gabi@gmail.com", role: "user", cpf: null, phone: null, terms_accepted_at: "2026-09-01T12:00:00Z" };
    const { cookie, state, nonce } = trip();
    const response = await run(back({ cookie, state }), okFetch(jwt(claims(nonce))) as unknown as typeof fetch);

    expect(verifyPendingGoogleToken(response?.cookies.get(PENDING_GOOGLE_COOKIE)?.value ?? "")).toMatchObject({ authUserId: "acesso-2", welcome: false });
  });

  it("cadastro completo entra: sessão de 14 dias, foto atualizada e aceite dos Termos gravado", async () => {
    mocks.state.profile = { id: "acesso-3", email: "gabi@gmail.com", role: "user", cpf: "52998224725", phone: "11988887777", full_name: "Gabi Teste", avatar_url: "", nxt_score: 400, nxt_level: 2, wallet_balance: 0 };
    const { cookie, state, nonce } = trip();
    const response = await run(back({ cookie, state, extra: `${CONSENT_COOKIE}=${TERMS_VERSION}` }), okFetch(jwt(claims(nonce))) as unknown as typeof fetch);

    expect(response?.headers.get("location")).toBe("https://teste.prx.app.br/");
    const session = response?.cookies.get(AUTH_COOKIE_NAME);
    expect(session?.value).toBeTruthy();
    expect(session?.httpOnly).toBe(true);
    expect(session?.maxAge).toBe(REMEMBER_SESSION_SECONDS);
    expect(response?.cookies.get("prx_remember")?.value).toBe("1");
    expect(response?.cookies.get(PENDING_GOOGLE_COOKIE)?.value).toBeFalsy();
    expect(mocks.state.updates[0]).toMatchObject({ avatar_url: "https://lh3.googleusercontent.com/a/foto" });
    expect(mocks.recordConsent).toHaveBeenCalledWith("acesso-3");
  });

  it("sem 'lembrar de mim' a sessão não é de 14 dias, e sem o cookie de aceite nada é gravado", async () => {
    mocks.state.profile = { id: "acesso-4", email: "gabi@gmail.com", role: "user", cpf: "52998224725", phone: "11988887777", avatar_url: "https://foto.example/minha.png" };
    const { cookie, state, nonce } = trip();
    const response = await run(back({ cookie, state, extra: "prx_remember_pending=0" }), okFetch(jwt(claims(nonce))) as unknown as typeof fetch);

    expect(response?.cookies.get(AUTH_COOKIE_NAME)?.value).toBeTruthy();
    expect(response?.cookies.get(AUTH_COOKIE_NAME)?.maxAge).toBeUndefined();
    expect(response?.cookies.get("prx_remember")?.value).toBe("0");
    // a foto que a pessoa já tinha não é trocada pela do Google
    expect(mocks.state.updates[0]).not.toHaveProperty("avatar_url");
    expect(mocks.recordConsent).not.toHaveBeenCalled();
  });

  it("conta de equipe (admin, parceiro, staff) entra sem CPF", async () => {
    mocks.state.profile = { id: "acesso-5", email: "gabi@gmail.com", role: "admin", cpf: null, phone: null };
    const { cookie, state, nonce } = trip();
    const response = await run(back({ cookie, state }), okFetch(jwt(claims(nonce))) as unknown as typeof fetch);

    expect(response?.cookies.get(AUTH_COOKIE_NAME)?.value).toBeTruthy();
    expect(response?.cookies.get(PENDING_GOOGLE_COOKIE)?.value).toBeFalsy();
  });

  it("state diferente do que saiu daqui: volta para a página inicial sem falar com o Google", async () => {
    const { cookie, nonce } = trip();
    const fetcher = okFetch(jwt(claims(nonce)));
    const response = await run(back({ cookie, state: "state-de-outra-pessoa" }), fetcher as unknown as typeof fetch);

    expect(response?.headers.get("location")).toBe("https://teste.prx.app.br/");
    expect(fetcher).not.toHaveBeenCalled();
    expect(response?.cookies.get(AUTH_COOKIE_NAME)?.value).toBeFalsy();
    expect(response?.cookies.get(PENDING_GOOGLE_COOKIE)?.value).toBeFalsy();
  });

  it("cookie adulterado, pedido negado no Google ou código ausente: ninguém entra", async () => {
    const { cookie, state, nonce } = trip();
    const fetcher = okFetch(jwt(claims(nonce)));
    for (const req of [back({ cookie: `${cookie}x`, state }), back({ cookie, query: `error=access_denied&state=${state}` }), back({ cookie, query: `state=${state}` })]) {
      const response = await run(req, fetcher as unknown as typeof fetch);
      expect(response?.cookies.get(AUTH_COOKIE_NAME)?.value).toBeFalsy();
      expect(response?.cookies.get(PENDING_GOOGLE_COOKIE)?.value).toBeFalsy();
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("o Google recusa o código, ou o token é de outra tentativa ou de e-mail não verificado: ninguém entra", async () => {
    const { cookie, state, nonce } = trip();
    const recusado = vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }));
    const cases = [recusado, okFetch(jwt(claims("nonce-de-outra-tentativa"))), okFetch(jwt(claims(nonce, { email_verified: false }))), okFetch(jwt(claims(nonce, { aud: "outro-app" })))];
    for (const fetcher of cases) {
      const response = await run(back({ cookie, state }), fetcher as unknown as typeof fetch);
      expect(response?.headers.get("location")).toBe("https://teste.prx.app.br/");
      expect(response?.cookies.get(AUTH_COOKIE_NAME)?.value).toBeFalsy();
      expect(response?.cookies.get(PENDING_GOOGLE_COOKIE)?.value).toBeFalsy();
    }
  });
});
