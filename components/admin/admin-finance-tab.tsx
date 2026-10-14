// Hello World
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, EmptyState, Field, Input, Notice, Segmented, Tag } from "@/components/app/ui";
import { IconRefresh } from "@/components/icons/prx-icons";
import { ViabilityCalculator, type ViabilityValues } from "@/components/admin/viability-calculator";
import type { AdminEconomy } from "@/components/admin/admin-benefits-tab";
import { DEFAULT_PARTNER_FEE_PCT, MIN_PROFIT_MARGIN_PCT, simulateBankYield } from "@/lib/points/economics";
import { evaluateViability } from "@/components/admin/viability-calculator";
import type { FinanceOverview, FinancePeriod } from "@/lib/points/finance";
import { cn } from "@/lib/utils";

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (value: number | null) => (value === null ? "—" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const num = (text: string) => {
  const value = Number(String(text).replace(",", "."));
  return Number.isFinite(value) ? value : 0;
};

const PERIODS: ReadonlyArray<{ value: `${FinancePeriod}`; label: string }> = [
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
  { value: "365", label: "12 meses" },
];

/**
 * Inteligência financeira da PRX: receita das comissões (resgates e compras
 * em parceiros), custo dos subsídios, lucro operacional, passivo de coins e a
 * viabilidade de cada benefício. Inclui a calculadora e a simulação do saldo.
 */
export function AdminFinanceTab({ economy, onUseInBenefit }: { economy: AdminEconomy; onUseInBenefit?: (values: ViabilityValues) => void }) {
  const [period, setPeriod] = useState<`${FinancePeriod}`>("30");
  const [data, setData] = useState<FinanceOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [calc, setCalc] = useState<ViabilityValues>({
    costPrice: "20",
    revenuePerRedemption: "2",
    partnerFeePct: String(DEFAULT_PARTNER_FEE_PCT),
    minMarginPct: String(MIN_PROFIT_MARGIN_PCT),
    pointsCost: "",
  });
  const [bank, setBank] = useState({ accounts: "1000", balance: "350", cdi: "10.5", client: "100", custody: "110" });

  const load = useCallback(async (p: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/finance?period=${p}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { finance?: FinanceOverview; error?: string };
      if (!res.ok || !json.finance) throw new Error(json.error || "Não foi possível consolidar o financeiro.");
      setData(json.finance);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sem internet agora. Confira sua conexão e tente de novo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (alive) await load(period);
    })();
    return () => {
      alive = false;
    };
  }, [load, period]);

  const yieldSim = simulateBankYield({
    activeAccounts: num(bank.accounts),
    averageBalance: num(bank.balance),
    cdiAnnualPct: num(bank.cdi),
    clientSharePct: num(bank.client),
    custodyYieldPctOfCdi: num(bank.custody),
  });
  const behaviorCost = data ? data.behaviorCoinsPerMonth * data.revenuePerCoin : 0;
  const risky = data?.benefits.filter((b) => b.status !== "ok") ?? [];

  return (
    <section aria-labelledby="finance-title" className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="finance-title" className="text-2xl font-semibold tracking-[-0.03em] text-ink">
            Financeiro
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Receita, custos e margem da plataforma. Sem movimentação no período, tudo aparece zerado.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented label="Período do financeiro" value={period} onChange={setPeriod} options={PERIODS} />
          <Button variant="secondary" size="sm" onClick={() => void load(period)} disabled={loading}>
            <IconRefresh size={16} />
            {loading ? "Atualizando…" : "Atualizar"}
          </Button>
        </div>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {data && (
        <>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Receita bruta" value={brl(data.summary.grossRevenue)} note={`${brl(data.summary.redemptionRevenue)} resgates · ${brl(data.summary.purchaseRevenue)} compras`} />
            <Kpi label="Custo com subsídios" value={brl(data.summary.subsidyCost)} note={`${data.summary.redemptionCount.toLocaleString("pt-BR")} resgates no período`} />
            <Kpi
              label="Lucro operacional líquido"
              value={brl(data.summary.netProfit)}
              note={`Margem média ${pct(data.summary.marginPct)}`}
              tone={data.summary.netProfit < 0 ? "negative" : "neutral"}
            />
            <Kpi label="Volume em parceiros (Pix)" value={brl(data.summary.purchaseVolume)} note={`${data.summary.purchaseCount.toLocaleString("pt-BR")} compras pontuadas`} />
          </dl>

          <dl className="grid gap-3 sm:grid-cols-3">
            <Kpi label="PRX Coins em circulação" value={data.coinsOutstanding.toLocaleString("pt-BR")} note={`Lastro ${brl(data.summary.coinLiability)} (R$ ${data.revenuePerCoin.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}/coin)`} />
            <Kpi label="Emissão em compras" value={`${data.coinsPerReal.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} coin por R$ 1`} note="Definida pela regra de compra em parceiro" />
            <Kpi label="Check-ins por membro assíduo" value={`${data.behaviorCoinsPerMonth.toLocaleString("pt-BR")} coins/mês`} note={`Custo de lastro ${brl(behaviorCost)} por membro/mês`} />
          </dl>

          {risky.length > 0 && (
            <Notice tone="warning">
              {risky.length} {risky.length === 1 ? "benefício está" : "benefícios estão"} abaixo da margem mínima com o preço atual. Ajuste o preço em coins na aba Benefícios.
            </Notice>
          )}

          <div className="grid gap-6 lg:grid-cols-12">
            <section aria-labelledby="finance-benefits" className="space-y-3 lg:col-span-8">
              <h3 id="finance-benefits" className="text-lg font-semibold tracking-[-0.02em] text-ink">
                Viabilidade do catálogo
              </h3>
              {data.benefits.length === 0 ? (
                <EmptyState title="Catálogo vazio" body="Os benefícios aparecem aqui com a margem projetada de cada resgate." />
              ) : (
                <div className="glass overflow-x-auto rounded-3xl">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-line bg-surface text-[13px] text-muted-foreground">
                        <th scope="col" className="px-4 py-3 font-medium">Benefício</th>
                        <th scope="col" className="px-4 py-3 text-right font-medium">Coins</th>
                        <th scope="col" className="px-4 py-3 text-right font-medium">Custo</th>
                        <th scope="col" className="px-4 py-3 text-right font-medium">Receita/resgate</th>
                        <th scope="col" className="px-4 py-3 text-right font-medium">Resgates</th>
                        <th scope="col" className="px-4 py-3 font-medium">Margem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {data.benefits.map((b) => (
                        <tr key={b.id}>
                          <td className="px-4 py-3">
                            <p className="font-medium text-ink">{b.title}</p>
                            <p className="text-[13px] text-muted-foreground">{b.partnerName}</p>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-ink">
                            {b.pointsCost.toLocaleString("pt-BR")}
                            {b.status !== "ok" && b.suggestedPoints !== null && <span className="block text-[12px] text-muted-foreground">sugerido {b.suggestedPoints.toLocaleString("pt-BR")}</span>}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-ink">{brl(b.costPrice)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-ink">{brl(b.revenuePerRedemption)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-ink">{b.redemptions.toLocaleString("pt-BR")}</td>
                          <td className="px-4 py-3">
                            {b.costPrice === 0 ? (
                              <Tag>Sem custo</Tag>
                            ) : b.status === "ok" ? (
                              <Tag tone="success">{pct(b.marginOnCostPct)}</Tag>
                            ) : (
                              <Tag tone="warning">{b.status === "loss" ? "Prejuízo" : pct(b.marginOnCostPct)}</Tag>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section aria-labelledby="finance-partners" className="space-y-3 lg:col-span-4">
              <h3 id="finance-partners" className="text-lg font-semibold tracking-[-0.02em] text-ink">
                Comissões por parceiro
              </h3>
              {data.topPartners.length === 0 ? (
                <p className="rounded-2xl glass p-5 text-sm text-muted-foreground">Nenhuma compra em parceiro via Pix no período.</p>
              ) : (
                <ul className="divide-y divide-line rounded-2xl glass px-4">
                  {data.topPartners.map((p) => (
                    <li key={p.partnerName} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-medium text-ink">{p.partnerName}</p>
                        <p className="text-[13px] text-muted-foreground">
                          {p.purchases.toLocaleString("pt-BR")} compras · {brl(p.volume)}
                        </p>
                      </div>
                      <p className="shrink-0 text-[15px] font-medium tabular-nums text-ink">{brl(p.commission)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="finance-calculator" className="glass space-y-4 rounded-3xl p-5 sm:p-6">
          <div>
            <h3 id="finance-calculator" className="text-lg font-semibold tracking-[-0.02em] text-ink">
              Calculadora de viabilidade
            </h3>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Quanto um benefício deve custar em coins para que o membro, ao juntá-los, já tenha gerado a receita que paga o benefício com {MIN_PROFIT_MARGIN_PCT}%+ de lucro.
            </p>
          </div>
          <ViabilityCalculator values={calc} onChange={setCalc} coinsPerReal={economy.coinsPerReal} behaviorCoinsPerMonth={economy.behaviorCoinsPerMonth} />
          {onUseInBenefit && (
            <Button
              block
              disabled={evaluateViability(calc, economy.coinsPerReal, economy.behaviorCoinsPerMonth).status !== "ok"}
              onClick={() => {
                const result = evaluateViability(calc, economy.coinsPerReal, economy.behaviorCoinsPerMonth);
                onUseInBenefit({ ...calc, pointsCost: String(result.evaluatedPoints) });
              }}
            >
              Criar benefício com estes valores
            </Button>
          )}
        </section>

        <section aria-labelledby="finance-bank" className="glass space-y-4 rounded-3xl p-5 sm:p-6">
          <div>
            <h3 id="finance-bank" className="text-lg font-semibold tracking-[-0.02em] text-ink">
              Simulação: rentabilidade e retenção do PRX Bank
            </h3>
            <p className="mt-1 text-[13px] text-muted-foreground">Spread mensal da PRX sobre o saldo custodiado, pagando ao cliente a parte do CDI prometida no app.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Contas ativas">{(id) => <Input id={id} inputMode="numeric" value={bank.accounts} onChange={(e) => setBank({ ...bank, accounts: e.target.value })} />}</Field>
            <Field label="Saldo médio por conta (R$)">{(id) => <Input id={id} inputMode="decimal" value={bank.balance} onChange={(e) => setBank({ ...bank, balance: e.target.value })} />}</Field>
            <Field label="CDI anual (%)">{(id) => <Input id={id} inputMode="decimal" value={bank.cdi} onChange={(e) => setBank({ ...bank, cdi: e.target.value })} />}</Field>
            <Field label="Repasse ao cliente (% do CDI)">{(id) => <Input id={id} inputMode="decimal" value={bank.client} onChange={(e) => setBank({ ...bank, client: e.target.value })} />}</Field>
            <Field label="Rendimento da custódia (% do CDI)" hint="O que o banco parceiro paga sobre o saldo." className="sm:col-span-2">
              {(id, describedBy) => <Input id={id} aria-describedby={describedBy} inputMode="decimal" value={bank.custody} onChange={(e) => setBank({ ...bank, custody: e.target.value })} />}
            </Field>
          </div>
          <dl className="grid grid-cols-2 gap-3">
            <Kpi label="Saldo custodiado" value={brl(yieldSim.custody)} />
            <Kpi label="Rendimento ao cliente/mês" value={brl(yieldSim.monthlyClientYield)} />
            <Kpi label="Spread PRX/mês" value={brl(yieldSim.monthlyPrxSpread)} tone={yieldSim.monthlyPrxSpread < 0 ? "negative" : "neutral"} />
            <Kpi label="Spread por conta/mês" value={brl(yieldSim.spreadPerAccount)} note={data ? `Lastro de check-ins: ${brl(behaviorCost)}` : undefined} />
          </dl>
          {data && yieldSim.spreadPerAccount < behaviorCost && (
            <Notice tone="warning">O spread por conta não cobre o lastro dos coins de check-in de um membro assíduo. Reduza os coins de check-in ou revise o repasse.</Notice>
          )}
        </section>
      </div>
    </section>
  );
}

function Kpi({ label, value, note, tone = "neutral" }: { label: string; value: string; note?: string; tone?: "neutral" | "negative" }) {
  return (
    <div className="min-w-0 rounded-2xl glass p-4 sm:p-5">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className={cn("mt-2 truncate text-[22px] font-light leading-tight tracking-[-0.02em] tabular-nums sm:text-[26px]", tone === "negative" ? "text-destructive" : "text-ink")}>{value}</dd>
      {note && <p className="mt-1 truncate text-[12px] text-muted-foreground">{note}</p>}
    </div>
  );
}
