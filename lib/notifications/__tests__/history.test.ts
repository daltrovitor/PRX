// Hello World
import { afterEach, describe, expect, it, vi } from "vitest";

/** Tudo o que a fábrica de vi.mock usa precisa nascer junto com ela (vi.mock sobe para o topo do arquivo). */
const mocks = vi.hoisted(() => {
  const state = { mode: "memory" as "memory" | "missing" | "denied" | "rows", rows: [] as Array<Record<string, unknown>> };
  const query = () => ({
    select: () => query(),
    order: () => query(),
    limit: async () => {
      if (state.mode === "missing") return { data: null, error: { code: "PGRST205", message: "Could not find the table 'public.notification_log' in the schema cache" } };
      if (state.mode === "denied") return { data: null, error: { code: "42501", message: "permission denied for table notification_log" } };
      return { data: state.rows, error: null };
    },
  });
  return { state, fakeSupabase: { from: () => query() } };
});

vi.mock("@/lib/supabase/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/supabase/client")>();
  return {
    ...original,
    get supabaseAdmin() {
      return mocks.state.mode === "memory" ? null : mocks.fakeSupabase;
    },
  };
});

import { deliveryHistory, recordDelivery, resetNotificationMemory } from "@/lib/notifications/log";

afterEach(() => {
  mocks.state.mode = "memory";
  mocks.state.rows = [];
  resetNotificationMemory();
  vi.restoreAllMocks();
});

describe("histórico de envios do painel", () => {
  it("em memória (desenvolvimento) lista o que foi registrado e está disponível", async () => {
    await recordDelivery({ userId: "u1", channel: "email", template: "welcome_email", recipient: "g***@exemplo.com", result: { status: "simulated" } });
    const history = await deliveryHistory();
    expect(history.available).toBe(true);
    expect(history.records).toHaveLength(1);
    expect(history.records[0]).toMatchObject({ template: "welcome_email", status: "simulated", recipient: "g***@exemplo.com" });
  });

  it("tabela notification_log ausente: não está disponível, e a lista vazia não prova que nada foi enviado", async () => {
    mocks.state.mode = "missing";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(deliveryHistory()).resolves.toEqual({ records: [], available: false });
    // tabela ausente é esperado (migração pendente): o painel explica, o log do servidor não vira ruído
    expect(warn).not.toHaveBeenCalled();
  });

  it("outro erro de leitura também marca como indisponível e fica no log do servidor", async () => {
    mocks.state.mode = "denied";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(deliveryHistory()).resolves.toEqual({ records: [], available: false });
    expect(warn).toHaveBeenCalledWith("[notifications] falha ao listar envios:", "42501", "permission denied for table notification_log");
  });

  it("com a tabela, devolve as linhas no formato do app", async () => {
    mocks.state.mode = "rows";
    mocks.state.rows = [
      {
        id: "a1",
        user_id: "u1",
        channel: "email",
        template: "welcome_email",
        recipient: "g***@exemplo.com",
        status: "failed",
        provider: "resend",
        provider_id: null,
        error: "403 validation_error The `prx.app.br` domain is not verified.",
        created_at: "2026-10-06T12:00:00Z",
      },
    ];
    const history = await deliveryHistory(10);
    expect(history.available).toBe(true);
    expect(history.records).toEqual([
      {
        id: "a1",
        userId: "u1",
        channel: "email",
        template: "welcome_email",
        recipient: "g***@exemplo.com",
        status: "failed",
        provider: "resend",
        providerId: null,
        error: "403 validation_error The `prx.app.br` domain is not verified.",
        createdAt: "2026-10-06T12:00:00Z",
      },
    ]);
  });
});
