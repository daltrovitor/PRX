// Hello World
/**
 * PostgREST de mentira para testar os repositórios Supabase sem rede. Faz o que
 * importa para os erros de migração: RECUSA coluna que não existe na tabela
 * (PGRST204 na escrita, 42703 na leitura), como o banco de verdade. Aceita só o
 * que os repositórios usam: select/insert/update/eq/in/order/limit e os
 * terminadores single/maybeSingle (ou await direto). `coluna->>chave` filtra
 * dentro de um jsonb.
 *
 * Uso (o mock precisa ficar no arquivo de teste, o banco vem do vi.hoisted):
 *   const db = vi.hoisted(() => ({ tables: {}, columns: {}, seq: 0 }));
 *   vi.mock("@/lib/supabase/client", async () => ({ supabaseAdmin: (await import("@/lib/__tests__/fake-postgrest")).fakeSupabase(db) }));
 */

export type Row = Record<string, unknown>;

export interface FakeDb {
  tables: Record<string, Row[]>;
  /** Colunas que EXISTEM em cada tabela; tabela fora daqui = não existe (42P01). */
  columns: Record<string, Set<string>>;
  seq: number;
}

function pathValue(row: Row, column: string): unknown {
  const [base, key] = column.split("->>");
  const value = row[base];
  return key === undefined ? value : (value as Row | null | undefined)?.[key];
}

export function fakeSupabase(db: FakeDb) {
  function from(table: string) {
    const rows = (db.tables[table] ??= []);
    const state = {
      op: "select" as "select" | "insert" | "update",
      payload: null as Row | null,
      probe: null as string | null,
      mode: "many" as "many" | "single" | "maybe",
      filters: [] as Array<(r: Row) => boolean>,
    };

    const finish = (data: Row[]) => {
      if (state.mode === "single") return data.length ? { data: data[0], error: null } : { data: null, error: { code: "PGRST116", message: "sem linhas" } };
      if (state.mode === "maybe") return { data: data[0] ?? null, error: null };
      return { data, error: null };
    };

    const run = () => {
      const known = db.columns[table];
      if (!known) return { data: null, error: { code: "42P01", message: `tabela ${table} não existe` } };
      if (state.op === "select") {
        if (state.probe && !known.has(state.probe)) return { data: null, error: { code: "42703", message: `coluna ${state.probe} não existe` } };
        return finish(rows.filter((r) => state.filters.every((f) => f(r))));
      }
      const payload = state.payload as Row;
      const unknown = Object.keys(payload).find((key) => !known.has(key));
      if (unknown) return { data: null, error: { code: "PGRST204", message: `Could not find the '${unknown}' column of '${table}' in the schema cache` } };
      if (state.op === "insert") {
        // id em formato de uuid (os repositórios descartam id que não é uuid).
        const row: Row = { id: `00000000-0000-4000-8000-${String(++db.seq).padStart(12, "0")}`, ...payload };
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

  return { from };
}
