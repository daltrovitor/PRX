// Hello World
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/client";
import { PartnerError, dbError } from "@/lib/partners/errors";
import { requireLaunchSchema } from "@/lib/db-features";
import type { FoundersMeeting, FoundersStartup, FoundersUpdate } from "@/lib/founders/types";

/**
 * Persistência do conteúdo do PRX Founders. As três tabelas têm colunas
 * simples (texto, número, data), então um único repositório genérico converte
 * camelCase ⇄ snake_case. Sem Supabase, memória preservada no globalThis.
 */

type Entity = { id: string; createdAt: string; updatedAt: string };
type Order = { column: string; ascending: boolean }[];

const snake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const camel = (key: string) => key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

function toRow(data: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) if (value !== undefined && key !== "id") row[snake(key)] = value;
  return row;
}

function fromRow<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) out[camel(key)] = value;
  return out as T;
}

export interface ContentRepository<T extends Entity> {
  list(filter?: { status?: string }): Promise<T[]>;
  insert(data: Omit<T, "id" | "createdAt" | "updatedAt"> & { createdBy?: string }): Promise<T>;
  update(id: string, patch: Partial<Omit<T, "id" | "createdAt" | "updatedAt">>): Promise<T>;
  remove(id: string): Promise<void>;
}

class SupabaseContent<T extends Entity> implements ContentRepository<T> {
  constructor(
    private readonly table: string,
    private readonly order: Order
  ) {}

  private get db() {
    return supabaseAdmin!;
  }

  async list(filter?: { status?: string }) {
    await requireLaunchSchema();
    let query = this.db.from(this.table).select("*").limit(500);
    for (const o of this.order) query = query.order(o.column, { ascending: o.ascending });
    if (filter?.status) query = query.eq("status", filter.status);
    const { data, error } = await query;
    if (error) throw dbError(error, "Não foi possível carregar o PRX Founders");
    return (data as Record<string, unknown>[]).map((r) => fromRow<T>(r));
  }

  async insert(data: Omit<T, "id" | "createdAt" | "updatedAt"> & { createdBy?: string }) {
    await requireLaunchSchema();
    const { data: row, error } = await this.db.from(this.table).insert(toRow(data)).select("*").single();
    if (error) throw dbError(error, "Não foi possível salvar");
    return fromRow<T>(row as Record<string, unknown>);
  }

  async update(id: string, patch: Partial<Omit<T, "id" | "createdAt" | "updatedAt">>) {
    await requireLaunchSchema();
    const { data, error } = await this.db
      .from(this.table)
      .update({ ...toRow(patch), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) {
      if (error.code === "22P02") throw new PartnerError("Registro não encontrado.", 404);
      throw dbError(error, "Não foi possível salvar");
    }
    if (!data) throw new PartnerError("Registro não encontrado.", 404);
    return fromRow<T>(data as Record<string, unknown>);
  }

  async remove(id: string) {
    await requireLaunchSchema();
    const { error } = await this.db.from(this.table).delete().eq("id", id);
    if (error) throw dbError(error, "Não foi possível excluir");
  }
}

class MemoryContent<T extends Entity> implements ContentRepository<T> {
  constructor(
    private readonly rows: T[],
    private readonly order: Order
  ) {}

  async list(filter?: { status?: string }) {
    const list = this.rows.filter((r) => !filter?.status || (r as unknown as { status: string }).status === filter.status);
    const sorted = [...list].sort((a, b) => {
      for (const o of this.order) {
        const key = camel(o.column) as keyof T;
        const av = String(a[key] ?? "");
        const bv = String(b[key] ?? "");
        const cmp = typeof a[key] === "number" ? Number(a[key]) - Number(b[key]) : av.localeCompare(bv);
        if (cmp !== 0) return o.ascending ? cmp : -cmp;
      }
      return 0;
    });
    return structuredClone(sorted);
  }

  async insert(data: Omit<T, "id" | "createdAt" | "updatedAt"> & { createdBy?: string }) {
    const now = new Date().toISOString();
    const { createdBy: _ignored, ...rest } = data;
    void _ignored;
    const created = { ...(structuredClone(rest) as object), id: crypto.randomUUID(), createdAt: now, updatedAt: now } as T;
    this.rows.push(created);
    return structuredClone(created);
  }

  async update(id: string, patch: Partial<Omit<T, "id" | "createdAt" | "updatedAt">>) {
    const index = this.rows.findIndex((r) => r.id === id);
    if (index === -1) throw new PartnerError("Registro não encontrado.", 404);
    this.rows[index] = { ...this.rows[index], ...structuredClone(patch), updatedAt: new Date().toISOString() };
    return structuredClone(this.rows[index]);
  }

  async remove(id: string) {
    const index = this.rows.findIndex((r) => r.id === id);
    if (index !== -1) this.rows.splice(index, 1);
  }
}

const memory = globalThis as unknown as { __prxFounders?: { meetings: FoundersMeeting[]; startups: FoundersStartup[]; updates: FoundersUpdate[] } };

function make<T extends Entity>(table: string, key: "meetings" | "startups" | "updates", order: Order): ContentRepository<T> {
  if (supabaseAdmin) return new SupabaseContent<T>(table, order);
  memory.__prxFounders ??= { meetings: [], startups: [], updates: [] };
  return new MemoryContent<T>(memory.__prxFounders[key] as unknown as T[], order);
}

export const meetingsRepo = () => make<FoundersMeeting>("founders_meetings", "meetings", [{ column: "starts_at", ascending: true }]);
export const startupsRepo = () =>
  make<FoundersStartup>("founders_startups", "startups", [
    { column: "sort_order", ascending: true },
    { column: "name", ascending: true },
  ]);
export const updatesRepo = () =>
  make<FoundersUpdate>("founders_updates", "updates", [
    { column: "published_at", ascending: false },
    { column: "created_at", ascending: false },
  ]);
