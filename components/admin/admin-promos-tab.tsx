// Hello World
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button, Checkbox, EmptyState, Field, Input, Notice, Select, Sheet, Tag, formatBRL } from "@/components/app/ui";
import { IconPlus } from "@/components/icons/prx-icons";
import { CopyButton } from "@/components/app/pass/voucher-sheet";
import { liveShareLink } from "@/components/app/live/live-link";
import { formatDateTimeBr } from "@/components/admin/pager";
import { fromLocalInput } from "@/lib/live/format";
import { promoLabel } from "@/lib/live/promo";
import type { PromoView } from "@/lib/live/promo-service";
import { useMainSiteUrl } from "@/lib/site";

/**
 * Cupons e links de divulgação do PRX LIVE. Todo cupom nasce INATIVO: o admin
 * pré-visualiza a compra na Simulação (sem cobrança) e só então ativa e
 * divulga o link. O desconto é calculado no servidor; o link só leva o código.
 */

interface EventOption {
  id: string;
  title: string;
  status: string;
  startsAt: string;
  batches: Array<{ id: string; name: string; price: number }>;
}

const EMPTY = { eventId: "", code: "", label: "", kind: "percent" as "percent" | "fixed", value: "", allBatches: true, batchIds: [] as string[], startsAt: "", endsAt: "", maxUses: "", perUserLimit: "1" };

export function AdminPromosTab({ onPreview }: { onPreview: (eventId: string, code: string) => void }) {
  const [promos, setPromos] = useState<PromoView[] | null>(null);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [reload, setReload] = useState(0);
  const appUrl = useMainSiteUrl();

  useEffect(() => {
    let active = true;
    fetch("/api/admin/live/promos", { cache: "no-store" })
      .then((res) => res.json() as Promise<{ promos?: PromoView[]; events?: EventOption[]; error?: string }>)
      .then((json) => {
        if (!active) return;
        if (json.promos) {
          setPromos(json.promos);
          setEvents(json.events ?? []);
          setError(null);
        } else setError(json.error || "Não foi possível carregar os cupons.");
      })
      .catch(() => active && setError("Sem conexão com o servidor."));
    return () => {
      active = false;
    };
  }, [reload]);

  async function toggle(promo: PromoView) {
    const res = await fetch("/api/admin/live/promos", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: promo.id, active: !promo.active }) });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return setError(json.error || "Não foi possível atualizar o cupom.");
    setFeedback(`Cupom ${promo.code} ${promo.active ? "desativado" : "ativado"}.`);
    setReload((r) => r + 1);
  }

  return (
    <section aria-labelledby="promos-title" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="promos-title" className="font-display text-2xl font-semibold tracking-[-0.03em] text-ink">
            Cupons e links de divulgação
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Desconto por evento, com validade, limite total e por pessoa. Nasce inativo: pré-visualize a compra antes de divulgar.</p>
        </div>
        <Button onClick={() => setCreating(true)} disabled={events.length === 0}>
          <IconPlus size={16} />
          Novo cupom
        </Button>
      </div>

      {feedback && <Notice tone="success">{feedback}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      {!promos ? (
        !error && <div role="status" aria-label="Carregando cupons" className="h-40 rounded-3xl bg-surface" />
      ) : promos.length === 0 ? (
        <EmptyState title="Nenhum cupom ainda" body={events.length === 0 ? "Crie um evento com lote pago no PRX LIVE para poder criar cupons." : "Crie um cupom para gerar o link de divulgação."} />
      ) : (
        <ul className="space-y-3">
          {promos.map((promo) => {
            const link = liveShareLink(appUrl, promo.eventId, promo.code);
            return (
              <li key={promo.id} className="space-y-4 rounded-3xl glass p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-lg tracking-[0.08em] text-ink">{promo.code}</span>
                      <Tag tone={promo.active ? "success" : "neutral"}>{promo.active ? "Ativo" : "Inativo"}</Tag>
                      <Tag tone="accent">{promoLabel(promo)}</Tag>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {promo.eventTitle}
                      {promo.label ? ` · ${promo.label}` : ""}
                    </p>
                    <p className="text-[13px] text-muted-foreground">
                      Validade: {promo.startsAt ? formatDateTimeBr(promo.startsAt) : "já"} → {promo.endsAt ? formatDateTimeBr(promo.endsAt) : "sem fim"} · {promo.perUserLimit} por pessoa
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" onClick={() => onPreview(promo.eventId, promo.code)}>
                      Pré-visualizar compra
                    </Button>
                    <Button size="sm" variant={promo.active ? "secondary" : "primary"} onClick={() => void toggle(promo)}>
                      {promo.active ? "Desativar" : "Ativar"}
                    </Button>
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
                  <Stat label="Usos" value={`${promo.stats.uses}${promo.maxUses ? ` de ${promo.maxUses}` : ""}`} />
                  <Stat label="Conversões" value={String(promo.stats.conversions)} />
                  <Stat label="Aguardando pagamento" value={String(promo.stats.pending)} />
                  <Stat label="Receita atribuída" value={formatBRL(promo.stats.revenue)} />
                  <Stat label="Descontos concedidos" value={formatBRL(promo.stats.discountTotal)} />
                </dl>
                <div className="flex flex-col gap-2 rounded-2xl bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="min-w-0 break-all font-mono text-[12px] text-muted-foreground">{link}</p>
                  <CopyButton value={link} label="Copiar link" />
                </div>
                {!promo.active && <p className="text-[12px] text-muted-foreground">Inativo: o link abre o evento, mas o cupom é recusado até você ativar.</p>}
              </li>
            );
          })}
        </ul>
      )}

      {creating && (
        <PromoSheet
          events={events}
          onClose={() => setCreating(false)}
          onCreated={(code) => {
            setCreating(false);
            setFeedback(`Cupom ${code} criado (inativo). Pré-visualize a compra e ative quando estiver tudo certo.`);
            setReload((r) => r + 1);
          }}
        />
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-surface px-3 py-2.5">
      <dt className="text-[12px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums text-ink">{value}</dd>
    </div>
  );
}

function PromoSheet({ events, onClose, onCreated }: { events: EventOption[]; onClose: () => void; onCreated: (code: string) => void }) {
  const [draft, setDraft] = useState({ ...EMPTY, eventId: events[0]?.id ?? "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) => setDraft((prev) => ({ ...prev, [key]: value }));
  const event = events.find((e) => e.id === draft.eventId);
  const paid = event?.batches.filter((b) => b.price > 0) ?? [];

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      eventId: draft.eventId,
      code: draft.code,
      label: draft.label,
      kind: draft.kind,
      value: Number(draft.value.replace(",", ".")),
      batchIds: draft.allBatches ? null : draft.batchIds,
      startsAt: draft.startsAt ? fromLocalInput(draft.startsAt) : null,
      endsAt: draft.endsAt ? fromLocalInput(draft.endsAt) : null,
      maxUses: draft.maxUses.trim() ? Number(draft.maxUses) : null,
      perUserLimit: Number(draft.perUserLimit) || 1,
      active: false,
    };
    const res = await fetch("/api/admin/live/promos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as { promo?: { code: string }; error?: string };
    setBusy(false);
    if (!res.ok || !json.promo) return setError(json.error || "Não foi possível criar o cupom.");
    onCreated(json.promo.code);
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Novo cupom"
      description="Nasce inativo. O valor é conferido no servidor em toda compra."
      footer={
        <Button block type="submit" form="promo-form" disabled={busy || !draft.eventId}>
          {busy ? "Criando…" : "Criar cupom (inativo)"}
        </Button>
      }
    >
      <form id="promo-form" onSubmit={submit} className="grid gap-5 sm:grid-cols-2">
        <Field label="Evento" className="sm:col-span-2">
          {(id) => (
            <Select id={id} value={draft.eventId} onChange={(e) => setDraft((p) => ({ ...p, eventId: e.target.value, batchIds: [] }))}>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title} · {formatDateTimeBr(e.startsAt)} {e.status === "draft" ? "(rascunho)" : ""}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Código" hint="3 a 32 letras, números ou hífen. Vira maiúsculo.">
          {(id, describedBy) => <Input id={id} aria-describedby={describedBy} value={draft.code} onChange={(e) => set("code", e.target.value.toUpperCase())} maxLength={32} className="font-mono" required />}
        </Field>
        <Field label="Rótulo (opcional)" hint="Ex.: Amigos do Insider.">
          {(id, describedBy) => <Input id={id} aria-describedby={describedBy} value={draft.label} onChange={(e) => set("label", e.target.value)} maxLength={80} />}
        </Field>
        <Field label="Tipo de desconto">
          {(id) => (
            <Select id={id} value={draft.kind} onChange={(e) => set("kind", e.target.value as "percent" | "fixed")}>
              <option value="percent">Percentual (%)</option>
              <option value="fixed">Valor fixo (R$)</option>
            </Select>
          )}
        </Field>
        <Field label={draft.kind === "percent" ? "Desconto (%)" : "Desconto (R$)"}>
          {(id) => <Input id={id} inputMode="decimal" value={draft.value} onChange={(e) => set("value", e.target.value)} required />}
        </Field>
        <div className="sm:col-span-2">
          <Checkbox label="Vale para todos os lotes pagos" checked={draft.allBatches} onChange={(v) => set("allBatches", v)} />
          {!draft.allBatches && (
            <div className="mt-3 grid gap-2">
              {paid.length === 0 && <p className="text-[13px] text-muted-foreground">Este evento não tem lote pago.</p>}
              {paid.map((b) => (
                <Checkbox
                  key={b.id}
                  label={`${b.name} · ${formatBRL(b.price)}`}
                  checked={draft.batchIds.includes(b.id)}
                  onChange={(v) => set("batchIds", v ? [...draft.batchIds, b.id] : draft.batchIds.filter((x) => x !== b.id))}
                />
              ))}
            </div>
          )}
        </div>
        <Field label="Começa a valer (opcional)">{(id) => <Input id={id} type="datetime-local" value={draft.startsAt} onChange={(e) => set("startsAt", e.target.value)} />}</Field>
        <Field label="Expira em (opcional)">{(id) => <Input id={id} type="datetime-local" value={draft.endsAt} onChange={(e) => set("endsAt", e.target.value)} />}</Field>
        <Field label="Limite total de usos (opcional)" hint="Vazio: sem limite.">
          {(id, describedBy) => <Input id={id} aria-describedby={describedBy} type="number" min={1} inputMode="numeric" value={draft.maxUses} onChange={(e) => set("maxUses", e.target.value)} />}
        </Field>
        <Field label="Usos por pessoa">{(id) => <Input id={id} type="number" min={1} max={20} inputMode="numeric" value={draft.perUserLimit} onChange={(e) => set("perUserLimit", e.target.value)} />}</Field>
        {error && (
          <Notice tone="error" className="sm:col-span-2">
            {error}
          </Notice>
        )}
      </form>
    </Sheet>
  );
}
