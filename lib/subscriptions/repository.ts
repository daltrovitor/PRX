// Hello World
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/client";
import { PartnerError, dbError } from "@/lib/partners/errors";
import { requireTable } from "@/lib/db-features";
import { LIVE_STATUSES, SUBSCRIPTIONS_MIGRATION, type MemberSubscription, type PlanInput, type SubscriptionEvent, type SubscriptionPayment, type SubscriptionPlan } from "@/lib/subscriptions/types";

/**
 * Persistência das assinaturas (migração 20261016_prx_subscriptions.sql). As
 * colunas são simples, então um conversor camelCase ⇄ snake_case serve às
 * quatro tabelas. Memória no desenvolvimento e nos testes, com as mesmas
 * regras de unicidade (uma assinatura viva por pessoa e plano; pagamento
 * único pelo id do Asaas).
 */

type Row = Record<string, unknown>;
const snake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const camel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const NUMERIC = new Set(["price", "value"]);
function toRow(data: Row): Row {
  const row: Row = {};
  for (const [k, v] of Object.entries(data)) if (v !== undefined && k !== "id" && k !== "createdAt" && k !== "updatedAt") row[snake(k)] = v;
  return row;
}
function fromRow<T>(row: Row): T {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) out[camel(k)] = NUMERIC.has(k) ? Number(v) : k === "due_date" || k === "next_due_date" ? (v === null ? null : String(v).slice(0, 10)) : v;
  return out as T;
}

export type NewSubscription = Omit<MemberSubscription, "id" | "createdAt" | "updatedAt">;
export type SubscriptionPatch = Partial<Omit<MemberSubscription, "id" | "userId" | "planId" | "createdAt" | "updatedAt">>;

export interface SubscriptionsRepository {
  listPlans(): Promise<SubscriptionPlan[]>;
  getPlan(id: string): Promise<SubscriptionPlan | null>;
  savePlan(input: PlanInput, actor: string, id?: string): Promise<SubscriptionPlan>;
  deletePlan(id: string): Promise<void>;
  countSubscriptions(planId: string): Promise<number>;

  insertSubscription(s: NewSubscription): Promise<MemberSubscription>;
  getSubscription(id: string): Promise<MemberSubscription | null>;
  findByAsaasId(asaasId: string): Promise<MemberSubscription | null>;
  updateSubscription(id: string, patch: SubscriptionPatch): Promise<MemberSubscription>;
  deleteSubscription(id: string): Promise<void>;
  listForUser(userId: string): Promise<MemberSubscription[]>;
  liveFor(userId: string, planId: string): Promise<MemberSubscription | null>;
  listAll(filter: { status?: string; planId?: string; offset: number; limit: number }): Promise<{ items: MemberSubscription[]; total: number }>;

  upsertPayment(p: Omit<SubscriptionPayment, "id">): Promise<{ payment: SubscriptionPayment; previousStatus: string | null }>;
  listPayments(subscriptionId: string): Promise<SubscriptionPayment[]>;

  insertEvent(e: Omit<SubscriptionEvent, "id" | "createdAt">): Promise<void>;
  listEvents(subscriptionId: string): Promise<SubscriptionEvent[]>;
}

const need = () => requireTable("member_subscriptions", SUBSCRIPTIONS_MIGRATION);
const now = () => new Date().toISOString();

function supabaseRepo(): SubscriptionsRepository {
  const db = supabaseAdmin!;
  const fail = (error: { message: string; code?: string } | null, what: string) => {
    if (error) throw dbError(error, what);
  };
  return {
    async listPlans() {
      await need();
      const { data, error } = await db.from("subscription_plans").select("*").order("sort_order").order("price").limit(200);
      fail(error, "Não foi possível listar os planos");
      return ((data ?? []) as Row[]).map((r) => fromRow<SubscriptionPlan>(r));
    },
    async getPlan(id) {
      await need();
      const { data, error } = await db.from("subscription_plans").select("*").eq("id", id).maybeSingle();
      if (error?.code === "22P02") return null;
      fail(error, "Não foi possível ler o plano");
      return data ? fromRow<SubscriptionPlan>(data as Row) : null;
    },
    async savePlan(input, actor, id) {
      await need();
      const res = id
        ? await db.from("subscription_plans").update({ ...toRow(input as unknown as Row), updated_at: now() }).eq("id", id).select("*").maybeSingle()
        : await db.from("subscription_plans").insert({ ...toRow(input as unknown as Row), created_by: actor }).select("*").single();
      fail(res.error, "Não foi possível salvar o plano");
      if (!res.data) throw new PartnerError("Plano não encontrado.", 404);
      return fromRow<SubscriptionPlan>(res.data as Row);
    },
    async deletePlan(id) {
      await need();
      const { error } = await db.from("subscription_plans").delete().eq("id", id);
      fail(error, "Não foi possível excluir o plano");
    },
    async countSubscriptions(planId) {
      await need();
      const { count, error } = await db.from("member_subscriptions").select("id", { count: "exact", head: true }).eq("plan_id", planId);
      fail(error, "Não foi possível contar as assinaturas");
      return count ?? 0;
    },
    async insertSubscription(s) {
      await need();
      const { data, error } = await db.from("member_subscriptions").insert(toRow(s as unknown as Row)).select("*").single();
      if (error?.code === "23505") throw new PartnerError("Você já tem uma assinatura deste plano em andamento.", 409);
      fail(error, "Não foi possível registrar a assinatura");
      return fromRow<MemberSubscription>(data as Row);
    },
    async getSubscription(id) {
      await need();
      const { data, error } = await db.from("member_subscriptions").select("*").eq("id", id).maybeSingle();
      if (error?.code === "22P02") return null;
      fail(error, "Não foi possível ler a assinatura");
      return data ? fromRow<MemberSubscription>(data as Row) : null;
    },
    async findByAsaasId(asaasId) {
      await need();
      const { data, error } = await db.from("member_subscriptions").select("*").eq("asaas_subscription_id", asaasId).maybeSingle();
      fail(error, "Não foi possível ler a assinatura");
      return data ? fromRow<MemberSubscription>(data as Row) : null;
    },
    async updateSubscription(id, patch) {
      await need();
      const { data, error } = await db.from("member_subscriptions").update({ ...toRow(patch as Row), updated_at: now() }).eq("id", id).select("*").maybeSingle();
      fail(error, "Não foi possível salvar a assinatura");
      if (!data) throw new PartnerError("Assinatura não encontrada.", 404);
      return fromRow<MemberSubscription>(data as Row);
    },
    async deleteSubscription(id) {
      await need();
      const { error } = await db.from("member_subscriptions").delete().eq("id", id);
      fail(error, "Não foi possível desfazer a assinatura");
    },
    async listForUser(userId) {
      await need();
      const { data, error } = await db.from("member_subscriptions").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50);
      fail(error, "Não foi possível ler suas assinaturas");
      return ((data ?? []) as Row[]).map((r) => fromRow<MemberSubscription>(r));
    },
    async liveFor(userId, planId) {
      await need();
      const { data, error } = await db.from("member_subscriptions").select("*").eq("user_id", userId).eq("plan_id", planId).in("status", [...LIVE_STATUSES]).maybeSingle();
      fail(error, "Não foi possível ler a assinatura");
      return data ? fromRow<MemberSubscription>(data as Row) : null;
    },
    async listAll({ status, planId, offset, limit }) {
      await need();
      let q = db.from("member_subscriptions").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
      if (status) q = q.eq("status", status);
      if (planId) q = q.eq("plan_id", planId);
      const { data, error, count } = await q;
      fail(error, "Não foi possível listar as assinaturas");
      return { items: ((data ?? []) as Row[]).map((r) => fromRow<MemberSubscription>(r)), total: count ?? 0 };
    },
    async upsertPayment(p) {
      await need();
      const before = await db.from("subscription_payments").select("status").eq("asaas_payment_id", p.asaasPaymentId).maybeSingle();
      fail(before.error, "Não foi possível ler o pagamento");
      const { data, error } = await db
        .from("subscription_payments")
        .upsert({ ...toRow(p as unknown as Row), updated_at: now() }, { onConflict: "asaas_payment_id" })
        .select("*")
        .single();
      fail(error, "Não foi possível salvar o pagamento");
      return { payment: fromRow<SubscriptionPayment>(data as Row), previousStatus: (before.data as { status?: string } | null)?.status ?? null };
    },
    async listPayments(subscriptionId) {
      await need();
      const { data, error } = await db.from("subscription_payments").select("*").eq("subscription_id", subscriptionId).order("due_date", { ascending: false }).limit(60);
      fail(error, "Não foi possível ler os pagamentos");
      return ((data ?? []) as Row[]).map((r) => fromRow<SubscriptionPayment>(r));
    },
    async insertEvent(e) {
      const { error } = await db.from("subscription_events").insert({ ...toRow(e as unknown as Row), detail: e.detail.slice(0, 500) });
      if (error) console.warn("[assinaturas] histórico não registrado:", error.message);
    },
    async listEvents(subscriptionId) {
      await need();
      const { data, error } = await db.from("subscription_events").select("*").eq("subscription_id", subscriptionId).order("created_at", { ascending: false }).limit(100);
      fail(error, "Não foi possível ler o histórico");
      return ((data ?? []) as Row[]).map((r) => fromRow<SubscriptionEvent>(r));
    },
  };
}

interface MemoryState {
  plans: SubscriptionPlan[];
  subs: MemberSubscription[];
  payments: SubscriptionPayment[];
  events: SubscriptionEvent[];
}
const state = (): MemoryState => ((globalThis as unknown as { __prxSubs?: MemoryState }).__prxSubs ??= { plans: [], subs: [], payments: [], events: [] });
const clone = <T>(v: T): T => structuredClone(v);

const memoryRepo: SubscriptionsRepository = {
  async listPlans() {
    return clone([...state().plans].sort((a, b) => a.sortOrder - b.sortOrder || a.price - b.price));
  },
  async getPlan(id) {
    return clone(state().plans.find((p) => p.id === id) ?? null);
  },
  async savePlan(input, _actor, id) {
    const s = state();
    if (id) {
      const found = s.plans.find((p) => p.id === id);
      if (!found) throw new PartnerError("Plano não encontrado.", 404);
      Object.assign(found, clone(input), { updatedAt: now() });
      return clone(found);
    }
    const created: SubscriptionPlan = { ...clone(input), id: crypto.randomUUID(), createdAt: now(), updatedAt: now() };
    s.plans.push(created);
    return clone(created);
  },
  async deletePlan(id) {
    state().plans = state().plans.filter((p) => p.id !== id);
  },
  async countSubscriptions(planId) {
    return state().subs.filter((s) => s.planId === planId).length;
  },
  async insertSubscription(sub) {
    const s = state();
    if (s.subs.some((x) => x.userId === sub.userId && x.planId === sub.planId && LIVE_STATUSES.includes(x.status))) throw new PartnerError("Você já tem uma assinatura deste plano em andamento.", 409);
    const created: MemberSubscription = { ...clone(sub), id: crypto.randomUUID(), createdAt: now(), updatedAt: now() };
    s.subs.push(created);
    return clone(created);
  },
  async getSubscription(id) {
    return clone(state().subs.find((s) => s.id === id) ?? null);
  },
  async findByAsaasId(asaasId) {
    return clone(state().subs.find((s) => s.asaasSubscriptionId === asaasId) ?? null);
  },
  async updateSubscription(id, patch) {
    const found = state().subs.find((s) => s.id === id);
    if (!found) throw new PartnerError("Assinatura não encontrada.", 404);
    Object.assign(found, clone(Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))), { updatedAt: now() });
    return clone(found);
  },
  async deleteSubscription(id) {
    state().subs = state().subs.filter((s) => s.id !== id);
  },
  async listForUser(userId) {
    return clone(state().subs.filter((s) => s.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  },
  async liveFor(userId, planId) {
    return clone(state().subs.find((s) => s.userId === userId && s.planId === planId && LIVE_STATUSES.includes(s.status)) ?? null);
  },
  async listAll({ status, planId, offset, limit }) {
    const rows = state()
      .subs.filter((s) => (!status || s.status === status) && (!planId || s.planId === planId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { items: clone(rows.slice(offset, offset + limit)), total: rows.length };
  },
  async upsertPayment(p) {
    const s = state();
    const found = s.payments.find((x) => x.asaasPaymentId === p.asaasPaymentId);
    if (found) {
      const previousStatus = found.status;
      Object.assign(found, clone(p));
      return { payment: clone(found), previousStatus };
    }
    const created: SubscriptionPayment = { ...clone(p), id: crypto.randomUUID() };
    s.payments.push(created);
    return { payment: clone(created), previousStatus: null };
  },
  async listPayments(subscriptionId) {
    return clone(state().payments.filter((p) => p.subscriptionId === subscriptionId).sort((a, b) => b.dueDate.localeCompare(a.dueDate)));
  },
  async insertEvent(e) {
    state().events.unshift({ ...clone(e), id: crypto.randomUUID(), createdAt: now() });
  },
  async listEvents(subscriptionId) {
    return clone(state().events.filter((e) => e.subscriptionId === subscriptionId));
  },
};

export function getSubscriptionsRepository(): SubscriptionsRepository {
  return supabaseAdmin ? supabaseRepo() : memoryRepo;
}

/** Só para testes. */
export function resetSubscriptionsMemory(): void {
  (globalThis as unknown as { __prxSubs?: MemoryState }).__prxSubs = { plans: [], subs: [], payments: [], events: [] };
}
