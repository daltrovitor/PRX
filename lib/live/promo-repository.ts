// Hello World
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/client";
import { PartnerError, dbError } from "@/lib/partners/errors";
import { requireLaunchSchema } from "@/lib/db-features";
import { columnReady } from "@/lib/db-features";
import { CHECKOUT_METHODS, PROMO_AUDIENCES, type CheckoutMethod, type PromoAudience, type PromoCode, type PromoKind } from "@/lib/live/promo";

const CHECKOUT_MIGRATION_HINT = "Falta aplicar a migração supabase/migrations/20261016_prx_checkout.sql no Supabase para descontos automáticos, por público ou por forma de pagamento.";

/** Antes da migração 20261016_prx_checkout: grava sem as colunas novas, se elas estiverem no padrão; senão avisa. */
async function compatPromoRow(row: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (await columnReady("live_promo_codes", "automatic")) return row;
  const custom = row.automatic === true || (row.audience !== undefined && row.audience !== "all") || (row.payment_methods !== undefined && row.payment_methods !== null) || row.stackable === true;
  if (custom) throw new PartnerError(CHECKOUT_MIGRATION_HINT, 503);
  const { automatic: _a, audience: _b, payment_methods: _c, stackable: _d, ...rest } = row;
  void _a;
  void _b;
  void _c;
  void _d;
  return rest;
}

/** Persistência dos cupons do PRX LIVE (Supabase ou memória no desenvolvimento). */

export type NewPromo = Omit<PromoCode, "id" | "createdAt" | "updatedAt">;
export type PromoPatch = Partial<Omit<PromoCode, "id" | "eventId" | "code" | "createdAt" | "createdBy">>;

export interface PromoRepository {
  list(filter?: { eventId?: string }): Promise<PromoCode[]>;
  get(id: string): Promise<PromoCode | null>;
  getByCode(code: string): Promise<PromoCode | null>;
  insert(promo: NewPromo): Promise<PromoCode>;
  update(id: string, patch: PromoPatch): Promise<PromoCode>;
}

interface PromoRow {
  id: string;
  event_id: string;
  code: string;
  label: string;
  kind: string;
  value: number | string;
  batch_ids: string[] | null;
  starts_at: string | null;
  ends_at: string | null;
  max_uses: number | null;
  per_user_limit: number;
  active: boolean;
  automatic?: boolean | null;
  audience?: string | null;
  payment_methods?: string[] | null;
  stackable?: boolean | null;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
}

const mapRow = (r: PromoRow): PromoCode => ({
  id: r.id,
  eventId: r.event_id,
  code: r.code,
  label: r.label,
  kind: (r.kind === "fixed" ? "fixed" : "percent") as PromoKind,
  value: Number(r.value),
  batchIds: r.batch_ids && r.batch_ids.length > 0 ? r.batch_ids : null,
  startsAt: r.starts_at,
  endsAt: r.ends_at,
  maxUses: r.max_uses,
  perUserLimit: r.per_user_limit,
  active: r.active,
  automatic: r.automatic === true,
  audience: (PROMO_AUDIENCES as readonly string[]).includes(r.audience ?? "") ? (r.audience as PromoAudience) : "all",
  paymentMethods: r.payment_methods && r.payment_methods.length > 0 ? (r.payment_methods.filter((m) => (CHECKOUT_METHODS as readonly string[]).includes(m)) as CheckoutMethod[]) : null,
  stackable: r.stackable === true,
  createdBy: r.created_by ?? "",
  createdAt: r.created_at,
  updatedAt: r.updated_at ?? r.created_at,
});

function toRow(p: Partial<NewPromo>): Record<string, unknown> {
  const map: Record<string, string> = {
    eventId: "event_id",
    code: "code",
    label: "label",
    kind: "kind",
    value: "value",
    batchIds: "batch_ids",
    startsAt: "starts_at",
    endsAt: "ends_at",
    maxUses: "max_uses",
    perUserLimit: "per_user_limit",
    active: "active",
    automatic: "automatic",
    audience: "audience",
    paymentMethods: "payment_methods",
    stackable: "stackable",
    createdBy: "created_by",
  };
  const row: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(map)) {
    const value = (p as Record<string, unknown>)[key];
    if (value !== undefined) row[column] = value;
  }
  return row;
}

type SupabaseClient = NonNullable<typeof supabaseAdmin>;

class SupabasePromoRepository implements PromoRepository {
  constructor(private readonly db: SupabaseClient) {}

  async list(filter?: { eventId?: string }) {
    await requireLaunchSchema();
    let query = this.db.from("live_promo_codes").select("*").order("created_at", { ascending: false }).limit(500);
    if (filter?.eventId) query = query.eq("event_id", filter.eventId);
    const { data, error } = await query;
    if (error) throw dbError(error, "Não foi possível listar os cupons");
    return (data as PromoRow[]).map(mapRow);
  }

  async get(id: string) {
    await requireLaunchSchema();
    const { data, error } = await this.db.from("live_promo_codes").select("*").eq("id", id).maybeSingle();
    if (error) {
      if (error.code === "22P02") return null;
      throw dbError(error, "Não foi possível consultar o cupom");
    }
    return data ? mapRow(data as PromoRow) : null;
  }

  async getByCode(code: string) {
    await requireLaunchSchema();
    const { data, error } = await this.db.from("live_promo_codes").select("*").eq("code", code).maybeSingle();
    if (error) throw dbError(error, "Não foi possível consultar o cupom");
    return data ? mapRow(data as PromoRow) : null;
  }

  async insert(promo: NewPromo) {
    await requireLaunchSchema();
    const { data, error } = await this.db.from("live_promo_codes").insert(await compatPromoRow(toRow(promo))).select("*").single();
    if (error) {
      if (error.code === "23505") throw new PartnerError("Já existe um cupom com este código.", 409);
      throw dbError(error, "Não foi possível criar o cupom");
    }
    return mapRow(data as PromoRow);
  }

  async update(id: string, patch: PromoPatch) {
    await requireLaunchSchema();
    const { data, error } = await this.db
      .from("live_promo_codes")
      .update({ ...(await compatPromoRow(toRow(patch))), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw dbError(error, "Não foi possível atualizar o cupom");
    if (!data) throw new PartnerError("Cupom não encontrado.", 404);
    return mapRow(data as PromoRow);
  }
}

class MemoryPromoRepository implements PromoRepository {
  constructor(private readonly state: PromoCode[]) {}

  async list(filter?: { eventId?: string }) {
    return structuredClone(this.state.filter((p) => !filter?.eventId || p.eventId === filter.eventId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }

  async get(id: string) {
    const found = this.state.find((p) => p.id === id);
    return found ? structuredClone(found) : null;
  }

  async getByCode(code: string) {
    const found = this.state.find((p) => p.code === code);
    return found ? structuredClone(found) : null;
  }

  async insert(promo: NewPromo) {
    if (this.state.some((p) => p.code === promo.code)) throw new PartnerError("Já existe um cupom com este código.", 409);
    const now = new Date().toISOString();
    const created: PromoCode = { ...structuredClone(promo), id: `promo_${crypto.randomBytes(6).toString("hex")}`, createdAt: now, updatedAt: now };
    this.state.push(created);
    return structuredClone(created);
  }

  async update(id: string, patch: PromoPatch) {
    const index = this.state.findIndex((p) => p.id === id);
    if (index === -1) throw new PartnerError("Cupom não encontrado.", 404);
    this.state[index] = { ...this.state[index], ...structuredClone(patch), updatedAt: new Date().toISOString() };
    return structuredClone(this.state[index]);
  }
}

const globalState = globalThis as unknown as { __prxPromos?: PromoCode[] };

export function getPromoRepository(): PromoRepository {
  if (supabaseAdmin) return new SupabasePromoRepository(supabaseAdmin);
  globalState.__prxPromos ??= [];
  return new MemoryPromoRepository(globalState.__prxPromos);
}
