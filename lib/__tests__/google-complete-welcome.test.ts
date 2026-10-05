// Hello World
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PENDING_GOOGLE_COOKIE, createPendingGoogleToken } from "@/lib/google-pending";

/** Tudo o que as fábricas de vi.mock usam precisa nascer junto com elas (vi.mock sobe para o topo do arquivo). */
const mocks = vi.hoisted(() => {
  const state = { profile: null as Record<string, unknown> | null };

  /** Consulta de mentira só com o que a rota usa. Quem decide a resposta é o último passo (maybeSingle). */
  function query(ops: string[] = [], filters: Record<string, unknown> = {}) {
    return {
      select: () => query([...ops, "select"], filters),
      update: () => query([...ops, "update"], filters),
      insert: () => query([...ops, "insert"], filters),
      eq: (column: string, value: unknown) => query(ops, { ...filters, [column]: value }),
      maybeSingle: async () => {
        // Gravação do perfil (atualiza o vazio ou insere): devolve a linha pronta.
        if (ops.includes("update") || ops.includes("insert")) {
          return { data: { full_name: "Gabi Teste", nxt_score: 300, nxt_level: 1, avatar_url: "", wallet_balance: 0, created_at: "2026-10-05T12:00:00Z" }, error: null };
        }
        // CPF livre.
        if ("cpf" in filters) return { data: null, error: null };
        // Perfil do acesso: o que o banco já tem.
        return { data: state.profile, error: null };
      },
    };
  }

  return {
    state,
    tasks: [] as Promise<unknown>[],
    sendWelcomeEmail: vi.fn(async () => ({ status: "sent" as const, provider: "resend" as const, providerId: "re_teste" })),
    getCurrentUser: vi.fn(async (): Promise<unknown> => null),
    fakeSupabase: {
      from: () => query(),
      auth: {
        admin: {
          createUser: async () => ({ data: { user: { id: "acesso-novo" } }, error: null }),
          deleteUser: async () => ({ error: null }),
        },
      },
    },
  };
});

vi.mock("@/lib/supabase/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/supabase/client")>()), supabaseAdmin: mocks.fakeSupabase }));
vi.mock("@/lib/legal", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/legal")>()), recordConsent: vi.fn(async () => undefined) }));
vi.mock("@/lib/notifications/welcome", () => ({ sendWelcomeEmail: mocks.sendWelcomeEmail }));
vi.mock("@/lib/auth", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/auth")>()), getCurrentUser: mocks.getCurrentUser }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => void mocks.tasks.push(Promise.resolve().then(task)),
}));

import { POST } from "@/app/api/auth/google/complete/route";

const EMAIL = "gabi@gmail.com";

function complete(cookieToken?: string) {
  return new NextRequest("https://teste.prx.app.br/api/auth/google/complete", {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookieToken ? { cookie: `${PENDING_GOOGLE_COOKIE}=${cookieToken}` } : {}) },
    body: JSON.stringify({ cpf: "52998224725", phone: "11988887777", birthDate: "2000-01-01", termsAccepted: true }),
  });
}

async function run(request: NextRequest) {
  const response = await POST(request);
  await Promise.all(mocks.tasks);
  return response;
}

beforeEach(() => {
  mocks.tasks.length = 0;
  mocks.sendWelcomeEmail.mockClear();
  mocks.getCurrentUser.mockReset();
  mocks.getCurrentUser.mockResolvedValue(null);
  mocks.state.profile = null;
});

describe("e-mail de boas-vindas no cadastro pelo Google", () => {
  it("cadastro novo: o gatilho do banco já criou o perfil vazio e mesmo assim o e-mail sai", async () => {
    // handle_new_user cria o perfil na hora em que o Google cria o acesso: sem CPF, celular nem aceite.
    mocks.state.profile = { id: "acesso-do-google", cpf: null, phone: null, terms_accepted_at: null, role: "user" };
    const token = createPendingGoogleToken({ authUserId: "acesso-do-google", welcome: true, email: EMAIL, fullName: "Gabi Teste" });

    const response = await run(complete(token));

    expect(response.status).toBe(200);
    expect(mocks.sendWelcomeEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendWelcomeEmail).toHaveBeenCalledWith({ id: "acesso-do-google", email: EMAIL, fullName: "Gabi Teste" });
  });

  it("acesso criado pela própria conclusão (sem perfil anterior): o e-mail sai", async () => {
    const token = createPendingGoogleToken({ email: EMAIL, fullName: "Gabi Teste" });

    const response = await run(complete(token));

    expect(response.status).toBe(200);
    expect(mocks.sendWelcomeEmail).toHaveBeenCalledWith({ id: "acesso-novo", email: EMAIL, fullName: "Gabi Teste" });
  });

  it("token de antes da correção (sem o aviso) e com perfil existente segue sem e-mail", async () => {
    mocks.state.profile = { id: "acesso-antigo", cpf: null, phone: null, terms_accepted_at: null, role: "user" };
    const token = createPendingGoogleToken({ authUserId: "acesso-antigo", email: EMAIL, fullName: "Gabi Teste" });

    const response = await run(complete(token));

    expect(response.status).toBe(200);
    expect(mocks.sendWelcomeEmail).not.toHaveBeenCalled();
  });

  it("membro antigo logado que só completa CPF e celular não recebe boas-vindas de novo", async () => {
    mocks.state.profile = { id: "membro-antigo", cpf: null, phone: null, terms_accepted_at: "2026-09-01T12:00:00Z", role: "user" };
    mocks.getCurrentUser.mockResolvedValue({ id: "membro-antigo", email: EMAIL, fullName: "Gabi Antiga", role: "user", avatarUrl: "" });

    const response = await run(complete());

    expect(response.status).toBe(200);
    expect(mocks.sendWelcomeEmail).not.toHaveBeenCalled();
  });

  it("menor de 12 anos não conclui o cadastro e não recebe e-mail", async () => {
    const token = createPendingGoogleToken({ authUserId: "acesso-do-google", welcome: true, email: EMAIL, fullName: "Gabi Teste" });
    const request = new NextRequest("https://teste.prx.app.br/api/auth/google/complete", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `${PENDING_GOOGLE_COOKIE}=${token}` },
      body: JSON.stringify({ cpf: "52998224725", phone: "11988887777", birthDate: "2999-01-01", termsAccepted: true }),
    });

    const response = await run(request);

    expect(response.status).toBe(400);
    expect(mocks.sendWelcomeEmail).not.toHaveBeenCalled();
  });
});
