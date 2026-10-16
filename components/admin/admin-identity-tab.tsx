// Hello World
"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState, Input, Notice, Segmented, Tag } from "@/components/app/ui";
import { Pager, formatDateTimeBr, useDebounced } from "@/components/admin/pager";
import { AdminIdentityDetail } from "@/components/admin/admin-identity-detail";
import type { IdentityFilter, IdentityRow } from "@/lib/kyc/identity-admin";
import { DOC_REVIEW_LABEL, KYC_STATUS_LABEL, RISK_FLAG_LABEL, type RiskFlag } from "@/lib/kyc/types";

const FILTERS: ReadonlyArray<{ value: IdentityFilter; label: string }> = [
  { value: "pending", label: "Em análise" },
  { value: "resubmission", label: "Reenvio pedido" },
  { value: "approved", label: "Aprovadas" },
  { value: "rejected", label: "Recusadas" },
  { value: "all", label: "Todas" },
];

const statusTone = (row: IdentityRow) => (row.status === "approved" ? "success" : row.status === "rejected" ? "warning" : row.resubmissionRequested ? "accent" : "neutral");

/**
 * Verificação de identidade da PRX (abertura do PRX BANK). A equipe confere
 * cada documento e a selfie, recusa com motivo ou pede reenvio, e aprova a
 * identidade explicitamente. Só depois disso a conta segue ao banco parceiro.
 */
export function AdminIdentityTab() {
  const [filter, setFilter] = useState<IdentityFilter>("pending");
  const [query, setQuery] = useState("");
  const q = useDebounced(query);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: IdentityRow[]; total: number; pendingCount: number; pageSize: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const params = new URLSearchParams({ status: filter, q, page: String(page), pageSize: "20" });
      const res = await fetch(`/api/admin/bank/identity?${params}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { items?: IdentityRow[]; total?: number; pendingCount?: number; pageSize?: number; error?: string };
      if (!res.ok || !json.items) throw new Error(json.error || "Não foi possível carregar a fila.");
      setData({ items: json.items, total: json.total ?? 0, pendingCount: json.pendingCount ?? 0, pageSize: json.pageSize ?? 20 });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sem internet agora. Confira sua conexão e tente de novo.");
    } finally {
      setBusy(false);
    }
  }, [filter, q, page]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (alive) await load();
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  return (
    <section aria-labelledby="identity-title" className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 id="identity-title" className="text-lg font-semibold tracking-[-0.02em] text-ink sm:text-xl">
            Identidade {data && data.pendingCount > 0 ? <span className="text-primary">· {data.pendingCount} em análise</span> : null}
          </h2>
          <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
            Confira cada documento e a selfie contra os dados da pessoa. Recuse com o motivo (ela vê o texto e reenvia só aquele arquivo). A conta só segue para o banco
            parceiro depois da sua aprovação.
          </p>
        </div>
        <Segmented
          label="Filtro da análise"
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setPage(1);
          }}
          options={FILTERS.map((f) => ({ value: f.value, label: f.label }))}
        />
      </div>

      <Input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setPage(1);
        }}
        placeholder="Buscar por nome, e-mail ou CPF"
        aria-label="Buscar abertura por nome, e-mail ou CPF"
        className="max-w-md"
      />

      {error && <Notice tone="error">{error}</Notice>}

      {data === null ? (
        <div role="status" aria-label="Carregando" className="h-32 rounded-3xl bg-surface" />
      ) : data.items.length === 0 ? (
        <EmptyState title={filter === "pending" ? "Nenhuma abertura para analisar" : "Nenhuma abertura encontrada"} body="Quem abre a conta na aba PRX BANK aparece aqui." />
      ) : (
        <ul className="space-y-3" aria-busy={busy}>
          {data.items.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => setOpenId(row.id)}
                className="glass-soft flex w-full cursor-pointer flex-col gap-3 rounded-3xl p-5 text-left transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="min-w-0 space-y-1">
                  <span className="block truncate text-[16px] font-semibold text-ink">{row.fullName}</span>
                  <span className="block truncate text-[13px] text-muted-foreground">
                    {row.email} · CPF {row.cpfMasked} · {row.age} anos · enviada {formatDateTimeBr(row.createdAt)}
                  </span>
                  <span className="flex flex-wrap gap-1.5 pt-1">
                    {row.documents.map((d) => (
                      <Tag key={d.kind} tone={d.status === "approved" ? "success" : d.status === "rejected" || d.status === "missing" ? "warning" : "neutral"}>
                        {d.label}: {DOC_REVIEW_LABEL[d.status]}
                      </Tag>
                    ))}
                    {row.riskFlags.map((f) => (
                      <Tag key={f} tone="accent">
                        {RISK_FLAG_LABEL[f as RiskFlag]?.split(" — ")[0] ?? f}
                      </Tag>
                    ))}
                  </span>
                </span>
                <Tag tone={statusTone(row)}>{row.resubmissionRequested ? "Reenvio pedido" : KYC_STATUS_LABEL[row.status]}</Tag>
              </button>
            </li>
          ))}
        </ul>
      )}

      {data && data.total > data.pageSize && <Pager page={page} pageSize={data.pageSize} total={data.total} onPage={setPage} busy={busy} />}

      {openId && <AdminIdentityDetail key={openId} id={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </section>
  );
}
