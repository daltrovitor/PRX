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

const db = vi.hoisted(() => ({ tables: {} as Record<string, Record<string, unknown>[]>, columns: {} as Record<string, Set<string>>, seq: 0 }));

vi.mock("@/lib/supabase/client", async () => ({ supabaseAdmin: (await import("@/lib/__tests__/fake-postgrest")).fakeSupabase(db) }));

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
    await expect(repo.updateGuardianConsent("00000000-0000-4000-8000-000000000001", consent)).rejects.toMatchObject({ status: 503 });
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
