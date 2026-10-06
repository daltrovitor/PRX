// Hello World
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GOOGLE_OAUTH_COOKIE, readOAuthTransaction } from "@/lib/google-oauth";

const mocks = vi.hoisted(() => ({ live: { value: true } }));

vi.mock("@/lib/supabase/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/supabase/client")>();
  return {
    ...original,
    get supabaseAdmin() {
      return mocks.live.value ? ({} as NonNullable<typeof original.supabaseAdmin>) : null;
    },
  };
});

import { POST } from "@/app/api/auth/google/start/route";

const start = (headers: Record<string, string> = { host: "teste.prx.app.br", "x-forwarded-proto": "https" }, origin = "https://teste.prx.app.br") =>
  POST(new NextRequest(`${origin}/api/auth/google/start`, { method: "POST", headers }));

afterEach(() => {
  vi.unstubAllEnvs();
  mocks.live.value = true;
});

describe("início do login com o Google pelo app", () => {
  it("sem as chaves do Google o app segue com o Supabase", async () => {
    const response = await start();
    expect(await response.json()).toEqual({ direct: false });
    expect(response.cookies.get(GOOGLE_OAUTH_COOKIE)).toBeUndefined();
  });

  it("sem banco de verdade (desenvolvimento local) também segue o caminho antigo", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "cliente");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "segredo");
    mocks.live.value = false;
    expect(await (await start()).json()).toEqual({ direct: false });
  });

  it("com as chaves devolve o endereço do Google já com o redirect do próprio app e o cookie assinado", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "cliente-123.apps.googleusercontent.com");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "segredo");
    const response = await start();
    const json = (await response.json()) as { direct: boolean; url: string };

    expect(json.direct).toBe(true);
    const url = new URL(json.url);
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("redirect_uri")).toBe("https://teste.prx.app.br/auth/callback");

    const cookie = response.cookies.get(GOOGLE_OAUTH_COOKIE);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("lax");
    expect(cookie?.maxAge).toBe(600);
    const tx = readOAuthTransaction(cookie?.value);
    expect(tx?.state).toBe(url.searchParams.get("state"));
    expect(tx?.redirectUri).toBe("https://teste.prx.app.br/auth/callback");
    // a chave secreta nunca sai do servidor
    expect(JSON.stringify(json)).not.toContain("segredo");
  });

  it("no desenvolvimento local o redirect volta para o localhost", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "cliente");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "segredo");
    const response = await start({ host: "localhost:3100" }, "http://localhost:3100");
    const json = (await response.json()) as { url: string };
    expect(new URL(json.url).searchParams.get("redirect_uri")).toBe("http://localhost:3100/auth/callback");
  });
});
