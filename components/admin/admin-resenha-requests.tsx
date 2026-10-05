// Hello World
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, EmptyState, Notice, Segmented, Sheet, Tag } from "@/components/app/ui";
import type { AdminEditionView, AdminRequestView } from "@/lib/resenha/admin";
import { formatShort } from "@/lib/resenha/format";
import { REQUEST_STATUS_LABEL, type Decision, type RequestStatus } from "@/lib/resenha/types";

type Filter = "all" | RequestStatus;

/** Todos os pedidos da edição. O admin decide no lugar do Insider (e passa da cota dele, se precisar). */
export function RequestsSheet({ edition, onClose, onDecide }: { edition: AdminEditionView; onClose: () => void; onDecide: (requestId: string, decision: Decision) => Promise<string | null> }) {
  const [requests, setRequests] = useState<AdminRequestView[] | null>(null);
  const [filter, setFilter] = useState<Filter>("pending");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/resenha?edition=${encodeURIComponent(edition.id)}`, { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as { requests?: AdminRequestView[]; error?: string };
      if (!res.ok || !data.requests) throw new Error(data.error || "Não foi possível carregar os pedidos.");
      setRequests(data.requests);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sem conexão.");
    }
  }, [edition.id]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (alive) await load();
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  async function decide(id: string, decision: Decision) {
    setBusyId(id);
    const failure = await onDecide(id, decision);
    setError(failure);
    await load();
    setBusyId(null);
  }

  const all = requests ?? [];
  const shown = filter === "all" ? all : all.filter((r) => r.status === filter);
  const count = (status: RequestStatus) => all.filter((r) => r.status === status).length;

  return (
    <Sheet open onClose={onClose} title={`Pedidos · ${edition.title}`} description={`${all.length} pedidos no total. Aqui você decide no lugar de qualquer Insider.`} size="lg">
      <div className="space-y-4">
        <Segmented
          label="Filtrar pedidos"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "pending", label: "Pendentes", count: count("pending") },
            { value: "approved", label: "Na lista", count: count("approved") },
            { value: "rejected", label: "Ainda não", count: count("rejected") },
            { value: "revoked", label: "Removidos", count: count("revoked") },
            { value: "all", label: "Todos", count: all.length },
          ]}
        />
        {error && <Notice tone="error">{error}</Notice>}
        {requests === null ? (
          <p className="text-[15px] text-muted-foreground">Carregando pedidos…</p>
        ) : shown.length === 0 ? (
          <EmptyState title="Nenhum pedido aqui" body="Os pedidos aparecem conforme chegam pelos links dos Insiders." />
        ) : (
          <ul className="space-y-2">
            {shown.map((r) => (
              <li key={r.id} className="flex flex-col gap-3 rounded-3xl bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium text-ink">
                    <span className="truncate">{r.name}</span>
                    <Tag tone={r.status === "approved" ? "success" : r.status === "pending" ? "accent" : "neutral"}>{REQUEST_STATUS_LABEL[r.status]}</Tag>
                    {r.checkedIn && <Tag tone="success">Entrou</Tag>}
                  </p>
                  <p className="truncate text-[13px] text-muted-foreground">
                    {r.email}
                    {r.instagram ? ` · @${r.instagram}` : ""} · via {r.insiderName} · {formatShort(r.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {r.status === "pending" && (
                    <>
                      <Button size="sm" disabled={busyId !== null} onClick={() => void decide(r.id, "approve")}>
                        Liberar
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busyId !== null} onClick={() => void decide(r.id, "reject")}>
                        Ainda não
                      </Button>
                    </>
                  )}
                  {r.status === "approved" && !r.checkedIn && (
                    <Button size="sm" variant="danger" disabled={busyId !== null} onClick={() => window.confirm(`Remover ${r.name} da lista?`) && void decide(r.id, "revoke")}>
                      Remover
                    </Button>
                  )}
                  {(r.status === "rejected" || r.status === "revoked") && (
                    <Button size="sm" variant="secondary" disabled={busyId !== null} onClick={() => void decide(r.id, "approve")}>
                      Liberar
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
