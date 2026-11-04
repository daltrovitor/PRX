// Hello World
import { PartnerError } from "@/lib/partners/errors";
import { getWalletRepository } from "@/lib/points/repository";
import { getBehaviorsRepository } from "@/lib/behaviors/repository";
import { evaluateBehavior, evaluationWindow, type OutgoingPayment } from "@/lib/behaviors/engine";
import { companyInputSchema, ruleInputSchema, type BehaviorCompany, type BehaviorEvaluation, type BehaviorResult, type BehaviorRule, type CompanyInput, type ImportRun } from "@/lib/behaviors/types";

/**
 * Serviço dos comportamentos verificáveis: empresas (cadastro e importação em
 * lote), regras e avaliação com os pagamentos reais das contas PRX BANK.
 */

const repo = () => getBehaviorsRepository();

/* -------------------------------------------------------------------------- */
/* Empresas                                                                    */
/* -------------------------------------------------------------------------- */

export async function saveCompany(raw: unknown, actor: string, id?: string): Promise<BehaviorCompany> {
  const parsed = companyInputSchema.safeParse(raw);
  if (!parsed.success) throw new PartnerError(parsed.error.issues[0]?.message ?? "Confira os dados da empresa.", 422);
  if (id) return repo().updateCompany(id, parsed.data);
  const [created] = await repo().insertCompanies([{ ...parsed.data, createdBy: actor }]);
  return created;
}

const sameCompany = (a: BehaviorCompany, b: CompanyInput) =>
  a.legalName === b.legalName && a.tradeName === b.tradeName && a.category === b.category && a.notes === b.notes && a.identifiers.join("|") === b.identifiers.join("|");

/**
 * Importação em lote (CSV, XLSX ou lista colada, já lidos na tela). Cada linha
 * é validada aqui (CNPJ com dígitos verificadores). CNPJ repetido no arquivo
 * conta como duplicado (vale a primeira linha); CNPJ já cadastrado é
 * atualizado, somando os identificadores. `dryRun` só confere.
 */
export async function importCompanies(rows: unknown[], fileName: string, actor: string, dryRun = false): Promise<{ run: Omit<ImportRun, "id" | "createdAt"> & { id: string | null }; preview: CompanyInput[] }> {
  if (rows.length === 0) throw new PartnerError("O arquivo não tem linhas para importar.", 422);
  if (rows.length > 5000) throw new PartnerError("Importe no máximo 5.000 empresas por vez.", 422);
  const errors: ImportRun["errors"] = [];
  const valid = new Map<string, CompanyInput>();
  let duplicates = 0;
  rows.forEach((raw, i) => {
    const parsed = companyInputSchema.safeParse(raw);
    if (!parsed.success) {
      errors.push({ row: i + 2, message: parsed.error.issues[0]?.message ?? "Linha inválida." });
      return;
    }
    if (valid.has(parsed.data.cnpj)) {
      duplicates += 1;
      errors.push({ row: i + 2, message: `CNPJ repetido no arquivo (${parsed.data.cnpj}): vale a primeira linha.` });
      return;
    }
    valid.set(parsed.data.cnpj, parsed.data);
  });

  const existing = new Map((await repo().companiesByCnpj([...valid.keys()])).map((c) => [c.cnpj, c]));
  const toCreate: CompanyInput[] = [];
  const toUpdate: Array<{ id: string; data: CompanyInput }> = [];
  let unchanged = 0;
  for (const data of valid.values()) {
    const found = existing.get(data.cnpj);
    if (!found) {
      toCreate.push(data);
      continue;
    }
    const merged: CompanyInput = { ...data, identifiers: [...new Set([...found.identifiers, ...data.identifiers])], notes: data.notes || found.notes, active: found.active };
    if (sameCompany(found, merged)) unchanged += 1;
    else toUpdate.push({ id: found.id, data: merged });
  }

  const summary = { fileName: fileName.slice(0, 200), total: rows.length, created: toCreate.length, updated: toUpdate.length, unchanged, duplicates, errors, actor };
  if (dryRun) return { run: { ...summary, id: null }, preview: [...valid.values()].slice(0, 50) };
  if (toCreate.length > 0) await repo().insertCompanies(toCreate.map((c) => ({ ...c, createdBy: actor })));
  for (const u of toUpdate) await repo().updateCompany(u.id, u.data);
  const saved = await repo().insertImportRun(summary);
  return { run: saved, preview: [] };
}

/* -------------------------------------------------------------------------- */
/* Regras                                                                      */
/* -------------------------------------------------------------------------- */

export async function saveRule(raw: unknown, actor: string, id?: string): Promise<BehaviorRule> {
  const parsed = ruleInputSchema.safeParse(raw);
  if (!parsed.success) throw new PartnerError(parsed.error.issues[0]?.message ?? "Confira a regra.", 422);
  const ids = [...new Set(parsed.data.companyIds)];
  if (ids.length > 0) {
    const found = await repo().companiesByIds(ids);
    if (found.length !== ids.length) throw new PartnerError("Alguma empresa escolhida não existe mais. Atualize a lista.", 409);
  }
  return repo().saveRule({ ...parsed.data, companyIds: ids }, actor, id);
}

/** Empresas-alvo da regra: as ligadas a ela e as das categorias escolhidas, só as ativas. */
async function targetCompanies(rule: BehaviorRule): Promise<BehaviorCompany[]> {
  const [linked, byCategory] = await Promise.all([repo().companiesByIds(rule.companyIds), repo().companiesByCategories(rule.categories)]);
  const all = new Map<string, BehaviorCompany>();
  for (const c of [...linked, ...byCategory]) if (c.active) all.set(c.id, c);
  return [...all.values()];
}

/* -------------------------------------------------------------------------- */
/* Avaliação                                                                   */
/* -------------------------------------------------------------------------- */

/** Onde a avaliação lê as contas PRX BANK e os pagamentos feitos por elas (vem do banco parceiro). */
export interface EvaluationDeps {
  /** Contas PRX BANK deste ambiente; activeSince = desde quando estão ativas (null = ainda não ativa). */
  listAccounts(limit: number): Promise<Array<{ userId: string; activeSince: string | null }>>;
  /** Pix e contas pagos pela conta do membro e concluídos no período. */
  listPayments(userId: string, startIso: string, endIso: string): Promise<OutgoingPayment[]>;
  now: () => Date;
}

/**
 * Fonte dos pagamentos deste deploy. null enquanto nenhum banco parceiro estiver ligado:
 * sem dado verificável, as regras ficam "não verificável". Ponto de ligação do provedor novo.
 */
export function evaluationDeps(): EvaluationDeps | null {
  return null;
}

/** Credita coins/XP de comportamento positivo identificado (uma vez por avaliação). */
async function applyReward(rule: BehaviorRule, ev: BehaviorEvaluation): Promise<BehaviorEvaluation> {
  const eligible = rule.polarity === "positive" && ev.result === "identified" && ev.status !== "under_review" && (rule.coins > 0 || rule.xp > 0);
  if (!eligible || ev.rewardApplied) return ev;
  await getWalletRepository(ev.userId).apply(ev.userId, { coinsDelta: rule.coins, xpDelta: rule.xp, source: "behavior", referenceId: `behavior:${ev.id}`, description: rule.name.slice(0, 120) });
  return repo().updateEvaluation(ev.id, { rewardApplied: true });
}

/** Avalia uma pessoa numa regra (idempotente por dia). */
export async function evaluateMember(rule: BehaviorRule, activeSince: string | null, userId: string, deps: EvaluationDeps, companies?: BehaviorCompany[]): Promise<BehaviorEvaluation | null> {
  const window = evaluationWindow(rule, deps.now());
  if (!window) return null;
  const payments = activeSince ? await deps.listPayments(userId, window.start, window.end) : [];
  const outcome = evaluateBehavior({ rule, companies: companies ?? (await targetCompanies(rule)), payments, accountActiveSince: activeSince, periodStart: window.start, periodEnd: window.end });
  const { evaluation, created } = await repo().insertEvaluation({
    ruleId: rule.id,
    userId,
    periodStart: window.start,
    periodEnd: window.end,
    result: outcome.result,
    status: outcome.status,
    evidence: outcome.evidence,
    dataSource: "prx_bank",
    reason: outcome.reason,
  });
  return created ? applyReward(rule, evaluation) : evaluation;
}

/** Avalia a regra para quem tem conta PRX BANK neste ambiente (em lotes). */
export async function evaluateRule(ruleId: string, deps: EvaluationDeps | null, limit = 500): Promise<{ evaluated: number; identified: number; review: number; unverifiable: number; skipped: string | null }> {
  const rule = await repo().getRule(ruleId);
  if (!rule) throw new PartnerError("Regra não encontrada.", 404);
  if (!deps) return { evaluated: 0, identified: 0, review: 0, unverifiable: 0, skipped: "Banco parceiro desligado neste ambiente: não há pagamentos verificáveis." };
  if (rule.status !== "active") return { evaluated: 0, identified: 0, review: 0, unverifiable: 0, skipped: "Ative a regra para avaliar." };
  const companies = await targetCompanies(rule);
  const accounts = await deps.listAccounts(limit);
  const totals = { evaluated: 0, identified: 0, review: 0, unverifiable: 0, skipped: null as string | null };
  for (const account of accounts) {
    const ev = await evaluateMember(rule, account.activeSince, account.userId, deps, companies);
    if (!ev) continue;
    totals.evaluated += 1;
    if (ev.status === "under_review") totals.review += 1;
    else if (ev.result === "identified") totals.identified += 1;
    else if (ev.result === "unverifiable") totals.unverifiable += 1;
  }
  return totals;
}

/** Cron diário: todas as regras ativas. */
export async function evaluateActiveRules(deps: EvaluationDeps | null): Promise<{ rules: number; evaluated: number }> {
  if (!deps) return { rules: 0, evaluated: 0 };
  const rules = (await repo().listRules()).filter((r) => r.status === "active");
  let evaluated = 0;
  for (const r of rules) evaluated += (await evaluateRule(r.id, deps)).evaluated;
  return { rules: rules.length, evaluated };
}

/**
 * Revisão do admin: confirmar o que o motor achou, ou corrigir o resultado
 * (sempre com motivo). Comportamento positivo confirmado credita a recompensa.
 */
export async function reviewEvaluation(id: string, decision: "confirm" | BehaviorResult, note: string, reviewer: string): Promise<BehaviorEvaluation> {
  const ev = await repo().getEvaluation(id);
  if (!ev) throw new PartnerError("Avaliação não encontrada.", 404);
  const rule = await repo().getRule(ev.ruleId);
  if (!rule) throw new PartnerError("A regra desta avaliação foi excluída.", 404);
  if (decision !== "confirm" && note.trim().length < 5) throw new PartnerError("Explique a correção (mín. 5 caracteres).", 422);
  if (decision !== "confirm" && ev.rewardApplied && decision !== "identified") {
    throw new PartnerError("Esta avaliação já creditou coins. Para desfazer, ajuste os pontos da pessoa na aba Pontos.", 409);
  }
  const saved = await repo().updateEvaluation(id, {
    result: decision === "confirm" ? ev.result : decision,
    status: decision === "confirm" ? "final" : "corrected",
    reviewedBy: reviewer,
    reviewedAt: new Date().toISOString(),
    reviewNote: note.trim(),
  });
  return applyReward(rule, saved);
}

/* -------------------------------------------------------------------------- */
/* Membro                                                                      */
/* -------------------------------------------------------------------------- */

export interface MemberBehavior {
  ruleId: string;
  name: string;
  description: string;
  polarity: BehaviorRule["polarity"];
  coins: number;
  xp: number;
  observationDays: number;
  result: BehaviorResult | "pending";
  underReview: boolean;
  periodEnd: string | null;
  reason: string;
}

/** Regras ativas com o último resultado da pessoa. Sem conta PRX BANK: "não verificável", sem palpite. */
export async function memberBehaviors(userId: string, hasActiveBank: boolean): Promise<MemberBehavior[]> {
  const [rules, latest] = await Promise.all([repo().listRules(), repo().latestForUser(userId)]);
  const byRule = new Map(latest.map((e) => [e.ruleId, e]));
  return rules
    .filter((r) => r.status === "active")
    .map((r) => {
      const ev = byRule.get(r.id);
      return {
        ruleId: r.id,
        name: r.name,
        description: r.description,
        polarity: r.polarity,
        coins: r.coins,
        xp: r.xp,
        observationDays: r.observationDays,
        result: ev ? ev.result : hasActiveBank ? "pending" : "unverifiable",
        underReview: ev?.status === "under_review",
        periodEnd: ev?.periodEnd ?? null,
        reason: ev ? ev.reason : hasActiveBank ? "Ainda não avaliado." : "Abra sua conta PRX BANK: só conferimos pagamentos feitos por ela.",
      };
    });
}
