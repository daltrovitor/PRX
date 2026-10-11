// Hello World
"use client";

import { useEffect, useState } from "react";
import { Button, Notice, formatBRL } from "@/components/app/ui";
import { IconRefresh } from "@/components/icons/prx-icons";
import { formatDateTimeBr } from "@/components/admin/pager";
import type { AdminOverview as Overview } from "@/lib/admin/overview";

/** Indicadores operacionais contados no servidor (nada de carregar a base inteira). */
export function AdminOverview() {
  const [data, setData] = useState<{ overview: Overview; migration: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/overview", { cache: "no-store" })
      .then((r) => r.json() as Promise<{ overview?: Overview; migration?: string | null; error?: string }>)
      .then((json) => {
        if (!active) return;
        if (json.overview) {
          setData({ overview: json.overview, migration: json.migration ?? null });
          setError(null);
        } else setError(json.error || "Não foi possível carregar os indicadores.");
      })
      .catch(() => active && setError("Sem conexão com o servidor."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [reload]);

  const o = data?.overview;
  const groups = o
    ? [
        {
          title: "Usuários",
          items: [
            { label: "Membros", value: o.members.total.toLocaleString("pt-BR") },
            { label: "Novos em 7 dias", value: o.members.last7d.toLocaleString("pt-BR") },
            { label: "Novos em 30 dias", value: o.members.last30d.toLocaleString("pt-BR") },
            { label: "Lista de espera", value: o.waitlist.toLocaleString("pt-BR") },
          ],
        },
        {
          title: "PRX LIVE (30 dias)",
          items: [
            { label: "Eventos por vir", value: String(o.live.upcomingEvents) },
            { label: "Ingressos confirmados", value: o.live.ticketsConfirmed30d.toLocaleString("pt-BR") },
            { label: "Aguardando pagamento", value: o.live.pendingPayment30d.toLocaleString("pt-BR") },
            { label: "Receita confirmada", value: formatBRL(o.live.revenue30d) },
          ],
        },
        {
          title: "PRX PASS",
          items: [
            { label: "Parceiros ativos", value: String(o.partners.active) },
            { label: "Vouchers válidos", value: o.vouchers.valid.toLocaleString("pt-BR") },
            { label: "Vouchers utilizados", value: o.vouchers.used.toLocaleString("pt-BR") },
          ],
        },
      ]
    : [];

  return (
    <section aria-labelledby="overview-title" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="overview-title" className="font-display text-2xl font-semibold tracking-[-0.03em] text-ink">
            Visão geral
          </h2>
          {o && <p className="mt-1 text-sm text-muted-foreground">Atualizado em {formatDateTimeBr(o.generatedAt)}. Testes e simulações não entram nos números.</p>}
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setLoading(true);
            setReload((r) => r + 1);
          }}
          disabled={loading}
        >
          <IconRefresh size={16} />
          {loading ? "Atualizando…" : "Atualizar"}
        </Button>
      </div>
      {data?.migration && <Notice tone="warning">{data.migration} Até lá, filtros, auditoria e recursos novos ficam limitados.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      {!o && !error && <div role="status" aria-label="Carregando indicadores" className="h-48 rounded-3xl bg-surface" />}
      {groups.map((group) => (
        <div key={group.title} className="space-y-3">
          <h3 className="text-[13px] font-semibold text-muted-foreground">{group.title}</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {group.items.map((kpi) => (
              <div key={kpi.label} className="rounded-3xl glass p-5">
                <p className="text-[13px] text-muted-foreground">{kpi.label}</p>
                <p className="mt-2 text-[28px] font-light leading-none tracking-[-0.035em] text-ink tabular-nums">{kpi.value}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
