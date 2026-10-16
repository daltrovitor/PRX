// Hello World
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/client";
import { PartnerError, dbError } from "@/lib/partners/errors";
import { requireTable } from "@/lib/db-features";
import { RAFFLES_MIGRATION, type Raffle, type RaffleEntry, type RaffleEvent } from "@/lib/raffles/types";

/** Persistência dos sorteios. Uma participação por vaga (raffle, pessoa, slot): o limite por pessoa vale mesmo com cliques simultâneos. */

type Row = Record<string, unknown>;
const snake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const camel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
function toRow(data: Row): Row {
  const row: Row = {};
  for (const [k, v] of Object.entries(data)) if (v !== undefined && k !== "id" && k !== "createdAt" && k !== "updatedAt") row[snake(k)] = v;
  return row;
}
function fromRow<T>(row: Row): T {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) out[camel(k)] = k === "prize_value" && v !== null ? Number(v) : k === "authorization_valid_until" && v ? String(v).slice(0, 10) : v;
  return out as T;
}

export type RafflePatch = Partial<Omit<Raffle, "id" | "createdAt" | "updatedAt">>;

export interface RafflesRepository {
  list(filter: { statuses?: string[]; offset: number; limit: number }): Promise<{ items: Raffle[]; total: number }>;
  get(id: string): Promise<Raffle | null>;
  insert(data: Omit<Raffle, "id" | "createdAt" | "updatedAt">, actor: string): Promise<Raffle>;
  /** `onlyStatus`: só atualiza se o sorteio ainda está nesse status (transições sem corrida). */
  update(id: string, patch: RafflePatch, onlyStatus?: string): Promise<Raffle | null>;
  remove(id: string): Promise<void>;

  insertEntry(e: Pick<RaffleEntry, "raffleId" | "userId" | "slot">): Promise<RaffleEntry>;
  entriesOf(raffleId: string, userId: string): Promise<RaffleEntry[]>;
  allEntries(raffleId: string): Promise<RaffleEntry[]>;
  setEntryNumbers(raffleId: string, numbers: Array<{ id: string; entryNumber: number }>): Promise<void>;
  countEntries(raffleId: string): Promise<number>;
  myEntryCounts(userId: string): Promise<Map<string, number>>;

  insertEvent(e: Omit<RaffleEvent, "id" | "createdAt">): Promise<void>;
  events(raffleId: string): Promise<RaffleEvent[]>;
}

const need = () => requireTable("raffles", RAFFLES_MIGRATION);
const now = () => new Date().toISOString();

function supabaseRepo(): RafflesRepository {
  const db = supabaseAdmin!;
  const fail = (error: { message: string; code?: string } | null, what: string) => {
    if (error) throw dbError(error, what);
  };
  return {
    async list({ statuses, offset, limit }) {
      await need();
      let q = db.from("raffles").select("*", { count: "exact" }).order("ends_at", { ascending: false }).range(offset, offset + limit - 1);
      if (statuses?.length) q = q.in("status", statuses);
      const { data, error, count } = await q;
      fail(error, "Não foi possível listar os sorteios");
      return { items: ((data ?? []) as Row[]).map((r) => fromRow<Raffle>(r)), total: count ?? 0 };
    },
    async get(id) {
      await need();
      const { data, error } = await db.from("raffles").select("*").eq("id", id).maybeSingle();
      if (error?.code === "22P02") return null;
      fail(error, "Não foi possível ler o sorteio");
      return data ? fromRow<Raffle>(data as Row) : null;
    },
    async insert(data, actor) {
      await need();
      const { data: row, error } = await db.from("raffles").insert({ ...toRow(data as unknown as Row), created_by: actor }).select("*").single();
      fail(error, "Não foi possível salvar o sorteio");
      return fromRow<Raffle>(row as Row);
    },
    async update(id, patch, onlyStatus) {
      await need();
      let q = db.from("raffles").update({ ...toRow(patch as Row), updated_at: now() }).eq("id", id);
      if (onlyStatus) q = q.eq("status", onlyStatus);
      const { data, error } = await q.select("*").maybeSingle();
      fail(error, "Não foi possível salvar o sorteio");
      return data ? fromRow<Raffle>(data as Row) : null;
    },
    async remove(id) {
      await need();
      const { error } = await db.from("raffles").delete().eq("id", id).eq("status", "draft");
      fail(error, "Não foi possível excluir o sorteio");
    },
    async insertEntry(e) {
      await need();
      const { data, error } = await db.from("raffle_entries").insert({ raffle_id: e.raffleId, user_id: e.userId, slot: e.slot }).select("*").single();
      if (error?.code === "23505") throw new PartnerError("Sua participação já foi registrada.", 409);
      fail(error, "Não foi possível registrar a participação");
      return fromRow<RaffleEntry>(data as Row);
    },
    async entriesOf(raffleId, userId) {
      await need();
      const { data, error } = await db.from("raffle_entries").select("*").eq("raffle_id", raffleId).eq("user_id", userId).order("slot");
      fail(error, "Não foi possível ler as participações");
      return ((data ?? []) as Row[]).map((r) => fromRow<RaffleEntry>(r));
    },
    async allEntries(raffleId) {
      await need();
      const out: RaffleEntry[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await db.from("raffle_entries").select("*").eq("raffle_id", raffleId).order("created_at").order("id").range(from, from + 999);
        fail(error, "Não foi possível ler as participações");
        const rows = ((data ?? []) as Row[]).map((r) => fromRow<RaffleEntry>(r));
        out.push(...rows);
        if (rows.length < 1000) break;
      }
      return out;
    },
    async setEntryNumbers(raffleId, numbers) {
      await need();
      for (const n of numbers) {
        const { error } = await db.from("raffle_entries").update({ entry_number: n.entryNumber }).eq("id", n.id).eq("raffle_id", raffleId);
        fail(error, "Não foi possível numerar as participações");
      }
    },
    async countEntries(raffleId) {
      await need();
      const { count, error } = await db.from("raffle_entries").select("id", { count: "exact", head: true }).eq("raffle_id", raffleId);
      fail(error, "Não foi possível contar as participações");
      return count ?? 0;
    },
    async myEntryCounts(userId) {
      await need();
      const { data, error } = await db.from("raffle_entries").select("raffle_id").eq("user_id", userId).limit(2000);
      fail(error, "Não foi possível ler suas participações");
      const map = new Map<string, number>();
      for (const r of (data ?? []) as Array<{ raffle_id: string }>) map.set(r.raffle_id, (map.get(r.raffle_id) ?? 0) + 1);
      return map;
    },
    async insertEvent(e) {
      const { error } = await db.from("raffle_events").insert({ raffle_id: e.raffleId, actor: e.actor, action: e.action, detail: e.detail.slice(0, 1000) });
      if (error) console.warn("[sorteios] histórico não registrado:", error.message);
    },
    async events(raffleId) {
      await need();
      const { data, error } = await db.from("raffle_events").select("*").eq("raffle_id", raffleId).order("created_at", { ascending: false }).limit(200);
      fail(error, "Não foi possível ler o histórico");
      return ((data ?? []) as Row[]).map((r) => fromRow<RaffleEvent>(r));
    },
  };
}

interface MemoryState {
  raffles: Raffle[];
  entries: RaffleEntry[];
  events: RaffleEvent[];
}
const state = (): MemoryState => ((globalThis as unknown as { __prxRaffles?: MemoryState }).__prxRaffles ??= { raffles: [], entries: [], events: [] });
const clone = <T>(v: T): T => structuredClone(v);

const memoryRepo: RafflesRepository = {
  async list({ statuses, offset, limit }) {
    const rows = state()
      .raffles.filter((r) => !statuses?.length || statuses.includes(r.status))
      .sort((a, b) => b.endsAt.localeCompare(a.endsAt));
    return { items: clone(rows.slice(offset, offset + limit)), total: rows.length };
  },
  async get(id) {
    return clone(state().raffles.find((r) => r.id === id) ?? null);
  },
  async insert(data) {
    const created: Raffle = { ...clone(data), id: crypto.randomUUID(), createdAt: now(), updatedAt: now() };
    state().raffles.push(created);
    return clone(created);
  },
  async update(id, patch, onlyStatus) {
    const found = state().raffles.find((r) => r.id === id && (!onlyStatus || r.status === onlyStatus));
    if (!found) return null;
    Object.assign(found, clone(Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))), { updatedAt: now() });
    return clone(found);
  },
  async remove(id) {
    state().raffles = state().raffles.filter((r) => !(r.id === id && r.status === "draft"));
  },
  async insertEntry(e) {
    const s = state();
    if (s.entries.some((x) => x.raffleId === e.raffleId && x.userId === e.userId && x.slot === e.slot)) throw new PartnerError("Sua participação já foi registrada.", 409);
    const created: RaffleEntry = { ...e, id: crypto.randomUUID(), entryNumber: null, createdAt: now() };
    s.entries.push(created);
    return clone(created);
  },
  async entriesOf(raffleId, userId) {
    return clone(state().entries.filter((e) => e.raffleId === raffleId && e.userId === userId));
  },
  async allEntries(raffleId) {
    return clone(state().entries.filter((e) => e.raffleId === raffleId));
  },
  async setEntryNumbers(raffleId, numbers) {
    for (const n of numbers) {
      const found = state().entries.find((e) => e.id === n.id && e.raffleId === raffleId);
      if (found) found.entryNumber = n.entryNumber;
    }
  },
  async countEntries(raffleId) {
    return state().entries.filter((e) => e.raffleId === raffleId).length;
  },
  async myEntryCounts(userId) {
    const map = new Map<string, number>();
    for (const e of state().entries) if (e.userId === userId) map.set(e.raffleId, (map.get(e.raffleId) ?? 0) + 1);
    return map;
  },
  async insertEvent(e) {
    state().events.unshift({ ...clone(e), id: crypto.randomUUID(), createdAt: now() });
  },
  async events(raffleId) {
    return clone(state().events.filter((e) => e.raffleId === raffleId));
  },
};

export function getRafflesRepository(): RafflesRepository {
  return supabaseAdmin ? supabaseRepo() : memoryRepo;
}

/** Só para testes. */
export function resetRafflesMemory(): void {
  (globalThis as unknown as { __prxRaffles?: MemoryState }).__prxRaffles = { raffles: [], entries: [], events: [] };
}
