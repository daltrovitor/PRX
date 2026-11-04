// Hello World
import { supabaseAdmin } from "@/lib/supabase/client";
import { PartnerError, dbError } from "@/lib/partners/errors";
import { requireTable } from "@/lib/db-features";
import { cleanSearch } from "@/lib/kyc/repository";
import { BEHAVIORS_MIGRATION, type BehaviorCompany, type BehaviorEvaluation, type BehaviorRule, type CompanyInput, type ImportRun } from "@/lib/behaviors/types";
import type { BehaviorsRepository } from "@/lib/behaviors/repository";
import { pgQuote } from "@/lib/postgrest";

/** Comportamentos no Supabase (migração 20261016). Sem a migração, 503 com o nome do arquivo. */

const need = () => requireTable("behavior_companies", BEHAVIORS_MIGRATION);
const now = () => new Date().toISOString();

type Row = Record<string, unknown>;
const company = (r: Row): BehaviorCompany => ({
  id: String(r.id),
  cnpj: String(r.cnpj),
  legalName: String(r.legal_name),
  tradeName: String(r.trade_name ?? ""),
  identifiers: (r.identifiers as string[] | null) ?? [],
  category: String(r.category ?? ""),
  notes: String(r.notes ?? ""),
  active: r.active !== false,
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
});
const companyRow = (c: Partial<CompanyInput>): Row => {
  const row: Row = {};
  if (c.cnpj !== undefined) row.cnpj = c.cnpj;
  if (c.legalName !== undefined) row.legal_name = c.legalName;
  if (c.tradeName !== undefined) row.trade_name = c.tradeName;
  if (c.identifiers !== undefined) row.identifiers = c.identifiers;
  if (c.category !== undefined) row.category = c.category;
  if (c.notes !== undefined) row.notes = c.notes;
  if (c.active !== undefined) row.active = c.active;
  return row;
};
const rule = (r: Row, companyIds: string[]): BehaviorRule => ({
  id: String(r.id),
  name: String(r.name),
  description: String(r.description ?? ""),
  polarity: r.polarity as BehaviorRule["polarity"],
  comparator: r.comparator as BehaviorRule["comparator"],
  threshold: Number(r.threshold),
  minAmount: Number(r.min_amount),
  channels: (r.channels as BehaviorRule["channels"]) ?? [],
  categories: (r.categories as string[]) ?? [],
  observationDays: Number(r.observation_days),
  startsAt: (r.starts_at as string | null) ?? null,
  endsAt: (r.ends_at as string | null) ?? null,
  coins: Number(r.coins),
  xp: Number(r.xp),
  status: r.status === "active" ? "active" : "inactive",
  companyIds,
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
});
const evaluation = (r: Row): BehaviorEvaluation => ({
  id: String(r.id),
  ruleId: String(r.rule_id),
  userId: String(r.user_id),
  periodStart: String(r.period_start),
  periodEnd: String(r.period_end),
  result: r.result as BehaviorEvaluation["result"],
  status: r.status as BehaviorEvaluation["status"],
  evidence: (r.evidence as BehaviorEvaluation["evidence"]) ?? [],
  dataSource: String(r.data_source ?? "prx_bank"),
  reason: String(r.reason ?? ""),
  rewardApplied: r.reward_applied === true,
  reviewedBy: (r.reviewed_by as string | null) ?? null,
  reviewedAt: (r.reviewed_at as string | null) ?? null,
  reviewNote: String(r.review_note ?? ""),
  createdAt: String(r.created_at),
});
const run = (r: Row): ImportRun => ({
  id: String(r.id),
  fileName: String(r.file_name ?? ""),
  total: Number(r.total),
  created: Number(r.created),
  updated: Number(r.updated),
  unchanged: Number(r.unchanged),
  duplicates: Number(r.duplicates),
  errors: (r.errors as ImportRun["errors"]) ?? [],
  actor: String(r.actor),
  createdAt: String(r.created_at),
});

export function supabaseBehaviorsRepository(): BehaviorsRepository {
  const db = supabaseAdmin!;
  const fail = (error: { message: string; code?: string } | null, what: string) => {
    if (error) throw dbError(error, what);
  };
  const companyIdsOf = async (ruleIds: string[]): Promise<Map<string, string[]>> => {
    const map = new Map<string, string[]>();
    if (ruleIds.length === 0) return map;
    const { data, error } = await db.from("behavior_rule_companies").select("rule_id, company_id").in("rule_id", ruleIds);
    fail(error, "Não foi possível ler as empresas das regras");
    for (const r of (data ?? []) as Array<{ rule_id: string; company_id: string }>) map.set(r.rule_id, [...(map.get(r.rule_id) ?? []), r.company_id]);
    return map;
  };
  return {
    async listCompanies({ q, category, offset, limit }) {
      await need();
      let query = db.from("behavior_companies").select("*", { count: "exact" }).order("legal_name").range(offset, offset + limit - 1);
      const term = cleanSearch(q);
      const digits = term.replace(/\D/g, "");
      if (term) query = query.or([`legal_name.ilike.${pgQuote(`*${term}*`)}`, `trade_name.ilike.${pgQuote(`*${term}*`)}`, ...(digits.length >= 3 ? [`cnpj.like.*${digits}*`] : [])].join(","));
      if (category) query = query.eq("category", category);
      const { data, error, count } = await query;
      fail(error, "Não foi possível listar as empresas");
      return { items: ((data ?? []) as Row[]).map(company), total: count ?? 0 };
    },
    async companiesByCnpj(cnpjs) {
      await need();
      if (cnpjs.length === 0) return [];
      const out: BehaviorCompany[] = [];
      for (let i = 0; i < cnpjs.length; i += 500) {
        const { data, error } = await db.from("behavior_companies").select("*").in("cnpj", cnpjs.slice(i, i + 500));
        fail(error, "Não foi possível ler as empresas");
        out.push(...((data ?? []) as Row[]).map(company));
      }
      return out;
    },
    async companiesByIds(ids) {
      await need();
      if (ids.length === 0) return [];
      const out: BehaviorCompany[] = [];
      for (let i = 0; i < ids.length; i += 500) {
        const { data, error } = await db.from("behavior_companies").select("*").in("id", ids.slice(i, i + 500));
        fail(error, "Não foi possível ler as empresas");
        out.push(...((data ?? []) as Row[]).map(company));
      }
      return out;
    },
    async companiesByCategories(categories) {
      await need();
      if (categories.length === 0) return [];
      const { data, error } = await db.from("behavior_companies").select("*").in("category", categories).limit(10_000);
      fail(error, "Não foi possível ler as empresas");
      return ((data ?? []) as Row[]).map(company);
    },
    async insertCompanies(rows) {
      await need();
      const out: BehaviorCompany[] = [];
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500).map((r) => ({ ...companyRow(r), created_by: r.createdBy }));
        const { data, error } = await db.from("behavior_companies").insert(chunk).select("*");
        if (error?.code === "23505") throw new PartnerError("Já existe empresa com este CNPJ.", 409);
        fail(error, "Não foi possível salvar as empresas");
        out.push(...((data ?? []) as Row[]).map(company));
      }
      return out;
    },
    async updateCompany(id, patch) {
      await need();
      const { data, error } = await db.from("behavior_companies").update({ ...companyRow(patch), updated_at: now() }).eq("id", id).select("*").maybeSingle();
      if (error?.code === "23505") throw new PartnerError("Já existe empresa com este CNPJ.", 409);
      fail(error, "Não foi possível salvar a empresa");
      if (!data) throw new PartnerError("Empresa não encontrada.", 404);
      return company(data as Row);
    },
    async deleteCompany(id) {
      await need();
      const { error } = await db.from("behavior_companies").delete().eq("id", id);
      fail(error, "Não foi possível excluir a empresa");
    },
    async categories() {
      await need();
      const { data, error } = await db.from("behavior_companies").select("category").neq("category", "").limit(10_000);
      fail(error, "Não foi possível ler as categorias");
      return [...new Set(((data ?? []) as Array<{ category: string }>).map((r) => r.category))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    },

    async listRules() {
      await need();
      const { data, error } = await db.from("behavior_rules").select("*").order("created_at", { ascending: false }).limit(500);
      fail(error, "Não foi possível listar as regras");
      const rows = (data ?? []) as Row[];
      const ids = await companyIdsOf(rows.map((r) => String(r.id)));
      return rows.map((r) => rule(r, ids.get(String(r.id)) ?? []));
    },
    async getRule(id) {
      await need();
      const { data, error } = await db.from("behavior_rules").select("*").eq("id", id).maybeSingle();
      if (error?.code === "22P02") return null;
      fail(error, "Não foi possível ler a regra");
      if (!data) return null;
      return rule(data as Row, (await companyIdsOf([id])).get(id) ?? []);
    },
    async saveRule(input, actor, id) {
      await need();
      const row: Row = {
        name: input.name,
        description: input.description,
        polarity: input.polarity,
        comparator: input.comparator,
        threshold: input.threshold,
        min_amount: input.minAmount,
        channels: input.channels,
        categories: input.categories,
        observation_days: input.observationDays,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        coins: input.coins,
        xp: input.xp,
        status: input.status,
      };
      const res = id
        ? await db.from("behavior_rules").update({ ...row, updated_at: now() }).eq("id", id).select("*").maybeSingle()
        : await db.from("behavior_rules").insert({ ...row, created_by: actor }).select("*").single();
      fail(res.error, "Não foi possível salvar a regra");
      if (!res.data) throw new PartnerError("Regra não encontrada.", 404);
      const ruleId = String((res.data as Row).id);
      const del = await db.from("behavior_rule_companies").delete().eq("rule_id", ruleId);
      fail(del.error, "Não foi possível ligar as empresas");
      for (let i = 0; i < input.companyIds.length; i += 500) {
        const ins = await db.from("behavior_rule_companies").insert(input.companyIds.slice(i, i + 500).map((company_id) => ({ rule_id: ruleId, company_id })));
        fail(ins.error, "Não foi possível ligar as empresas");
      }
      return rule(res.data as Row, input.companyIds);
    },
    async deleteRule(id) {
      await need();
      const { error } = await db.from("behavior_rules").delete().eq("id", id);
      fail(error, "Não foi possível excluir a regra");
    },
    async rulesOfCompany(companyId) {
      await need();
      const { data, error } = await db.from("behavior_rule_companies").select("rule_id").eq("company_id", companyId);
      fail(error, "Não foi possível ler as regras da empresa");
      return ((data ?? []) as Array<{ rule_id: string }>).map((r) => r.rule_id);
    },

    async insertEvaluation(e) {
      await need();
      const row = {
        rule_id: e.ruleId,
        user_id: e.userId,
        period_start: e.periodStart,
        period_end: e.periodEnd,
        result: e.result,
        status: e.status,
        evidence: e.evidence,
        data_source: e.dataSource,
        reason: e.reason.slice(0, 500),
      };
      const { data, error } = await db.from("behavior_evaluations").insert(row).select("*").maybeSingle();
      if (error?.code === "23505") {
        const found = await db.from("behavior_evaluations").select("*").eq("rule_id", e.ruleId).eq("user_id", e.userId).eq("period_end", e.periodEnd).maybeSingle();
        fail(found.error, "Não foi possível ler a avaliação");
        return { evaluation: evaluation(found.data as Row), created: false };
      }
      fail(error, "Não foi possível salvar a avaliação");
      return { evaluation: evaluation(data as Row), created: true };
    },
    async getEvaluation(id) {
      await need();
      const { data, error } = await db.from("behavior_evaluations").select("*").eq("id", id).maybeSingle();
      if (error?.code === "22P02") return null;
      fail(error, "Não foi possível ler a avaliação");
      return data ? evaluation(data as Row) : null;
    },
    async updateEvaluation(id, patch) {
      await need();
      const row: Row = {};
      if (patch.result !== undefined) row.result = patch.result;
      if (patch.status !== undefined) row.status = patch.status;
      if (patch.reviewedBy !== undefined) row.reviewed_by = patch.reviewedBy;
      if (patch.reviewedAt !== undefined) row.reviewed_at = patch.reviewedAt;
      if (patch.reviewNote !== undefined) row.review_note = patch.reviewNote.slice(0, 500);
      if (patch.rewardApplied !== undefined) row.reward_applied = patch.rewardApplied;
      if (patch.reason !== undefined) row.reason = patch.reason.slice(0, 500);
      const { data, error } = await db.from("behavior_evaluations").update(row).eq("id", id).select("*").maybeSingle();
      fail(error, "Não foi possível salvar a avaliação");
      if (!data) throw new PartnerError("Avaliação não encontrada.", 404);
      return evaluation(data as Row);
    },
    async listEvaluations({ ruleId, userId, status, offset, limit }) {
      await need();
      let query = db.from("behavior_evaluations").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
      if (ruleId) query = query.eq("rule_id", ruleId);
      if (userId) query = query.eq("user_id", userId);
      if (status) query = query.eq("status", status);
      const { data, error, count } = await query;
      fail(error, "Não foi possível listar as avaliações");
      return { items: ((data ?? []) as Row[]).map(evaluation), total: count ?? 0 };
    },
    async latestForUser(userId) {
      await need();
      const { data, error } = await db.from("behavior_evaluations").select("*").eq("user_id", userId).order("period_end", { ascending: false }).limit(200);
      fail(error, "Não foi possível ler os comportamentos");
      const seen = new Set<string>();
      return ((data ?? []) as Row[]).map(evaluation).filter((e) => (seen.has(e.ruleId) ? false : (seen.add(e.ruleId), true)));
    },

    async insertImportRun(r) {
      await need();
      const { data, error } = await db
        .from("behavior_import_runs")
        .insert({ file_name: r.fileName, total: r.total, created: r.created, updated: r.updated, unchanged: r.unchanged, duplicates: r.duplicates, errors: r.errors.slice(0, 500), actor: r.actor })
        .select("*")
        .single();
      fail(error, "Não foi possível registrar a importação");
      return run(data as Row);
    },
    async listImportRuns(limit) {
      await need();
      const { data, error } = await db.from("behavior_import_runs").select("*").order("created_at", { ascending: false }).limit(limit);
      fail(error, "Não foi possível ler as importações");
      return ((data ?? []) as Row[]).map(run);
    },
  };
}

