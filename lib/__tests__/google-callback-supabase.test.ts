// Hello World
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_COOKIE_NAME } from "@/lib/auth";
import { PENDING_GOOGLE_COOKIE, verifyPendingGoogleToken } from "@/lib/google-pending";

/** Tudo o que as fábricas de vi.mock usam precisa nascer junto com elas (vi.mock sobe para o topo do arquivo). */
const mocks = vi.hoisted(() => {
  const state = {
    authUser: null as Record<string, unknown> | null,
    profile: null as Record<string, unknown> | null,
    deleteUserError: null as { message: string } | null,
  };
  const deleteUser = vi.fn(async () => ({ data: null, error: state.deleteUserError }));

  function query() {
    const builder = { select: () => builder, eq: () => builder, update: () => builder, maybeSingle: async () => ({ data: state.profile, error: null }) };
    return builder;
  }

  return {
    state,
    deleteUser,
    fakeSupabase: { from: () => query(), auth: { admin: { deleteUser } } },
    cookieStore: { getAll: () => [] as Array<{ name: string }>, get: () => undefined, set: () => undefined },
  };
});

vi.mock("@/lib/supabase/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/supabase/client")>()), supabaseAdmin: mocks.fakeSupabase }));
vi.mock("next/headers", () => ({ cookies: async () => mocks.cookieStore }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { exchangeCodeForSession: async () => ({ data: { user: mocks.state.authUser }, error: null }) } }),
}));

import { GET } from "@/app/auth/callback/route";

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const googleUser = (createdMinutesAgo: number) => ({
  id: "acesso-google",
  email: "Gabi@Gmail.com",
  created_at: minutesAgo(createdMinutesAgo),
  identities: [{ provider: "google" }],
  user_metadata: { full_name: "Gabi Teste", avatar_url: "https://lh3.googleusercontent.com/a/foto" },
});

async function comeBack() {
  const response = await GET(new NextRequest("https://teste.prx.app.br/auth/callback?code=codigo-do-supabase"));
  const pending = verifyPendingGoogleToken(response.cookies.get(PENDING_GOOGLE_COOKIE)?.value ?? "");
  return { response, pending };
}

beforeEach(() => {
  mocks.deleteUser.mockClear();
  mocks.state.authUser = googleUser(0);
  mocks.state.profile = null;
  mocks.state.deleteUserError = null;
});

describe("callback do Supabase (login com o Google sem as chaves diretas)", () => {
  it("acesso criado agora pelo Google, com o perfil vazio do gatilho: desfaz o acesso, nada fica gravado", async () => {
    mocks.state.profile = { id: "acesso-google", role: "user", cpf: null, phone: null, terms_accepted_at: null };
    const { response, pending } = await comeBack();

    expect(mocks.deleteUser).toHaveBeenCalledWith("acesso-google");
    expect(pending).toMatchObject({ email: "gabi@gmail.com", fullName: "Gabi Teste", welcome: true });
    expect(pending?.authUserId).toBeUndefined();
    expect(response.cookies.get(AUTH_COOKIE_NAME)?.value).toBeFalsy();
  });

  it("sem perfil nenhum (sem o gatilho) o comportamento é o mesmo", async () => {
    const { pending } = await comeBack();
    expect(mocks.deleteUser).toHaveBeenCalledTimes(1);
    expect(pending).toMatchObject({ welcome: true });
    expect(pending?.authUserId).toBeUndefined();
  });

  it("se o acesso não puder ser desfeito, o cadastro pendente segue ligado a ele (a conclusão não tenta recriar)", async () => {
    mocks.state.profile = { id: "acesso-google", role: "user", cpf: null, phone: null, terms_accepted_at: null };
    mocks.state.deleteUserError = { message: "falhou" };
    const { pending } = await comeBack();

    expect(mocks.deleteUser).toHaveBeenCalledTimes(1);
    expect(pending).toMatchObject({ authUserId: "acesso-google", welcome: true });
  });

  it("acesso antigo com perfil vazio (tentativa abandonada de outro dia): não apaga e ainda vale o e-mail de boas-vindas", async () => {
    mocks.state.authUser = googleUser(3 * 24 * 60);
    mocks.state.profile = { id: "acesso-google", role: "user", cpf: null, phone: null, terms_accepted_at: null };
    const { pending } = await comeBack();

    expect(mocks.deleteUser).not.toHaveBeenCalled();
    expect(pending).toMatchObject({ authUserId: "acesso-google", welcome: true });
  });

  it("membro antigo sem CPF e celular: nunca é apagado e não ganha novo e-mail de boas-vindas", async () => {
    mocks.state.authUser = googleUser(60 * 24 * 30);
    mocks.state.profile = { id: "acesso-google", role: "user", cpf: null, phone: null, terms_accepted_at: "2026-09-01T12:00:00Z" };
    const { pending } = await comeBack();

    expect(mocks.deleteUser).not.toHaveBeenCalled();
    expect(pending).toMatchObject({ authUserId: "acesso-google", welcome: false });
  });

  it("membro antigo criado agora há pouco mas com cadastro feito (aceite gravado) também não é apagado", async () => {
    mocks.state.profile = { id: "acesso-google", role: "user", cpf: null, phone: null, terms_accepted_at: "2026-10-05T12:00:00Z" };
    await comeBack();
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });
});
