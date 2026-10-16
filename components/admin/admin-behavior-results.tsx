// Hello World
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, EmptyState, Notice, Select, Tag, Textarea } from "@/components/app/ui";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { Pager, formatDateTimeBr } from "@/components/admin/pager";
import { adminGet, adminPost, errorText } from "@/components/admin/admin-api";
import { CHANNEL_LABEL, EVALUATION_STATUS_LABEL, MATCH_LABEL, RESULT_LABEL, RESULTS, type BehaviorEvaluation, type BehaviorResult } from "@/lib/behaviors/types";

type Row = BehaviorEvaluation & { memberName: string; memberEmail: string };
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

/** Resultados com o período, a fonte e as evidências; o admin confirma ou corrige (com motivo). */
export function AdminBehaviorResults({ ruleId, ruleName, onlyReview }: { ruleId: string | null; ruleName: string; onlyReview: boolean }) {
  const { showToast } = useConfirmToast();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: Row[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [choice, setChoice] = useState<Record<string, BehaviorResult>>({});

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "25", ...(ruleId ? { ruleId } : {}), ...(onlyReview ? { status: "under_review" } : {}) });
      setData(await adminGet<{ items: Row[]; total: number }>(`/api/admin/behaviors/evaluations?${params}`));
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, [page, ruleId, onlyReview]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (alive) await load();
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  async function review(ev: Row, decision: "confirm" | BehaviorResult) {
    try {
      await adminPost("/api/admin/behaviors", { action: "review", id: ev.id, decision, note: notes[ev.id] ?? "" });
      showToast("success", decision === "confirm" ? "Resultado confirmado." : "Resultado corrigido.");
      await load();
    } catch (err) {
      showToast("error", errorText(err));
    }
  }

  return (
    <section aria-label={`Resultados de ${ruleName}`} className="space-y-3">
      {error && <Notice tone="error">{error}</Notice>}
      {data === null ? (
        <div role="status" aria-label="Carregando" className="h-24 rounded-3xl bg-surface" />
      ) : data.items.length === 0 ? (
        <EmptyState title={onlyReview ? "Nada para revisar" : "Sem resultados ainda"} body={onlyReview ? "Avaliações com sinal fraco (nome parecido) aparecem aqui." : "Use 'Avaliar agora' ou aguarde a avaliação diária."} />
      ) : (
        <ul className="space-y-2">
          {data.items.map((ev) => (
            <li key={ev.id} className="glass-soft space-y-2 rounded-2xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[14px] font-medium text-ink">
                  {ev.memberName} <span className="text-muted-foreground">· {ev.memberEmail}</span>
                </p>
                <span className="flex flex-wrap gap-1.5">
                  <Tag tone={ev.result === "identified" ? "accent" : ev.result === "unverifiable" ? "warning" : "neutral"}>{RESULT_LABEL[ev.result]}</Tag>
                  <Tag tone={ev.status === "under_review" ? "warning" : "neutral"}>{EVALUATION_STATUS_LABEL[ev.status]}</Tag>
                  {ev.rewardApplied && <Tag tone="success">Recompensa creditada</Tag>}
                </span>
              </div>
              <p className="text-[13px] text-muted-foreground">
                Período {date(ev.periodStart)} a {date(ev.periodEnd)} · fonte: conta PRX BANK · {ev.reason}
              </p>
              {ev.evidence.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-[13px] text-primary">{ev.evidence.length} pagamento(s) que basearam o resultado</summary>
                  <ul className="mt-1 space-y-0.5 text-[13px] text-ink">
                    {ev.evidence.map((e) => (
                      <li key={e.outgoingId}>
                        {formatDateTimeBr(e.date)} · {brl(e.amount)} · {CHANNEL_LABEL[e.channel]} · {e.companyName} · {MATCH_LABEL[e.matchedBy]}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {ev.reviewedBy && <p className="text-[12px] text-muted-foreground">Revisado por {ev.reviewedBy} em {formatDateTimeBr(ev.reviewedAt)}{ev.reviewNote ? `: ${ev.reviewNote}` : ""}</p>}
              <div className="flex flex-col gap-2 border-t border-line pt-2 lg:flex-row lg:items-center">
                <Textarea rows={1} value={notes[ev.id] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [ev.id]: e.target.value }))} placeholder="Motivo (obrigatório para corrigir)" aria-label="Motivo da revisão" className="lg:flex-1" />
                <div className="flex flex-wrap gap-2">
                  {ev.status === "under_review" && (
                    <Button size="sm" variant="secondary" onClick={() => void review(ev, "confirm")}>
                      Confirmar
                    </Button>
                  )}
                  <Select value={choice[ev.id] ?? ev.result} onChange={(e) => setChoice((c) => ({ ...c, [ev.id]: e.target.value as BehaviorResult }))} aria-label="Resultado correto" className="w-auto">
                    {RESULTS.map((r) => (
                      <option key={r} value={r}>
                        {RESULT_LABEL[r]}
                      </option>
                    ))}
                  </Select>
                  <Button size="sm" variant="ghost" onClick={() => void review(ev, choice[ev.id] ?? ev.result)}>
                    Corrigir
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {data && data.total > 25 && <Pager page={page} pageSize={25} total={data.total} onPage={setPage} />}
    </section>
  );
}
