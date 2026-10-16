// Hello World
import crypto from "crypto";
import { PartnerError } from "@/lib/partners/errors";
import { cleanSearch } from "@/lib/kyc/repository";
import type { BehaviorCompany, BehaviorEvaluation, BehaviorRule, ImportRun } from "@/lib/behaviors/types";
import type { BehaviorsRepository } from "@/lib/behaviors/repository";

/** Comportamentos em memória (desenvolvimento e testes), com as mesmas regras de unicidade do Supabase. */

const now = () => new Date().toISOString();

interface MemoryState {
  companies: BehaviorCompany[];
  rules: BehaviorRule[];
  evaluations: BehaviorEvaluation[];
  runs: ImportRun[];
}
const state = (): MemoryState => ((globalThis as unknown as { __prxBehaviors?: MemoryState }).__prxBehaviors ??= { companies: [], rules: [], evaluations: [], runs: [] });
const clone = <T>(v: T): T => structuredClone(v);

export const memoryBehaviorsRepository: BehaviorsRepository = {
  async listCompanies({ q, category, offset, limit }) {
    const term = cleanSearch(q).toLowerCase();
    const digits = term.replace(/\D/g, "");
    const rows = state()
      .companies.filter((c) => !category || c.category === category)
      .filter((c) => !term || c.legalName.toLowerCase().includes(term) || c.tradeName.toLowerCase().includes(term) || (digits.length >= 3 && c.cnpj.includes(digits)))
      .sort((a, b) => a.legalName.localeCompare(b.legalName, "pt-BR"));
    return { items: clone(rows.slice(offset, offset + limit)), total: rows.length };
  },
  async companiesByCnpj(cnpjs) {
    const set = new Set(cnpjs);
    return clone(state().companies.filter((c) => set.has(c.cnpj)));
  },
  async companiesByIds(ids) {
    const set = new Set(ids);
    return clone(state().companies.filter((c) => set.has(c.id)));
  },
  async companiesByCategories(categories) {
    const set = new Set(categories);
    return clone(state().companies.filter((c) => set.has(c.category)));
  },
  async insertCompanies(rows) {
    const s = state();
    if (rows.some((r) => s.companies.some((c) => c.cnpj === r.cnpj))) throw new PartnerError("Já existe empresa com este CNPJ.", 409);
    const created = rows.map(({ createdBy: _by, ...r }) => {
      void _by;
      return { ...r, id: crypto.randomUUID(), createdAt: now(), updatedAt: now() } as BehaviorCompany;
    });
    s.companies.push(...created);
    return clone(created);
  },
  async updateCompany(id, patch) {
    const s = state();
    const found = s.companies.find((c) => c.id === id);
    if (!found) throw new PartnerError("Empresa não encontrada.", 404);
    if (patch.cnpj && s.companies.some((c) => c.id !== id && c.cnpj === patch.cnpj)) throw new PartnerError("Já existe empresa com este CNPJ.", 409);
    Object.assign(found, clone(Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))), { updatedAt: now() });
    return clone(found);
  },
  async deleteCompany(id) {
    const s = state();
    s.companies = s.companies.filter((c) => c.id !== id);
    for (const r of s.rules) r.companyIds = r.companyIds.filter((c) => c !== id);
  },
  async categories() {
    return [...new Set(state().companies.map((c) => c.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  },
  async listRules() {
    return clone([...state().rules].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  },
  async getRule(id) {
    const found = state().rules.find((r) => r.id === id);
    return found ? clone(found) : null;
  },
  async saveRule(input, _actor, id) {
    const s = state();
    if (id) {
      const found = s.rules.find((r) => r.id === id);
      if (!found) throw new PartnerError("Regra não encontrada.", 404);
      Object.assign(found, clone(input), { updatedAt: now() });
      return clone(found);
    }
    const created: BehaviorRule = { ...clone(input), id: crypto.randomUUID(), createdAt: now(), updatedAt: now() };
    s.rules.push(created);
    return clone(created);
  },
  async deleteRule(id) {
    const s = state();
    s.rules = s.rules.filter((r) => r.id !== id);
    s.evaluations = s.evaluations.filter((e) => e.ruleId !== id);
  },
  async rulesOfCompany(companyId) {
    return state()
      .rules.filter((r) => r.companyIds.includes(companyId))
      .map((r) => r.id);
  },
  async insertEvaluation(e) {
    const s = state();
    const existing = s.evaluations.find((x) => x.ruleId === e.ruleId && x.userId === e.userId && x.periodEnd === e.periodEnd);
    if (existing) return { evaluation: clone(existing), created: false };
    const created: BehaviorEvaluation = { ...clone(e), id: crypto.randomUUID(), createdAt: now(), rewardApplied: false, reviewedBy: null, reviewedAt: null, reviewNote: "" };
    s.evaluations.push(created);
    return { evaluation: clone(created), created: true };
  },
  async getEvaluation(id) {
    const found = state().evaluations.find((e) => e.id === id);
    return found ? clone(found) : null;
  },
  async updateEvaluation(id, patch) {
    const found = state().evaluations.find((e) => e.id === id);
    if (!found) throw new PartnerError("Avaliação não encontrada.", 404);
    Object.assign(found, clone(Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))));
    return clone(found);
  },
  async listEvaluations({ ruleId, userId, status, offset, limit }) {
    const rows = state()
      .evaluations.filter((e) => (!ruleId || e.ruleId === ruleId) && (!userId || e.userId === userId) && (!status || e.status === status))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { items: clone(rows.slice(offset, offset + limit)), total: rows.length };
  },
  async latestForUser(userId) {
    const seen = new Set<string>();
    return clone(
      state()
        .evaluations.filter((e) => e.userId === userId)
        .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))
        .filter((e) => (seen.has(e.ruleId) ? false : (seen.add(e.ruleId), true)))
    );
  },
  async insertImportRun(r) {
    const created: ImportRun = { ...clone(r), id: crypto.randomUUID(), createdAt: now() };
    state().runs.unshift(created);
    return clone(created);
  },
  async listImportRuns(limit) {
    return clone(state().runs.slice(0, limit));
  },
};

/** Só para testes. */
export function resetBehaviorsMemory(): void {
  (globalThis as unknown as { __prxBehaviors?: MemoryState }).__prxBehaviors = { companies: [], rules: [], evaluations: [], runs: [] };
}
