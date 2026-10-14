// Hello World
"use client";

import { useEffect, useState } from "react";
import { EmptyState, Notice, ProgressBar, Segmented, formatBRL } from "@/components/app/ui";
import type { AgeBandShare, PartnerMetrics } from "@/lib/partners/metrics";
import type { CampaignProgress } from "@/lib/partners/service";
import { formatDateBR } from "@/lib/partners/contract";
import { cn } from "@/lib/utils";

interface MetricsResponse {
  success?: boolean;
  error?: string;
  metrics?: PartnerMetrics;
  campaigns?: CampaignProgress[];
  periodDays?: number;
}

type Period = "30" | "90" | "365";

const pct = (value: number | null) => (value === null ? "—" : `${(value * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const count = (value: number) => value.toLocaleString("pt-BR", { notation: value >= 10_000 ? "compact" : "standard" });

/**
 * Inteligência comercial agregada (cláusulas 11.1, 11.2 e 11.7). Mesma visão
 * para o parceiro e para o admin: contagens e proporções, nunca identidade.
 */
export function MetricsPanel({ endpoint, title = "Métricas" }: { endpoint: string; title?: string }) {
  const [period, setPeriod] = useState<Period>("90");
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const separator = endpoint.includes("?") ? "&" : "?";
    fetch(`${endpoint}${separator}days=${period}`, { cache: "no-store" })
      .then((res) => res.json() as Promise<MetricsResponse>)
      .then((json) => active && setData(json))
      .catch(() => active && setData({ error: "Sem internet agora. Confira sua conexão e tente de novo." }))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [endpoint, period]);

  const metrics = data?.metrics;

  return (
    <section aria-labelledby="metrics-title" className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="metrics-title" className="font-display text-2xl font-semibold tracking-[-0.03em] text-ink">
            {title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Dados agregados. Nenhum membro é identificado.</p>
        </div>
        <Segmented
          label="Período das métricas"
          value={period}
          onChange={(value) => {
            setLoading(true);
            setPeriod(value);
          }}
          options={[
            { value: "30", label: "30 dias" },
            { value: "90", label: "90 dias" },
            { value: "365", label: "12 meses" },
          ]}
          className="sm:border-b-0"
        />
      </div>

      {data?.error && <Notice tone="error">{data.error}</Notice>}
      {!metrics && !data?.error && <div className="h-40 bg-surface" aria-hidden />}

      {metrics && (
        <div className={cn("space-y-10 transition-opacity", loading && "opacity-60")} aria-busy={loading}>
          <StatTiles metrics={metrics} />
          {data?.campaigns && data.campaigns.length > 0 && <CampaignQuota campaigns={data.campaigns} />}
          <div className="grid gap-10 lg:grid-cols-2">
            <AgeBars title="Cliques por faixa etária" rows={metrics.clicksByAge} minGroup={metrics.minGroupSize} total={metrics.clicks} />
            <AgeBars title="Resgates por faixa etária" rows={metrics.redemptionsByAge} minGroup={metrics.minGroupSize} total={metrics.redemptions} />
          </div>
          <HourHistogram values={metrics.validationsByHour} />
          <p className="text-[13px] text-muted-foreground">
            Faixas com menos de {metrics.minGroupSize} pessoas ficam ocultas (e, quando só uma ficaria oculta, a menor seguinte também), para que nenhum membro
            possa ser identificado por exclusão. Vendas estimadas usam o preço PRX das validações.
          </p>
        </div>
      )}
    </section>
  );
}

function StatTiles({ metrics }: { metrics: PartnerMetrics }) {
  const tiles: Array<{ label: string; value: string; hint: string }> = [
    { label: "Exibições", value: count(metrics.impressions), hint: "Vezes que o benefício apareceu no catálogo" },
    { label: "Cliques", value: count(metrics.clicks), hint: "Aberturas da página do benefício" },
    { label: "CTR", value: pct(metrics.ctr), hint: "Cliques ÷ exibições" },
    { label: "Resgates", value: count(metrics.redemptions), hint: "Vouchers gerados" },
    { label: "Conversão", value: pct(metrics.conversion), hint: "Resgates ÷ cliques" },
    { label: "Validações", value: count(metrics.validations), hint: "Vouchers usados no balcão" },
    { label: "Taxa de uso", value: pct(metrics.usageRate), hint: "Validações ÷ resgates" },
    { label: "Vendas estimadas", value: metrics.estimatedSales === null ? "—" : formatBRL(metrics.estimatedSales), hint: "Preço PRX × validações" },
    { label: "Ticket médio", value: metrics.averageTicket === null ? "—" : formatBRL(metrics.averageTicket), hint: "Por validação com preço" },
    { label: "Recorrência", value: pct(metrics.recurrence), hint: "Membros com 2 ou mais resgates" },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-3xl glass p-4">
          <dt className="text-[13px] text-muted-foreground">{tile.label}</dt>
          <dd className="mt-1.5 text-[26px] font-light leading-none tracking-[-0.03em] text-ink [font-feature-settings:'pnum']">{tile.value}</dd>
          <dd className="mt-1.5 text-[12px] leading-snug text-muted-foreground">{tile.hint}</dd>
        </div>
      ))}
    </dl>
  );
}

function CampaignQuota({ campaigns }: { campaigns: CampaignProgress[] }) {
  return (
    <div>
      <h3 className="text-[13px] font-semibold text-ink">Quantidade garantida por campanha</h3>
      <ul className="mt-3 space-y-2">
        {campaigns.map((c) => (
          <li key={c.campaignId} className="space-y-2 rounded-3xl glass-soft p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium text-ink">{c.title}</p>
              <p className="text-[13px] text-muted-foreground">
                {formatDateBR(c.startDate)} a {formatDateBR(c.endDate)}
              </p>
            </div>
            <ProgressBar value={c.redeemed} max={c.quantity} label={`Resgates de ${c.title}`} />
            <p className="text-[13px] text-muted-foreground">
              <span className="font-medium text-ink">{c.redeemed.toLocaleString("pt-BR")}</span> de {c.quantity.toLocaleString("pt-BR")} {c.unit} resgatados ·{" "}
              {c.validated.toLocaleString("pt-BR")} validados no balcão
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AgeBars({ title, rows, minGroup, total }: { title: string; rows: AgeBandShare[]; minGroup: number; total: number }) {
  const visible = rows.filter((row) => row.band !== "nao_informado" || (row.share ?? 0) > 0 || row.suppressed);
  const max = Math.max(0.0001, ...visible.map((row) => row.share ?? 0));
  return (
    <div>
      <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
      {total === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Sem dados no período.</p>
      ) : (
        <table className="mt-3 w-full text-sm">
          <caption className="sr-only">{`${title}, em porcentagem do total de ${total}`}</caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">Faixa</th>
              <th scope="col">Participação</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.band} className="group">
                <th scope="row" className="w-32 py-1.5 pr-3 text-left font-normal text-muted-foreground">
                  {row.label}
                </th>
                <td className="py-1.5">
                  {row.suppressed ? (
                    <span className="text-[13px] text-muted-foreground">Oculto · menos de {minGroup} pessoas</span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="h-3 rounded-full bg-primary transition-opacity group-hover:opacity-80"
                        style={{ width: `${Math.max(((row.share ?? 0) / max) * 100, row.share ? 2 : 0) * 0.8}%` }}
                      />
                      <span className="text-[13px] font-medium text-ink tabular-nums">{pct(row.share)}</span>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function HourHistogram({ values }: { values: number[] }) {
  const [focus, setFocus] = useState<number | null>(null);
  const total = values.reduce((sum, v) => sum + v, 0);
  const max = Math.max(1, ...values);
  const peak = values.indexOf(Math.max(...values));
  const readout = focus === null ? null : `${focus}h–${(focus + 1) % 24}h · ${values[focus]} ${values[focus] === 1 ? "validação" : "validações"}`;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-ink">Validações por horário (Brasília)</h3>
        <p className="min-h-5 text-[13px] text-ink" aria-live="polite">
          {readout ?? (total > 0 ? `Pico às ${peak}h · ${values[peak]} ${values[peak] === 1 ? "validação" : "validações"}` : "")}
        </p>
      </div>
      {total === 0 ? (
        <EmptyState title="Nenhuma validação no período" />
      ) : (
        <>
          <div className="mt-3 flex h-36 items-end gap-[2px] border-b border-line" onPointerLeave={() => setFocus(null)}>
            {values.map((value, hour) => (
              <button
                key={hour}
                type="button"
                aria-label={`${hour}h: ${value} ${value === 1 ? "validação" : "validações"}`}
                onPointerEnter={() => setFocus(hour)}
                onFocus={() => setFocus(hour)}
                onBlur={() => setFocus(null)}
                className="group flex h-full min-w-0 flex-1 cursor-default items-end justify-center focus-visible:outline-none"
              >
                <span
                  className={cn(
                    "block w-full max-w-6 rounded-t-md bg-primary transition-opacity",
                    focus !== null && focus !== hour && "opacity-45",
                    "group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-ring"
                  )}
                  style={{ height: value === 0 ? 0 : `${Math.max(3, (value / max) * 100)}%` }}
                />
              </button>
            ))}
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[12px] text-muted-foreground" aria-hidden>
            {[0, 6, 12, 18, 23].map((h) => (
              <span key={h}>{h}h</span>
            ))}
          </div>
          <details className="mt-3 text-sm">
            <summary className="inline-flex min-h-12 cursor-pointer items-center text-muted-foreground hover:text-ink">Ver em tabela</summary>
            <table className="mt-2 w-full max-w-sm text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[13px] text-muted-foreground">
                  <th scope="col" className="py-1.5 font-medium">Horário</th>
                  <th scope="col" className="py-1.5 text-right font-medium">Validações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {values.map((value, hour) => (
                  <tr key={hour}>
                    <td className="py-1.5 text-ink">
                      {hour}h–{(hour + 1) % 24}h
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-ink">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </div>
  );
}
