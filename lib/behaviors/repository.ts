// Hello World
import { supabaseAdmin } from "@/lib/supabase/client";
import { supabaseBehaviorsRepository } from "@/lib/behaviors/repository-supabase";
import { memoryBehaviorsRepository, resetBehaviorsMemory } from "@/lib/behaviors/repository-memory";
import type { BehaviorCompany, BehaviorEvaluation, BehaviorRule, CompanyInput, ImportRun, RuleInput } from "@/lib/behaviors/types";

/**
 * Persistência dos comportamentos verificáveis (migração 20261016). Supabase
 * em produção; memória no desenvolvimento e nos testes, com as mesmas regras
 * de unicidade (CNPJ único; uma avaliação por regra, pessoa e fim de período).
 */

export interface CompanyQuery {
  q: string;
  category: string;
  offset: number;
  limit: number;
}

export type NewEvaluation = Omit<BehaviorEvaluation, "id" | "createdAt" | "rewardApplied" | "reviewedBy" | "reviewedAt" | "reviewNote">;

export interface BehaviorsRepository {
  listCompanies(query: CompanyQuery): Promise<{ items: BehaviorCompany[]; total: number }>;
  companiesByCnpj(cnpjs: string[]): Promise<BehaviorCompany[]>;
  companiesByIds(ids: string[]): Promise<BehaviorCompany[]>;
  companiesByCategories(categories: string[]): Promise<BehaviorCompany[]>;
  insertCompanies(rows: Array<CompanyInput & { createdBy: string }>): Promise<BehaviorCompany[]>;
  updateCompany(id: string, patch: Partial<CompanyInput>): Promise<BehaviorCompany>;
  deleteCompany(id: string): Promise<void>;
  categories(): Promise<string[]>;

  listRules(): Promise<BehaviorRule[]>;
  getRule(id: string): Promise<BehaviorRule | null>;
  saveRule(input: RuleInput, actor: string, id?: string): Promise<BehaviorRule>;
  deleteRule(id: string): Promise<void>;
  /** Regras de cada empresa (para mostrar "ligada a…" na ficha da empresa). */
  rulesOfCompany(companyId: string): Promise<string[]>;

  /** Grava a avaliação; se já existe uma para o mesmo período, devolve a existente (idempotente). */
  insertEvaluation(evaluation: NewEvaluation): Promise<{ evaluation: BehaviorEvaluation; created: boolean }>;
  getEvaluation(id: string): Promise<BehaviorEvaluation | null>;
  updateEvaluation(id: string, patch: Partial<Pick<BehaviorEvaluation, "result" | "status" | "reviewedBy" | "reviewedAt" | "reviewNote" | "rewardApplied" | "reason">>): Promise<BehaviorEvaluation>;
  listEvaluations(filter: { ruleId?: string; userId?: string; status?: string; offset: number; limit: number }): Promise<{ items: BehaviorEvaluation[]; total: number }>;
  latestForUser(userId: string): Promise<BehaviorEvaluation[]>;

  insertImportRun(run: Omit<ImportRun, "id" | "createdAt">): Promise<ImportRun>;
  listImportRuns(limit: number): Promise<ImportRun[]>;
}

export function getBehaviorsRepository(): BehaviorsRepository {
  return supabaseAdmin ? supabaseBehaviorsRepository() : memoryBehaviorsRepository;
}

export { resetBehaviorsMemory };
