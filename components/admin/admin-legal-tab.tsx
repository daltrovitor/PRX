// Hello World
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, Field, Notice, ProgressBar, Segmented, Select } from "@/components/app/ui";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { LegalItemCard, STATUS_STYLE, type LegalCardVariant, type LegalPatchInput } from "@/components/admin/legal-item-card";
import { cn } from "@/lib/utils";
import { LEGAL_MODULES, LEGAL_STATUSES, MODULE_LABEL, STATUS_LABEL, type LegalChecklistItem, type LegalModule, type LegalPriority, type LegalSection, type LegalStatus } from "@/lib/legal/checklist-data";
import type { LegalMetrics, LegalPersistence } from "@/lib/legal/checklist-store";

/*
 * Compliance & Jurídico: o "PRX — Checklist Jurídico e Regulatório" item a item.
 * Progresso geral, alerta de bloqueadores, filtros (prioridade, status, módulo) e
 * três visões: matriz e frentes, os documentos pré-lançamento e o Mapa do Dinheiro.
 */

interface LegalState {
  items: LegalChecklistItem[];
  metrics: LegalMetrics;
  persistence: LegalPersistence;
}

const VARIANT: Record<LegalSection, LegalCardVariant> = { checklist: "item", documentos: "document", dinheiro: "question" };

function Counter({ label, value, status }: { label: string; value: number; status: LegalStatus }) {
  return (
    <div className={cn("rounded-2xl px-4 py-3", STATUS_STYLE[status])}>
      <p className="text-[12px] font-medium">{label}</p>
      <p className="mt-1 text-[24px] font-semibold leading-none tabular-nums">{value}</p>
    </div>
  );
}

export function AdminLegalTab({ onMetrics }: { onMetrics?: (metrics: LegalMetrics) => void }) {
  const { showToast } = useConfirmToast();
  const [state, setState] = useState<LegalState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<LegalSection>("checklist");
  const [priority, setPriority] = useState<LegalPriority | "all">("all");
  const [status, setStatus] = useState<LegalStatus | "all">("all");
  const [module, setModule] = useState<LegalModule | "all">("all");

  const apply = useCallback(
    (next: LegalState) => {
      setState(next);
      onMetrics?.(next.metrics);
    },
    [onMetrics]
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/legal", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as Partial<LegalState> & { error?: string };
      if (!res.ok || !json.items || !json.metrics || !json.persistence) throw new Error(json.error || "Não foi possível carregar o checklist.");
      apply({ items: json.items, metrics: json.metrics, persistence: json.persistence });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sem internet agora. Confira sua conexão e tente de novo.");
    }
  }, [apply]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  /** Salva com retorno imediato na tela; se o servidor recusar, volta ao estado anterior. */
  const patch = useCallback(
    async (id: string, changes: LegalPatchInput): Promise<boolean> => {
      const previous = state;
      if (previous) setState({ ...previous, items: previous.items.map((i) => (i.id === id ? { ...i, ...changes } : i)) });
      try {
        const res = await fetch("/api/admin/legal", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...changes }) });
        const json = (await res.json().catch(() => ({}))) as Partial<LegalState> & { error?: string };
        if (!res.ok || !json.items || !json.metrics || !json.persistence) throw new Error(json.error || "Não foi possível salvar.");
        apply({ items: json.items, metrics: json.metrics, persistence: json.persistence });
        if (changes.status) showToast("success", `Status: ${STATUS_LABEL[changes.status]}.`);
        else showToast("success", "Salvo.");
        return true;
      } catch (err) {
        if (previous) setState(previous);
        showToast("error", err instanceof Error ? err.message : "Sem internet agora. Confira sua conexão e tente de novo.");
        return false;
      }
    },
    [state, apply, showToast]
  );

  const visible = useMemo(() => {
    if (!state) return [];
    return state.items.filter(
      (i) => i.section === view && (priority === "all" || i.priority === priority) && (status === "all" || i.status === status) && (module === "all" || i.module === module)
    );
  }, [state, view, priority, status, module]);

  const groups = useMemo(() => {
    const map = new Map<string, LegalChecklistItem[]>();
    for (const item of visible) map.set(item.category, [...(map.get(item.category) ?? []), item]);
    return [...map.entries()];
  }, [visible]);

  if (!state) {
    return error ? <Notice tone="error">{error}</Notice> : <div role="status" aria-label="Carregando checklist" className="h-40 rounded-3xl bg-surface" />;
  }

  const { metrics, items } = state;
  const blockers = items.filter((i) => i.status === "blocker");
  const docs = items.filter((i) => i.section === "documentos");
  const answers = items.filter((i) => i.section === "dinheiro");

  return (
    <section aria-labelledby="legal-title" className="space-y-6">
      <div>
        <h2 id="legal-title" className="text-lg font-semibold tracking-[-0.02em] text-ink sm:text-xl">
          Compliance & Jurídico
        </h2>
        <p className="mt-1 max-w-3xl text-[13px] text-muted-foreground">
          PRX — Checklist Jurídico e Regulatório. Documento de trabalho: cada item deve ser validado pelo advogado responsável antes do lançamento.
        </p>
      </div>

      {state.persistence === "memory" && (
        <Notice tone="warning">
          O andamento está só na memória do servidor e se perde ao reiniciar. Aplique a migração <code className="break-all">supabase/migrations/20261001_prx_admin_legal_checklist.sql</code> para salvar no banco.
        </Notice>
      )}

      <div className="space-y-4 rounded-3xl glass p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[13px] text-muted-foreground">Conformidade geral</p>
            <p className="mt-1 text-[40px] font-light leading-none tracking-[-0.04em] text-ink tabular-nums">{metrics.percentDone}%</p>
          </div>
          <p className="text-[13px] text-muted-foreground">
            {metrics.done} de {metrics.total} concluídos · <span className="font-medium text-ink">{metrics.criticalOpen} críticos em aberto</span>
          </p>
        </div>
        <ProgressBar value={metrics.percentDone} label="Conformidade do checklist jurídico" tone="success" />
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Counter label="Concluídos" value={metrics.done} status="done" />
          <Counter label="Em validação" value={metrics.inReview} status="in_review" />
          <Counter label="Pendentes" value={metrics.pending} status="pending" />
          <Counter label="Bloqueadores" value={metrics.blockers} status="blocker" />
        </div>
      </div>

      {blockers.length > 0 && (
        <Notice tone="error">
          <p className="font-semibold">
            {blockers.length === 1 ? "1 bloqueador de lançamento" : `${blockers.length} bloqueadores de lançamento`}
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {blockers.map((b) => (
              <li key={b.id}>{b.title}</li>
            ))}
          </ul>
        </Notice>
      )}

      <Segmented
        label="Visão do checklist"
        value={view}
        onChange={setView}
        options={[
          { value: "checklist", label: "Matriz e frentes", count: items.filter((i) => i.section === "checklist" && i.status !== "done").length },
          { value: "documentos", label: `Documentos ${docs.filter((d) => d.status === "done").length}/${docs.length}` },
          { value: "dinheiro", label: `Mapa do Dinheiro ${answers.filter((a) => a.notes.trim()).length}/${answers.length}` },
        ]}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Prioridade">
          {(id) => (
            <Select id={id} value={priority} onChange={(e) => setPriority(e.target.value as LegalPriority | "all")}>
              <option value="all">Todas</option>
              <option value="CRITICA">Crítica</option>
              <option value="ALTA">Alta</option>
              <option value="MEDIA">Média</option>
            </Select>
          )}
        </Field>
        <Field label="Status">
          {(id) => (
            <Select id={id} value={status} onChange={(e) => setStatus(e.target.value as LegalStatus | "all")}>
              <option value="all">Todos</option>
              {LEGAL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Módulo">
          {(id) => (
            <Select id={id} value={module} onChange={(e) => setModule(e.target.value as LegalModule | "all")}>
              <option value="all">Todos</option>
              {LEGAL_MODULES.map((m) => (
                <option key={m} value={m}>
                  {MODULE_LABEL[m]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {visible.length === 0 ? (
        <EmptyState title="Nenhum item com esses filtros" body="Troque a prioridade, o status ou o módulo." />
      ) : (
        <div className="space-y-8">
          {groups.map(([category, list]) => (
            <div key={category} className="space-y-3">
              <h3 className="text-[15px] font-semibold text-ink">{category}</h3>
              <ul className={cn("grid grid-cols-1 gap-3", view === "documentos" ? "md:grid-cols-2 xl:grid-cols-3" : "lg:grid-cols-2")}>
                {list.map((item) => (
                  <li key={item.id} className="min-w-0">
                    <LegalItemCard item={item} variant={VARIANT[view]} onPatch={patch} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
