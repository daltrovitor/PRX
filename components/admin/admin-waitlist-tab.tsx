// Hello World
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, EmptyState, Field, Input, Notice, Tag } from "@/components/app/ui";
import { IconRefresh } from "@/components/icons/prx-icons";
import type { WaitlistEntry } from "@/lib/waitlist";

/*
 * Lista de Espera VIP (/em-breve e prx.app.br). A tabela waitlist_signups é
 * fechada por RLS, então a aba busca pela rota admin e atualiza sozinha a cada
 * 15 s enquanto está visível. O CSV sai do que está filtrado na tela.
 */

const POLL_MS = 15_000;
const DAY = 86_400_000;
const when = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const clock = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const SOURCE_LABEL: Record<string, string> = { "prx.app.br": "prx.app.br", "em-breve": "/em-breve" };
const sourceLabel = (s: string) => SOURCE_LABEL[s] ?? s;

/** Célula de CSV segura: aspas escapadas e fórmulas neutralizadas (=, +, -, @ viram texto). */
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

function downloadCsv(rows: ReadonlyArray<WaitlistEntry>) {
  const header = ["email", "nome", "origem", "cadastro", "consentimento_lgpd"];
  const lines = rows.map((r) => [r.email, r.name ?? "", sourceLabel(r.source), when.format(new Date(r.createdAt)), r.consentAt].map(csvCell).join(";"));
  // BOM + ";" para o Excel em português abrir acentos e colunas certas.
  const blob = new Blob([`﻿${[header.join(";"), ...lines].join("\r\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `prx-lista-de-espera-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function Kpi({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-3xl glass p-5">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <p className="mt-2 text-[30px] font-light leading-none tracking-[-0.035em] text-ink tabular-nums sm:text-[34px]">{value}</p>
      {detail && <p className="mt-2 text-[13px] text-muted-foreground">{detail}</p>}
    </div>
  );
}

function ConsentTag({ at }: { at: string }) {
  return (
    <Tag tone="success" className="whitespace-nowrap">
      <span aria-hidden>✓</span> LGPD · {when.format(new Date(at)).slice(0, 10)}
    </Tag>
  );
}

export function AdminWaitlistTab({ onCount }: { onCount?: (count: number) => void }) {
  const [signups, setSignups] = useState<WaitlistEntry[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/waitlist", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { signups?: WaitlistEntry[]; count?: number; error?: string };
      if (!res.ok || !Array.isArray(json.signups)) throw new Error(json.error || "Não foi possível carregar a lista de espera.");
      setSignups(json.signups);
      setUpdatedAt(new Date());
      setError(null);
      onCount?.(json.signups.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sem internet agora. Confira sua conexão e tente de novo.");
      setSignups((s) => s ?? []);
    } finally {
      setLoading(false);
    }
  }, [onCount]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!signups || !q) return signups ?? [];
    return signups.filter((s) => s.email.includes(q) || (s.name ?? "").toLowerCase().includes(q));
  }, [signups, query]);

  const stats = useMemo(() => {
    const list = signups ?? [];
    const now = updatedAt?.getTime() ?? 0;
    const since = (ms: number) => list.filter((s) => now - new Date(s.createdAt).getTime() <= ms).length;
    const sources = new Map<string, number>();
    for (const s of list) sources.set(s.source, (sources.get(s.source) ?? 0) + 1);
    return { day: since(DAY), week: since(7 * DAY), sources: [...sources.entries()].sort((a, b) => b[1] - a[1]) };
  }, [signups, updatedAt]);

  return (
    <section aria-labelledby="waitlist-title" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 id="waitlist-title" className="text-lg font-semibold tracking-[-0.02em] text-ink sm:text-xl">
            Lista de Espera
          </h2>
          <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
            Leads do /em-breve e de prx.app.br. A lista se atualiza sozinha a cada 15 segundos enquanto esta aba estiver aberta.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
            <IconRefresh size={16} />
            {loading ? "Atualizando…" : "Recarregar"}
          </Button>
          <Button size="sm" onClick={() => downloadCsv(filtered)} disabled={filtered.length === 0}>
            Exportar CSV ({filtered.length})
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi label="Total de leads" value={(signups?.length ?? 0).toLocaleString("pt-BR")} />
        <Kpi label="Cadastros recentes (24 h)" value={stats.day.toLocaleString("pt-BR")} detail={`${stats.week.toLocaleString("pt-BR")} nos últimos 7 dias`} />
        <div className="rounded-3xl glass p-5">
          <p className="text-[13px] text-muted-foreground">Origem dos cadastros</p>
          {stats.sources.length === 0 ? (
            <p className="mt-2 text-[15px] text-ink">—</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {stats.sources.map(([source, count]) => (
                <li key={source} className="flex items-center justify-between gap-3 text-[15px]">
                  <span className="truncate text-ink">{sourceLabel(source)}</span>
                  <span className="font-medium tabular-nums text-muted-foreground">{count.toLocaleString("pt-BR")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <Field label="Buscar por e-mail ou nome" className="w-full sm:max-w-md">
          {(id) => <Input id={id} type="search" inputMode="search" autoComplete="off" placeholder="ana@exemplo.com" value={query} onChange={(e) => setQuery(e.target.value)} />}
        </Field>
        <p aria-live="polite" className="text-[13px] text-muted-foreground">
          {updatedAt ? `Atualizado às ${clock.format(updatedAt)}` : "Carregando…"}
        </p>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {signups === null ? (
        <div role="status" aria-label="Carregando leads" className="h-32 rounded-3xl bg-surface" />
      ) : filtered.length === 0 ? (
        <EmptyState title={query ? "Nenhum lead encontrado" : "Nenhum lead ainda"} body={query ? "Tente outro e-mail ou nome." : "Quem entrar na Lista VIP pelo /em-breve aparece aqui."} />
      ) : (
        <>
          {/* Celular: cartões. Tablet e desktop: tabela com rolagem própria. */}
          <ul className="space-y-2 md:hidden" aria-label="Leads">
            {filtered.map((s) => (
              <li key={s.email} className="glass-soft rounded-3xl p-4">
                <p className="break-all text-[15px] font-medium text-ink">{s.email}</p>
                {s.name && <p className="mt-0.5 text-[14px] text-muted-foreground">{s.name}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                  <Tag>{sourceLabel(s.source)}</Tag>
                  <span>{when.format(new Date(s.createdAt))}</span>
                  <ConsentTag at={s.consentAt} />
                </div>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-3xl glass md:block">
            <table className="w-full min-w-[720px] text-left text-[14px]">
              <caption className="sr-only">Leads da Lista de Espera</caption>
              <thead>
                <tr className="text-[12px] uppercase tracking-[0.08em] text-muted-foreground">
                  <th scope="col" className="px-5 py-3 font-medium">E-mail</th>
                  <th scope="col" className="px-5 py-3 font-medium">Nome</th>
                  <th scope="col" className="px-5 py-3 font-medium">Origem</th>
                  <th scope="col" className="px-5 py-3 font-medium">Cadastro</th>
                  <th scope="col" className="px-5 py-3 font-medium">Consentimento</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.email} className="border-t border-line">
                    <td className="max-w-[280px] truncate px-5 py-3 font-medium text-ink">{s.email}</td>
                    <td className="px-5 py-3 text-muted-foreground">{s.name || "—"}</td>
                    <td className="px-5 py-3">
                      <Tag>{sourceLabel(s.source)}</Tag>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 tabular-nums text-muted-foreground">{when.format(new Date(s.createdAt))}</td>
                    <td className="px-5 py-3">
                      <ConsentTag at={s.consentAt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
