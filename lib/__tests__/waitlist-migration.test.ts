// Hello World
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({ migrated: false, upserts: [] as Row[], selects: [] as string[] }));

// Banco de mentira: sem a migração, qualquer uso de phone/age falha como o PostgREST (PGRST204 / 42703).
vi.mock("@/lib/supabase/client", () => ({
  supabaseAdmin: {
    from: () => ({
      upsert: async (row: Row) => {
        db.upserts.push(row);
        return !db.migrated && "phone" in row ? { error: { code: "PGRST204", message: "sem coluna phone" } } : { error: null };
      },
      select: (columns: string) => ({
        order: () => ({
          limit: async () => {
            db.selects.push(columns);
            if (!db.migrated && columns.includes("phone")) return { data: null, error: { code: "42703", message: "sem coluna phone" } };
            return { data: [{ email: "a@b.com", name: "Ana", source: "em-breve", consent_at: null, created_at: "2026-11-04T12:00:00Z", ...(db.migrated ? { phone: "11912345678", age: 17 } : {}) }], error: null };
          },
        }),
      }),
    }),
  },
}));

import { getWaitlistSignups, joinWaitlist } from "@/lib/waitlist";

const lead = { email: "a@b.com", name: "Ana", phone: "11912345678", age: 17, consent: true as const };

describe("lista de espera antes e depois da migração 20261104", () => {
  beforeEach(() => {
    db.migrated = false;
    db.upserts.length = 0;
    db.selects.length = 0;
  });

  it("sem a migração o lead entra só com e-mail e nome (nada quebra)", async () => {
    await expect(joinWaitlist(lead, "em-breve")).resolves.toBeUndefined();
    expect(db.upserts).toHaveLength(2);
    expect(db.upserts[1]).toEqual({ email: "a@b.com", name: "Ana", source: "em-breve" });
  });

  it("com a migração grava celular e idade na primeira tentativa", async () => {
    db.migrated = true;
    await joinWaitlist(lead, "em-breve");
    expect(db.upserts).toEqual([{ email: "a@b.com", name: "Ana", source: "em-breve", phone: "11912345678", age: 17 }]);
  });

  it("o painel lê com e sem as colunas novas", async () => {
    expect((await getWaitlistSignups())[0]).toMatchObject({ email: "a@b.com", phone: null, age: null });
    expect(db.selects).toHaveLength(2);
    db.migrated = true;
    expect((await getWaitlistSignups())[0]).toMatchObject({ phone: "11912345678", age: 17 });
  });
});
