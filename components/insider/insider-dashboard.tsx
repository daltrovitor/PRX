// Hello World
"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { CopyButton } from "@/components/app/pass/voucher-sheet";
import { Button, EmptyState, Notice, Segmented, Tag } from "@/components/app/ui";
import { RequestList, type Tab } from "@/components/insider/request-list";
import { formatPartyDate, sentence } from "@/lib/resenha/format";
import { EDITION_STATUS_LABEL, INSIDER_KIND_LABEL, type Decision, type InsiderEditionView, type InsiderRequestView } from "@/lib/resenha/types";

const REFRESH_MS = 20_000;

const noopSubscribe = () => () => undefined;
/** O menu de compartilhar do sistema só existe no navegador; o servidor renderiza sem ele (sem divergência na hidratação). */
const useCanShare = () => useSyncExternalStore(noopSubscribe, () => typeof navigator.share === "function", () => false);

interface ApiError {
  error?: string;
}

/** PASSes usados: quanto o Insider já liberou da cota dele. */
function PassMeter({ approved, quota }: { approved: number; quota: number }) {
  const percent = quota === 0 ? 100 : Math.min(100, Math.round((approved / quota) * 100));
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[15px] font-medium text-ink">
          {approved} de {quota} PASSes liberados
        </p>
        <p className="text-[13px] text-muted-foreground">{Math.max(0, quota - approved)} restantes</p>
      </div>
      <div role="progressbar" aria-label="PASSes liberados" aria-valuemin={0} aria-valuemax={quota} aria-valuenow={approved} className="h-2 overflow-hidden rounded-full bg-surface">
        <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

/** Link do Insider: copiar e compartilhar (no celular abre o menu de compartilhar do sistema). */
function LinkCard({ edition }: { edition: InsiderEditionView }) {
  const canShare = useCanShare();
  return (
    <section className="glass space-y-3 rounded-3xl p-5 sm:p-6" aria-label="Seu link">
      <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink">Seu link</h2>
      <p className="break-all rounded-2xl bg-surface px-4 py-3 font-mono text-[13px] text-ink">{edition.link}</p>
      <div className="flex flex-wrap gap-2">
        <CopyButton value={edition.link} label="Copiar link" />
        {canShare && (
          <Button variant="secondary" size="sm" onClick={() => void navigator.share({ title: edition.edition.title, url: edition.link }).catch(() => undefined)}>
            Compartilhar
          </Button>
        )}
      </div>
      <p className="text-[13px] leading-relaxed text-muted-foreground">Quem pedir acesso por este link aparece aqui para você decidir.</p>
    </section>
  );
}

/** Painel do Insider: cota, link e os pedidos de cada Resenha em que ele participa. */
export function InsiderDashboard({ editions, onChanged }: { editions: InsiderEditionView[]; onChanged: () => Promise<void> | void }) {
  const [selectedId, setSelectedId] = useState(editions[0]?.participationId ?? "");
  const [tab, setTab] = useState<Tab>("pending");
  const [requests, setRequests] = useState<InsiderRequestView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const current = useMemo(() => editions.find((e) => e.participationId === selectedId) ?? editions[0], [editions, selectedId]);
  const linkId = current?.participationId;

  const load = useCallback(async () => {
    if (!linkId) return;
    try {
      const res = await fetch(`/api/insider/requests?link=${encodeURIComponent(linkId)}`, { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as ApiError & { requests?: InsiderRequestView[] };
      if (!res.ok || !data.requests) throw new Error(data.error || "Não foi possível carregar os pedidos.");
      setRequests(data.requests);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sem internet agora. Confira sua conexão e tente de novo.");
    }
  }, [linkId]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (alive) await load();
    })();
    // Pedidos novos chegam o tempo todo: a lista se atualiza sozinha.
    const timer = setInterval(() => {
      void load();
      void onChanged();
    }, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [load, onChanged]);

  async function decide(id: string, action: Decision) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/insider/requests/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const data = (await res.json().catch(() => ({}))) as ApiError;
      if (!res.ok) setError(data.error || "Não foi possível registrar a decisão.");
    } catch {
      setError("Sem internet agora. Confira sua conexão e tente de novo.");
    } finally {
      setBusyId(null);
      await Promise.all([load(), onChanged()]);
    }
  }

  if (!current) {
    return <EmptyState title="Nenhuma Resenha aberta para você" body="Quando a equipe PRX abrir a lista de uma edição com o seu nome, ela aparece aqui." />;
  }

  const { edition, stats } = current;
  const list = requests ?? [];
  const tabs = {
    pending: list.filter((r) => r.status === "pending"),
    approved: list.filter((r) => r.status === "approved"),
    rejected: list.filter((r) => r.status === "rejected" || r.status === "revoked"),
  };

  return (
    <div className="space-y-6">
      {editions.length > 1 && (
        <Segmented
          label="Resenhas"
          value={current.participationId}
          onChange={(value) => {
            setSelectedId(value);
            setRequests(null);
            setTab("pending");
          }}
          options={editions.map((e) => ({ value: e.participationId, label: `Resenha ${e.edition.slug}` }))}
        />
      )}

      <section className="glass space-y-5 rounded-3xl p-5 sm:p-6">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-ink">{edition.title}</h2>
            <Tag tone={edition.status === "open" ? "success" : "neutral"}>{EDITION_STATUS_LABEL[edition.status]}</Tag>
            <Tag>{INSIDER_KIND_LABEL[current.kind]}</Tag>
          </div>
          <p className="text-[15px] text-muted-foreground">
            {sentence(formatPartyDate(edition.startsAt))} · {edition.city}
          </p>
        </div>
        <PassMeter approved={stats.approved} quota={stats.quota} />
        {edition.status === "closed" && <Notice tone="warning">A lista fechou: não chegam pedidos novos, mas você ainda pode decidir os pendentes.</Notice>}
      </section>

      <LinkCard edition={current} />

      <RequestList
        tab={tab}
        onTab={setTab}
        tabs={tabs}
        loading={requests === null}
        error={error}
        busyId={busyId}
        passesLeft={stats.left}
        onDecide={(id, action) => void decide(id, action)}
        onRefresh={() => void Promise.all([load(), onChanged()])}
      />
    </div>
  );
}
