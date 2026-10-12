// Hello World
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetLaunchSchemaCache } from "@/lib/db-features";
import { getLiveRepository, type NewTicket } from "@/lib/live/repository";
import type { GuardianConsent } from "@/lib/live/types";

/**
 * Repositório do PRX LIVE contra um PostgREST de mentira que, como o de verdade,
 * RECUSA coluna que não existe na tabela. Foi esse o defeito que a liberação do
 * responsável trouxe: gravar guardian_consent sem a migração derrubava toda venda.
 */

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  columns: {} as Record<string, Set<string>>,
  seq: 0,
}));

vi.mock("@/lib/supabase/client", () => {
  const pathValue = (row: Row, column: string): unknown => {
    const [base, key] = column.split("->>");
    const value = row[base];
    return key === undefined ? value : (value as Row | null | undefined)?.[key];
  };

  function from(table: string) {
    const rows = (db.tables[table] ??= []);
    const known = db.columns[table];
    const state = { op: "select" as "select" | "insert" | "update", payload: null as Row | null, probe: null as string | null, mode: "many" as "many" | "single" | "maybe", filters: [] as Array<(r: Row) => boolean> };

    const finish = (data: Row[]) => {
      if (state.mode === "single") return data.length ? { data: data[0], error: null } : { data: null, error: { code: "PGRST116", message: "sem linhas" } };
      if (state.mode === "maybe") return { data: data[0] ?? null, error: null };
      return { data, error: null };
    };

    const run = () => {
      if (!known) return { data: null, error: { code: "42P01", message: `tabela ${table} não existe` } };
      if (state.op === "select") {
        if (state.probe && !known.has(state.probe)) return { data: null, error: { code: "42703", message: `coluna ${state.probe} não existe` } };
        return finish(rows.filter((r) => state.filters.every((f) => f(r))));
      }
      const payload = state.payload as Row;
      const unknown = Object.keys(payload).find((key) => !known.has(key));
      if (unknown) return { data: null, error: { code: "PGRST204", message: `Could not find the '${unknown}' column of '${table}' in the schema cache` } };
      if (state.op === "insert") {
        const row: Row = { id: `row_${++db.seq}`, ...payload };
        rows.push(row);
        return finish([row]);
      }
      const hit = rows.filter((r) => state.filters.every((f) => f(r)));
      for (const row of hit) Object.assign(row, payload);
      return finish(hit);
    };

    const api = {
      select(columns?: string) {
        state.probe = columns && columns !== "*" ? columns : null;
        return api;
      },
      insert(payload: Row) {
        state.op = "insert";
        state.payload = payload;
        return api;
      },
      update(payload: Row) {
        state.op = "update";
        state.payload = payload;
        return api;
      },
      eq(column: string, value: unknown) {
        state.filters.push((r) => pathValue(r, column) === value);
        return api;
      },
      in(column: string, values: unknown[]) {
        state.filters.push((r) => values.includes(pathValue(r, column)));
        return api;
      },
      order: () => api,
      limit: () => api,
      single() {
        state.mode = "single";
        return Promise.resolve(run());
      },
      maybeSingle() {
        state.mode = "maybe";
        return Promise.resolve(run());
      },
      then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
        return Promise.resolve(run()).then(resolve, reject);
      },
    };
    return api;
  }

  return { supabaseAdmin: { from } };
});

const BASE_COLUMNS = [
  "id", "code", "event_id", "batch_id", "batch_name", "user_id", "user_email", "holder_name", "price", "status", "source", "run_details", "issued_by", "note",
  "created_at", "paid_at", "cancelled_at", "checked_in_at", "checked_in_by", "checked_in_by_role", "checked_in_by_name",
];
const LAUNCH_COLUMNS = ["is_test", "original_price", "discount", "promo_code_id"];

/** Banco com a migração do lançamento aplicada; a do responsável (guardian_consent) é opcional. */
function schema({ guardian }: { guardian: boolean }) {
  db.tables = { live_tickets: [], validation_log: [] };
  db.columns = {
    live_tickets: new Set([...BASE_COLUMNS, ...LAUNCH_COLUMNS, ...(guardian ? ["guardian_consent"] : [])]),
    validation_log: new Set(["id"]),
  };
  resetLaunchSchemaCache();
}

let seq = 0;
function newTicket(overrides: Partial<NewTicket> = {}): NewTicket {
  return {
    code: `UP-TEST-${++seq}`,
    eventId: "evt_1",
    batchId: "b1",
    batchName: "Lote",
    userId: "usr_1",
    userEmail: "menor@exemplo.com",
    holderName: "Menor de Teste",
    price: 0,
    status: "valid",
    source: "free",
    runDetails: null,
    issuedBy: null,
    note: "",
    createdAt: "2026-10-12T09:00:00.000Z",
    paidAt: null,
    cancelledAt: null,
    checkedInAt: null,
    checkedInBy: null,
    checkedInByRole: null,
    checkedInByName: null,
    isTest: false,
    originalPrice: null,
    discount: 0,
    promoCodeId: null,
    guardianConsent: null,
    ...overrides,
  };
}

const consent: GuardianConsent = { guardianEmail: "pai@exemplo.com", status: "pending", token: "a1b2c3d4e5f6a7b8a1b2c3d4e5f6a7b8a1b2c3d4e5f6a7b8" };

describe("liberação do responsável sem a migração 20261012", () => {
  beforeEach(() => schema({ guardian: false }));

  it("a venda para maior de idade continua: a coluna vazia é descartada em vez de derrubar o insert", async () => {
    const ticket = await getLiveRepository().insertTicket(newTicket({ guardianConsent: null }));
    expect(ticket.guardianConsent).toBeNull();
    expect(db.tables.live_tickets[0]).not.toHaveProperty("guardian_consent");
  });

  it("ingresso de menor é recusado com o aviso da migração, sem perder a liberação nem gravar pela metade", async () => {
    const repo = getLiveRepository();
    await expect(repo.insertTicket(newTicket({ guardianConsent: consent }))).rejects.toMatchObject({
      status: 503,
      message: expect.stringContaining("20261012_prx_guardian_consent.sql"),
    });
    expect(db.tables.live_tickets).toHaveLength(0);
    await expect(repo.updateGuardianConsent("row_1", consent)).rejects.toMatchObject({ status: 503 });
    expect(await repo.getTicketByGuardianToken(consent.token)).toBeNull();
  });
});

describe("liberação do responsável com a migração aplicada", () => {
  beforeEach(() => schema({ guardian: true }));

  it("grava a liberação na coluna própria, não dentro da nota", async () => {
    const ticket = await getLiveRepository().insertTicket(newTicket({ guardianConsent: consent, note: "obs do admin" }));
    expect(db.tables.live_tickets[0]).toMatchObject({ guardian_consent: consent, note: "obs do admin" });
    expect(ticket.guardianConsent).toEqual(consent);
    expect(ticket.note).toBe("obs do admin");
  });

  it("mexer na nota (confirmar pagamento, cancelar) não apaga a liberação", async () => {
    const repo = getLiveRepository();
    const ticket = await repo.insertTicket(newTicket({ status: "pending_payment", source: "purchase", price: 80, guardianConsent: consent }));
    const paid = await repo.updateTicket(ticket.id, { status: "valid", paidAt: "2026-10-12T10:00:00.000Z", note: "Pago no Pix" }, ["pending_payment"]);
    expect(paid).toMatchObject({ status: "valid", note: "Pago no Pix", guardianConsent: consent });
    const cancelled = await repo.updateTicket(ticket.id, { status: "cancelled", note: "Cancelado pelo membro." }, ["valid"]);
    expect(cancelled?.guardianConsent).toEqual(consent);
  });

  it("acha o ingresso pelo token do link e só a primeira resposta grava", async () => {
    const repo = getLiveRepository();
    const ticket = await repo.insertTicket(newTicket({ guardianConsent: consent }));
    expect((await repo.getTicketByGuardianToken(consent.token))?.id).toBe(ticket.id);
    expect(await repo.getTicketByGuardianToken("token-que-nao-existe")).toBeNull();

    const approved: GuardianConsent = { ...consent, status: "approved", guardianName: "Fulano de Tal", respondedAt: "2026-10-12T11:00:00.000Z" };
    expect((await repo.updateGuardianConsent(ticket.id, approved))?.guardianConsent).toEqual(approved);
    // Segunda resposta (outra aba, outro clique): não sobrescreve a primeira.
    expect(await repo.updateGuardianConsent(ticket.id, { ...consent, status: "rejected" })).toBeNull();
    expect((await repo.getTicket(ticket.id))?.guardianConsent?.status).toBe("approved");
  });
});
