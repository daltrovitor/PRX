// Hello World
"use client";

import { useCallback, useEffect, useState } from "react";
import { CopyButton } from "@/components/app/pass/voucher-sheet";
import { Button, EmptyState, Input, Notice, Segmented, Tag } from "@/components/app/ui";
import { EditionSheet, InsiderSheet, type EditionPayload, type InsiderPayload } from "@/components/admin/admin-resenha-forms";
import { RequestsSheet } from "@/components/admin/admin-resenha-requests";
import type { AdminEditionView, AdminOverview, AdminParticipationView } from "@/lib/resenha/admin";
import { formatDateTime } from "@/lib/live/format";
import { EDITION_STATUS_LABEL, EDITION_STATUSES, INSIDER_KIND_LABEL, type Decision, type EditionStatus } from "@/lib/resenha/types";

type Response = Partial<AdminOverview> & { success?: boolean; error?: string; temporaryPassword?: string | null };
type Sheet = { kind: "edition"; edition: AdminEditionView | null } | { kind: "insider"; edition: AdminEditionView } | { kind: "requests"; edition: AdminEditionView };

async function call(init?: RequestInit): Promise<{ ok: boolean; data: Response }> {
  try {
    const res = await fetch("/api/admin/resenha", { cache: "no-store", ...init });
    return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Response };
  } catch {
    return { ok: false, data: { error: "Sem internet agora. Confira sua conexão e tente de novo." } };
  }
}

const post = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

function InsiderRow({ p, busy, onQuota, onToggle }: { p: AdminParticipationView; busy: boolean; onQuota: (quota: number) => void; onToggle: () => void }) {
  const [quota, setQuota] = useState(String(p.quota));
  const paused = !p.active || !p.insider.active;
  return (
    <li className="flex flex-col gap-3 rounded-3xl bg-surface px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0 space-y-1">
        <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium text-ink">
          <span className="truncate">{p.insider.name}</span>
          <Tag>{INSIDER_KIND_LABEL[p.kind]}</Tag>
          {paused && <Tag tone="warning">Pausado</Tag>}
        </p>
        <p className="truncate text-[13px] text-muted-foreground">
          {p.insider.email}
          {p.insider.handle ? ` · @${p.insider.handle}` : ""}
        </p>
        <p className="text-[13px] text-muted-foreground">
          {p.stats.approved}/{p.stats.quota} liberados · {p.stats.pending} pendentes · {p.stats.rejected} ainda não
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <CopyButton value={p.link} label="Copiar link" />
        <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
          Cota
          <Input
            type="number"
            min={0}
            max={500}
            inputMode="numeric"
            aria-label={`Cota de PASSes de ${p.insider.name}`}
            className="h-12 w-20 px-3"
            value={quota}
            disabled={busy}
            onChange={(e) => setQuota(e.target.value)}
            onBlur={() => {
              const next = Number(quota);
              if (Number.isInteger(next) && next !== p.quota) onQuota(next);
              else setQuota(String(p.quota));
            }}
          />
        </label>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onToggle}>
          {p.active ? "Pausar" : "Reativar"}
        </Button>
      </div>
    </li>
  );
}

function EditionCard({
  edition,
  busy,
  onStatus,
  onSheet,
  onQuota,
  onToggle,
}: {
  edition: AdminEditionView;
  busy: boolean;
  onStatus: (status: EditionStatus) => void;
  onSheet: (sheet: Sheet) => void;
  onQuota: (participationId: string, quota: number) => void;
  onToggle: (participation: AdminParticipationView) => void;
}) {
  const { event } = edition;
  const pending = edition.participations.reduce((sum, p) => sum + p.stats.pending, 0);
  return (
    <article className="glass space-y-5 rounded-3xl p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <h3 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-[-0.02em] text-ink">
            {edition.headline}
            {event.status === "cancelled" && <Tag tone="warning">Evento cancelado</Tag>}
          </h3>
          <p className="text-[13px] text-muted-foreground">
            {formatDateTime(event.startsAt)} · {event.venue || "Local a definir"} · {event.city}
          </p>
          <p className="text-[13px] text-muted-foreground">
            {event.issued}
            {event.capacity ? ` de ${event.capacity}` : ""} liberados · {event.checkedIn} entraram · {pending} pedidos pendentes
          </p>
          <p className="text-[13px]">
            {event.readiness.operational ? (
              <span className="text-success">Pronto para operar (teste de portaria feito).</span>
            ) : event.readiness.publishable ? (
              <span className="text-muted-foreground">Falta o teste de portaria: emita um ingresso de teste em PRX LIVE → Simulação.</span>
            ) : (
              <span className="text-destructive">Para abrir a lista, preencha: {event.readiness.missing.join(", ")}.</span>
            )}
          </p>
          <p className="break-all pt-1 font-mono text-[12px] text-muted-foreground">/resenha/{edition.slug}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => onSheet({ kind: "requests", edition })}>
            Ver pedidos
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onSheet({ kind: "edition", edition })}>
            Editar
          </Button>
          <Button size="sm" onClick={() => onSheet({ kind: "insider", edition })}>
            Adicionar Insider
          </Button>
        </div>
      </div>

      <Segmented
        label={`Situação da lista de ${edition.title}`}
        value={edition.status}
        onChange={onStatus}
        options={EDITION_STATUSES.map((s) => ({ value: s, label: EDITION_STATUS_LABEL[s] }))}
      />

      {edition.participations.length === 0 ? (
        <Notice>Nenhum Insider nesta edição ainda. Cada Insider recebe um link próprio e uma cota de PASSes.</Notice>
      ) : (
        <ul className="space-y-2">
          {edition.participations.map((p) => (
            <InsiderRow key={`${p.id}:${p.quota}:${p.active}`} p={p} busy={busy} onQuota={(quota) => onQuota(p.id, quota)} onToggle={() => onToggle(p)} />
          ))}
        </ul>
      )}
    </article>
  );
}

/** Resenha da…: edições com Host, Insiders com cota e link, e os pedidos de acesso. */
export function AdminResenhaTab() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);

  const apply = useCallback((data: Response) => {
    if (data.editions && data.insiders) setOverview({ editions: data.editions, insiders: data.insiders });
  }, []);

  const load = useCallback(async () => {
    const { ok, data } = await call();
    if (!ok) return setError(data.error || "Não foi possível carregar a Resenha.");
    setError(null);
    apply(data);
  }, [apply]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (alive) await load();
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  /** Envia uma ação; devolve a mensagem de erro (ou null) para o formulário que a chamou. */
  async function act(body: unknown): Promise<{ failure: string | null; data: Response }> {
    setBusy(true);
    const { ok, data } = await call(post(body));
    setBusy(false);
    if (!ok) return { failure: data.error || "Não foi possível salvar.", data };
    apply(data);
    return { failure: null, data };
  }

  async function quick(body: unknown) {
    const { failure } = await act(body);
    setError(failure);
  }

  async function saveEdition(edition: AdminEditionView | null, payload: EditionPayload) {
    const { failure } = await act(edition ? { action: "update_edition", id: edition.id, edition: payload } : { action: "create_edition", edition: payload });
    setFormError(failure);
    if (!failure) setSheet(null);
  }

  async function saveInsider(edition: AdminEditionView, payload: InsiderPayload) {
    const { failure, data } = await act({ action: "add_insider", editionId: edition.id, insider: payload });
    setFormError(failure);
    if (failure) return;
    setSheet(null);
    setCredentials(data.temporaryPassword ? { email: payload.email, password: data.temporaryPassword } : null);
  }

  const openSheet = (next: Sheet) => {
    setFormError(null);
    setSheet(next);
  };

  return (
    <section aria-labelledby="resenha-title" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="resenha-title" className="font-display text-2xl font-semibold tracking-[-0.03em] text-ink">
            Resenha da…
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Cada edição tem um Host e os Insiders dele. O Insider recebe um link com cota de PASSes e libera ou recusa quem pedir acesso. O ingresso é gratuito e sai na hora, e a portaria da
            equipe PRX valida na porta.
          </p>
        </div>
        <Button onClick={() => openSheet({ kind: "edition", edition: null })}>Nova edição</Button>
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      {credentials && (
        <Notice tone="success">
          <span className="block font-medium">Acesso criado para {credentials.email}</span>
          <span className="mt-1 block">
            Senha temporária (aparece só agora): <span className="font-mono">{credentials.password}</span>
          </span>
          <span className="mt-1 block text-[13px]">O Insider entra em insider.prx.app.br com este e-mail e esta senha. O app ainda não tem troca de senha pelo próprio usuário: se ele esquecer, a redefinição é pelo suporte.</span>
          <span className="mt-2 flex flex-wrap gap-2">
            <CopyButton value={credentials.password} label="Copiar senha" />
            <Button size="sm" variant="ghost" onClick={() => setCredentials(null)}>
              Já anotei
            </Button>
          </span>
        </Notice>
      )}

      {overview === null && !error ? (
        <p className="text-[15px] text-muted-foreground">Carregando…</p>
      ) : overview && overview.editions.length === 0 ? (
        <EmptyState title="Nenhuma Resenha criada" body="Crie a primeira edição: Host, data e local. Depois adicione os Insiders e abra a lista." action={<Button onClick={() => openSheet({ kind: "edition", edition: null })}>Nova edição</Button>} />
      ) : (
        <div className="space-y-5">
          {overview?.editions.map((edition) => (
            <EditionCard
              key={edition.id}
              edition={edition}
              busy={busy}
              onStatus={(status) => void quick({ action: "set_status", id: edition.id, status })}
              onSheet={openSheet}
              onQuota={(id, quota) => void quick({ action: "update_participation", id, quota })}
              onToggle={(p) => void quick({ action: "update_participation", id: p.id, active: !p.active })}
            />
          ))}
        </div>
      )}

      {sheet?.kind === "edition" && <EditionSheet edition={sheet.edition} busy={busy} error={formError} onClose={() => setSheet(null)} onSave={(payload) => void saveEdition(sheet.edition, payload)} />}
      {sheet?.kind === "insider" && (
        <InsiderSheet edition={sheet.edition} existing={overview?.insiders ?? []} busy={busy} error={formError} onClose={() => setSheet(null)} onSave={(payload) => void saveInsider(sheet.edition, payload)} />
      )}
      {sheet?.kind === "requests" && (
        <RequestsSheet
          edition={sheet.edition}
          onClose={() => setSheet(null)}
          onDecide={async (requestId: string, decision: Decision) => (await act({ action: "decide_request", requestId, decision })).failure}
        />
      )}
    </section>
  );
}
