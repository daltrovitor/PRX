// Hello World
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryAsaasBankStore } from "@/lib/bank/asaas/store-memory";
import { evaluateBehavior, evaluationWindow, type OutgoingPayment } from "@/lib/behaviors/engine";
import { resetBehaviorsMemory, getBehaviorsRepository } from "@/lib/behaviors/repository";
import { evaluateRule, importCompanies, memberBehaviors, reviewEvaluation, saveCompany, saveRule, type EvaluationDeps } from "@/lib/behaviors/service";
import { normalizeIdentifier, type BehaviorCompany } from "@/lib/behaviors/types";
import { getWalletRepository, resetPointsMemory } from "@/lib/points/repository";

const BET = "11222333000181"; // CNPJ de teste com dígitos válidos
const MERCADO = "11444777000161";
const company = (over: Partial<BehaviorCompany>): BehaviorCompany => ({
  id: "c1",
  cnpj: BET,
  legalName: "Bet Exemplo Apostas Ltda",
  tradeName: "BetExemplo",
  identifiers: [normalizeIdentifier("pix@betexemplo.com")],
  category: "apostas",
  notes: "",
  active: true,
  createdAt: "",
  updatedAt: "",
  ...over,
});
const pay = (over: Partial<OutgoingPayment>): OutgoingPayment => ({
  id: "o1",
  kind: "pix_key",
  amount: 50,
  counterparty: "",
  target: "outra@chave.com",
  counterpartyDocument: null,
  createdAt: "2026-10-10T12:00:00.000Z",
  ...over,
});
const window = { periodStart: "2026-10-01T00:00:00.000Z", periodEnd: "2026-10-15T23:59:59.000Z" };

describe("motor de comportamentos", () => {
  it("casa por CNPJ do recebedor, por chave Pix e, só como sinal, pelo nome", () => {
    const companies = [company({})];
    const rule = { comparator: "at_least" as const, threshold: 2, minAmount: 0, channels: ["pix_key", "pix_qr", "bill"] as const };
    const strong = evaluateBehavior({
      rule: { ...rule, channels: [...rule.channels] },
      companies,
      accountActiveSince: "2026-01-01T00:00:00.000Z",
      payments: [pay({ id: "a", counterpartyDocument: BET }), pay({ id: "b", target: "PIX@BetExemplo.com" })],
      ...window,
    });
    expect(strong).toMatchObject({ result: "identified", status: "final" });
    expect(strong.evidence.map((e) => e.matchedBy)).toEqual(["cnpj", "pix_key"]);

    const weak = evaluateBehavior({
      rule: { ...rule, channels: [...rule.channels] },
      companies,
      accountActiveSince: "2026-01-01T00:00:00.000Z",
      payments: [pay({ id: "a", counterpartyDocument: BET }), pay({ id: "c", kind: "bill", target: "8469", counterparty: "BET EXEMPLO APOSTAS LTDA." })],
      ...window,
    });
    // Um confirmado + um só pelo nome: vai para a revisão humana, não vale sozinho.
    expect(weak).toMatchObject({ result: "identified", status: "under_review" });
  });

  it("'não pagou nenhuma vez' só vale com a conta ativa o período inteiro", () => {
    const rule = { comparator: "none" as const, threshold: 1, minAmount: 0, channels: ["pix_key" as const] };
    const base = { rule, companies: [company({})], payments: [], ...window };
    expect(evaluateBehavior({ ...base, accountActiveSince: null }).result).toBe("unverifiable");
    expect(evaluateBehavior({ ...base, accountActiveSince: "2026-10-05T00:00:00.000Z" }).result).toBe("unverifiable");
    expect(evaluateBehavior({ ...base, accountActiveSince: "2026-09-01T00:00:00.000Z" })).toMatchObject({ result: "identified", status: "final" });
    const broke = evaluateBehavior({ ...base, accountActiveSince: "2026-09-01T00:00:00.000Z", payments: [pay({ counterpartyDocument: BET })] });
    expect(broke).toMatchObject({ result: "not_identified" });
    // Fora do canal escolhido ou abaixo do valor mínimo não conta.
    expect(evaluateBehavior({ ...base, accountActiveSince: "2026-09-01T00:00:00.000Z", payments: [pay({ kind: "bill", counterpartyDocument: BET })] }).result).toBe("identified");
  });

  it("período respeita a vigência da regra e fecha no fim do dia", () => {
    const w = evaluationWindow({ observationDays: 30, startsAt: "2026-10-10T00:00:00.000Z", endsAt: null }, new Date("2026-10-16T09:00:00.000Z"));
    expect(w).toEqual({ start: "2026-10-10T00:00:00.000Z", end: "2026-10-16T23:59:59.000Z" });
    expect(evaluationWindow({ observationDays: 7, startsAt: "2026-11-01T00:00:00.000Z", endsAt: null }, new Date("2026-10-16T09:00:00.000Z"))).toBeNull();
  });
});

describe("empresas e regras", () => {
  beforeEach(() => {
    resetBehaviorsMemory();
    resetPointsMemory();
  });

  it("importação em lote: valida CNPJ, aponta duplicados e atualiza quem já existe", async () => {
    await saveCompany({ cnpj: MERCADO, legalName: "Mercado Bom Ltda", identifiers: ["pix@mercado.com"] }, "admin@prx.dev");
    const rows = [
      { cnpj: "11.222.333/0001-81", legalName: "Bet Exemplo Apostas Ltda", tradeName: "BetExemplo", category: "apostas" },
      { cnpj: "11222333000181", legalName: "Repetida" },
      { cnpj: "11222333000100", legalName: "CNPJ errado" },
      { cnpj: MERCADO, legalName: "Mercado Bom Ltda", identifiers: ["(11) 98888-7777"] },
    ];
    const preview = await importCompanies(rows, "lista.csv", "admin@prx.dev", true);
    expect(preview.run).toMatchObject({ total: 4, created: 1, updated: 1, duplicates: 1, id: null });
    expect((await getBehaviorsRepository().listCompanies({ q: "", category: "", offset: 0, limit: 10 })).total).toBe(1);

    const { run } = await importCompanies(rows, "lista.csv", "admin@prx.dev");
    expect(run).toMatchObject({ created: 1, updated: 1, duplicates: 1 });
    expect(run.errors.map((e) => e.row)).toEqual([3, 4]);
    const [mercado] = await getBehaviorsRepository().companiesByCnpj([MERCADO]);
    expect(mercado.identifiers).toEqual(["pix@mercado.com", "11988887777"]);
    // Reimportar o mesmo arquivo não muda nada.
    expect((await importCompanies(rows, "lista.csv", "admin@prx.dev")).run).toMatchObject({ created: 0, updated: 0, unchanged: 2 });
  });

  it("regra avalia com os pagamentos reais, credita uma vez e aceita a revisão do admin", async () => {
    const bet = await saveCompany({ cnpj: BET, legalName: "Bet Exemplo Apostas Ltda", category: "apostas" }, "admin@prx.dev");
    await expect(saveRule({ name: "Sem regra", polarity: "positive", comparator: "none", observationDays: 30 }, "a")).rejects.toThrow(/empresas ou a categorias/);
    await expect(saveRule({ name: "Errada", polarity: "negative", comparator: "at_least", observationDays: 30, categories: ["apostas"], coins: 5 }, "a")).rejects.toThrow(/positivo/);
    const rule = await saveRule({ name: "30 dias sem bets", polarity: "positive", comparator: "none", observationDays: 30, companyIds: [bet.id], coins: 20, xp: 100, status: "active" }, "admin@prx.dev");

    const store = new MemoryAsaasBankStore();
    const clean = "33333333-3333-4333-8333-333333333333";
    const better = "44444444-4444-4444-8444-444444444444";
    const fresh = "55555555-5555-4555-8555-555555555555";
    for (const [id, status, since] of [[clean, "active", "2026-01-01T00:00:00.000Z"], [better, "active", "2026-01-01T00:00:00.000Z"], [fresh, "pending_activation", null]] as const) {
      await store.reserveSubaccount(id, "sandbox", new Date().toISOString());
      await store.saveSubaccount(id, { asaasAccountId: `acc_${id.slice(0, 4)}`, status, statusUpdatedAt: since });
    }
    const out = await store.insertOutgoing({ userId: better, kind: "pix_key", amount: 30, counterparty: "CNPJ", target: BET, description: "" });
    await store.transitionOutgoing(out.id, ["awaiting_confirmation"], "done");
    const deps: EvaluationDeps = { store, environment: "sandbox", now: () => new Date() };

    expect(await evaluateRule(rule.id, deps)).toMatchObject({ evaluated: 3, identified: 1, unverifiable: 1 });
    // Avaliar de novo no mesmo dia não duplica nem credita duas vezes.
    await evaluateRule(rule.id, deps);
    expect((await getWalletRepository(clean).getBalance(clean)).coins).toBe(20 + (await getWalletRepository(better).getBalance(better)).coins);
    expect((await getBehaviorsRepository().listEvaluations({ ruleId: rule.id, offset: 0, limit: 10 })).total).toBe(3);

    const mine = await memberBehaviors(better, true);
    expect(mine[0]).toMatchObject({ name: "30 dias sem bets", result: "not_identified" });
    expect((await memberBehaviors("someone", false))[0].result).toBe("unverifiable");

    // Correção do admin exige motivo e credita o positivo confirmado.
    const ev = (await getBehaviorsRepository().listEvaluations({ userId: better, offset: 0, limit: 1 })).items[0];
    await expect(reviewEvaluation(ev.id, "identified", "", "admin@prx.dev")).rejects.toThrow(/Explique/);
    const fixed = await reviewEvaluation(ev.id, "identified", "Pix era reembolso de outra empresa", "admin@prx.dev");
    expect(fixed).toMatchObject({ status: "corrected", result: "identified", rewardApplied: true });
  });
});
