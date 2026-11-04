// Hello World
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/client";
import { PartnerError, dbError } from "@/lib/partners/errors";
import { requireTable } from "@/lib/db-features";
import { ORDER_STATUSES, ORDER_STATUS_LABEL, type LiveOrder, type OrderStatus } from "@/lib/checkout/types";
import type { AppliedDiscount, CheckoutMethod } from "@/lib/live/promo";

export { ORDER_STATUSES, ORDER_STATUS_LABEL, type LiveOrder, type OrderStatus };

/**
 * Pedidos do checkout de ingressos (tabela live_orders, migração
 * 20261016_prx_checkout.sql). Um pedido em aberto por ingresso; as mudanças
 * de status são condicionais (a primeira vence: webhook repetido não refaz).
 */

export const CHECKOUT_MIGRATION = "20261016_prx_checkout.sql";

export type NewOrder = Omit<LiveOrder, "id" | "createdAt" | "updatedAt" | "paidAt" | "reviewNote" | "gatewayPaymentId" | "invoiceUrl">;
export type OrderPatch = Partial<Pick<LiveOrder, "status" | "gatewayPaymentId" | "invoiceUrl" | "paidAt" | "reviewNote">>;

export interface OrdersRepository {
  insert(order: NewOrder): Promise<LiveOrder>;
  get(id: string): Promise<LiveOrder | null>;
  openForTicket(ticketId: string): Promise<LiveOrder | null>;
  forTicket(ticketId: string): Promise<LiveOrder[]>;
  /** Muda o status só se estiver em um dos `from` (null: outro processo chegou antes). */
  transition(id: string, from: OrderStatus[], patch: OrderPatch): Promise<LiveOrder | null>;
  update(id: string, patch: OrderPatch): Promise<LiveOrder>;
  list(filter: { status?: string; eventId?: string; offset: number; limit: number }): Promise<{ items: LiveOrder[]; total: number }>;
}

type Row = Record<string, unknown>;
const map = (r: Row): LiveOrder => ({
  id: String(r.id),
  userId: String(r.user_id),
  ticketId: String(r.ticket_id),
  eventId: String(r.event_id),
  paymentMethod: r.payment_method as CheckoutMethod,
  amountOriginal: Number(r.amount_original),
  discountTotal: Number(r.discount_total),
  amountTotal: Number(r.amount_total),
  discounts: (r.discounts as AppliedDiscount[]) ?? [],
  status: r.status as OrderStatus,
  environment: r.environment as LiveOrder["environment"],
  gatewayPaymentId: (r.asaas_payment_id as string | null) ?? null,
  invoiceUrl: (r.invoice_url as string | null) ?? null,
  paidAt: (r.paid_at as string | null) ?? null,
  reviewNote: String(r.review_note ?? ""),
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
});
const patchRow = (p: OrderPatch): Row => {
  const row: Row = { updated_at: new Date().toISOString() };
  if (p.status !== undefined) row.status = p.status;
  if (p.gatewayPaymentId !== undefined) row.asaas_payment_id = p.gatewayPaymentId;
  if (p.invoiceUrl !== undefined) row.invoice_url = p.invoiceUrl;
  if (p.paidAt !== undefined) row.paid_at = p.paidAt;
  if (p.reviewNote !== undefined) row.review_note = p.reviewNote.slice(0, 500);
  return row;
};

function supabaseRepo(): OrdersRepository {
  const db = supabaseAdmin!;
  const need = () => requireTable("live_orders", CHECKOUT_MIGRATION);
  return {
    async insert(o) {
      await need();
      const { data, error } = await db
        .from("live_orders")
        .insert({
          user_id: o.userId,
          ticket_id: o.ticketId,
          event_id: o.eventId,
          payment_method: o.paymentMethod,
          amount_original: o.amountOriginal,
          discount_total: o.discountTotal,
          amount_total: o.amountTotal,
          discounts: o.discounts,
          status: o.status,
          environment: o.environment,
        })
        .select("*")
        .single();
      if (error?.code === "23505") throw new PartnerError("Já existe um pagamento em aberto para este ingresso.", 409);
      if (error) throw dbError(error, "Não foi possível registrar o pedido");
      return map(data as Row);
    },
    async get(id) {
      await need();
      const { data, error } = await db.from("live_orders").select("*").eq("id", id).maybeSingle();
      if (error?.code === "22P02") return null;
      if (error) throw dbError(error, "Não foi possível ler o pedido");
      return data ? map(data as Row) : null;
    },
    async openForTicket(ticketId) {
      await need();
      const { data, error } = await db.from("live_orders").select("*").eq("ticket_id", ticketId).eq("status", "awaiting_payment").maybeSingle();
      if (error) throw dbError(error, "Não foi possível ler o pedido");
      return data ? map(data as Row) : null;
    },
    async forTicket(ticketId) {
      await need();
      const { data, error } = await db.from("live_orders").select("*").eq("ticket_id", ticketId).order("created_at", { ascending: false }).limit(20);
      if (error) throw dbError(error, "Não foi possível ler os pedidos");
      return ((data ?? []) as Row[]).map(map);
    },
    async transition(id, from, patch) {
      await need();
      const { data, error } = await db.from("live_orders").update(patchRow(patch)).eq("id", id).in("status", from).select("*");
      if (error) throw dbError(error, "Não foi possível atualizar o pedido");
      const rows = (data ?? []) as Row[];
      return rows[0] ? map(rows[0]) : null;
    },
    async update(id, patch) {
      await need();
      const { data, error } = await db.from("live_orders").update(patchRow(patch)).eq("id", id).select("*").maybeSingle();
      if (error) throw dbError(error, "Não foi possível atualizar o pedido");
      if (!data) throw new PartnerError("Pedido não encontrado.", 404);
      return map(data as Row);
    },
    async list({ status, eventId, offset, limit }) {
      await need();
      let q = db.from("live_orders").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
      if (status) q = q.eq("status", status);
      if (eventId) q = q.eq("event_id", eventId);
      const { data, error, count } = await q;
      if (error) throw dbError(error, "Não foi possível listar os pedidos");
      return { items: ((data ?? []) as Row[]).map(map), total: count ?? 0 };
    },
  };
}

const memory = () => ((globalThis as unknown as { __prxOrders?: LiveOrder[] }).__prxOrders ??= []);
const clone = <T>(v: T): T => structuredClone(v);

const memoryRepo: OrdersRepository = {
  async insert(o) {
    if (o.status === "awaiting_payment" && memory().some((x) => x.ticketId === o.ticketId && x.status === "awaiting_payment")) throw new PartnerError("Já existe um pagamento em aberto para este ingresso.", 409);
    const now = new Date().toISOString();
    const created: LiveOrder = { ...clone(o), id: crypto.randomUUID(), gatewayPaymentId: null, invoiceUrl: null, paidAt: null, reviewNote: "", createdAt: now, updatedAt: now };
    memory().push(created);
    return clone(created);
  },
  async get(id) {
    return clone(memory().find((o) => o.id === id) ?? null);
  },
  async openForTicket(ticketId) {
    return clone(memory().find((o) => o.ticketId === ticketId && o.status === "awaiting_payment") ?? null);
  },
  async forTicket(ticketId) {
    return clone(memory().filter((o) => o.ticketId === ticketId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  },
  async transition(id, from, patch) {
    const found = memory().find((o) => o.id === id && from.includes(o.status));
    if (!found) return null;
    Object.assign(found, clone(Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))), { updatedAt: new Date().toISOString() });
    return clone(found);
  },
  async update(id, patch) {
    const found = memory().find((o) => o.id === id);
    if (!found) throw new PartnerError("Pedido não encontrado.", 404);
    Object.assign(found, clone(Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))), { updatedAt: new Date().toISOString() });
    return clone(found);
  },
  async list({ status, eventId, offset, limit }) {
    const rows = memory()
      .filter((o) => (!status || o.status === status) && (!eventId || o.eventId === eventId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { items: clone(rows.slice(offset, offset + limit)), total: rows.length };
  },
};

export function getOrdersRepository(): OrdersRepository {
  return supabaseAdmin ? supabaseRepo() : memoryRepo;
}

/** Só para testes. */
export function resetOrdersMemory(): void {
  (globalThis as unknown as { __prxOrders?: LiveOrder[] }).__prxOrders = [];
}
