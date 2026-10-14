// Hello World
"use client";

import { useCallback, useEffect, useState } from "react";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { Button, EmptyState, Input, Notice, Segmented, Tag } from "@/components/app/ui";
import { CLAIM_STATUS_LABEL, type BehaviorClaim, type ClaimStatus } from "@/lib/points/types";

const when = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

type Filter = ClaimStatus | "all";

/**
 * Fila de análise de bom comportamento. Nenhum coin de comportamento entra
 * sem passar por aqui: aprovar credita os coins e o XP congelados no envio;
 * recusar não credita nada e libera o membro para enviar de novo.
 */
export function AdminClaimsQueue({ onDecided }: { onDecided?: () => void }) {
  const { showToast } = useConfirmToast();
  const [filter, setFilter] = useState<Filter>("pending");
  const [claims, setClaims] = useState<BehaviorClaim[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async (status: Filter) => {
    try {
      const res = await fetch(`/api/admin/points/claims?status=${status}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { claims?: BehaviorClaim[]; error?: string };
      if (!res.ok || !json.claims) throw new Error(json.error || "Não foi possível carregar a fila.");
      setClaims(json.claims);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sem internet agora. Confira sua conexão e tente de novo.");
      setClaims((c) => c ?? []);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (alive) await load(filter);
    })();
    return () => {
      alive = false;
    };
  }, [load, filter]);

  async function decide(claim: BehaviorClaim, decision: "approve" | "reject") {
    setBusy(claim.id);
    try {
      const res = await fetch("/api/admin/points/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: claim.id, decision, note: notes[claim.id] ?? "" }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Não foi possível registrar a decisão.");
      showToast("success", decision === "approve" ? `Aprovado: +${claim.coins} coins e +${claim.xp} XP para ${claim.userName || "o membro"}.` : "Envio recusado.");
      await load(filter);
      onDecided?.();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Sem internet agora. Confira sua conexão e tente de novo.");
    } finally {
      setBusy(null);
    }
  }

  const pending = claims?.filter((c) => c.status === "pending").length ?? 0;

  return (
    <section aria-labelledby="claims-title" className="glass space-y-4 rounded-3xl p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 id="claims-title" className="text-lg font-semibold tracking-[-0.02em] text-ink">
            Análise de bom comportamento {filter === "pending" && pending > 0 ? <span className="text-primary">· {pending}</span> : null}
          </h3>
          <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
            Coins de comportamento só entram depois da sua aprovação. Compras em parceiros via Pix creditam sozinhas, porque já chegam validadas pelo banco.
          </p>
        </div>
        <Segmented
          label="Filtro da análise"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "pending", label: "Em análise" },
            { value: "approved", label: "Aprovados" },
            { value: "rejected", label: "Recusados" },
            { value: "all", label: "Todos" },
          ]}
        />
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {claims === null ? (
        <div role="status" aria-label="Carregando" className="h-24 rounded-2xl bg-surface" />
      ) : claims.length === 0 ? (
        <EmptyState title={filter === "pending" ? "Nada para analisar" : "Nenhum envio"} body="Os relatos enviados pelos membros aparecem aqui." />
      ) : (
        <ul className="space-y-2">
          {claims.map((claim) => (
            <li key={claim.id} className="space-y-3 rounded-2xl glass-soft p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-ink">{claim.ruleTitle}</p>
                  <p className="text-[13px] text-muted-foreground">
                    {claim.userName || "Membro"} · {claim.userEmail} · {when.format(new Date(claim.createdAt)).replace(".", "")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-ink">
                    +{claim.coins} coins · +{claim.xp} XP
                  </span>
                  <Tag tone={claim.status === "approved" ? "success" : claim.status === "rejected" ? "warning" : "neutral"}>{CLAIM_STATUS_LABEL[claim.status]}</Tag>
                </div>
              </div>
              <blockquote className="rounded-xl bg-card px-4 py-3 text-[14px] leading-relaxed text-ink">{claim.evidence}</blockquote>
              {claim.status === "pending" ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <label htmlFor={`note-${claim.id}`} className="sr-only">
                    Observação para o membro
                  </label>
                  <Input
                    id={`note-${claim.id}`}
                    value={notes[claim.id] ?? ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [claim.id]: e.target.value }))}
                    placeholder="Observação para o membro (opcional)"
                    maxLength={280}
                    className="sm:flex-1"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" className="min-h-12" disabled={busy !== null} onClick={() => void decide(claim, "approve")}>
                      {busy === claim.id ? "Salvando…" : "Aprovar"}
                    </Button>
                    <Button size="sm" variant="danger" className="min-h-12" disabled={busy !== null} onClick={() => void decide(claim, "reject")}>
                      Recusar
                    </Button>
                  </div>
                </div>
              ) : (
                claim.reviewNote && <p className="text-[13px] text-muted-foreground">Observação: {claim.reviewNote}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
