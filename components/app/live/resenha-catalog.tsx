// Hello World
"use client";

import { useId, useState } from "react";
import { Avatar, Button, Notice, Tag, formatBRL } from "@/components/app/ui";
import { formatDateTime } from "@/lib/live/format";
import type { PublicEvent } from "@/lib/live/service";
import type { ResenhaCatalogEntry } from "@/lib/resenha/invite-requests";
import { INSIDER_KIND_LABEL } from "@/lib/resenha/types";
import { cn } from "@/lib/utils";

/** Preço do convite: o lote mais barato ainda disponível. */
export function priceOf({ event }: { event: PublicEvent }): string {
  const open = event.batches.filter((b) => b.available);
  if (open.length === 0) return event.salesOpen ? "Esgotado" : "Vendas encerradas";
  const from = Math.min(...open.map((b) => b.price));
  return from === 0 ? "Gratuito" : `a partir de ${formatBRL(from)}`;
}

const STATE_COPY = {
  pending: { tag: "Aguardando aprovação", tone: "warning" as const, body: (name: string) => `Aguardando a aprovação de ${name} para você comprar o convite. Quando for aprovado, a compra é liberada aqui e você recebe um aviso no celular.` },
  rejected: { tag: "Não aprovado", tone: "neutral" as const, body: (name: string) => `${name} não aprovou a compra do seu convite nesta edição. Cada pessoa pode pedir a um Insider por Resenha.` },
  cancelled: { tag: "Convite cancelado", tone: "neutral" as const, body: (name: string) => `${name} cancelou o seu convite para esta edição.` },
};

async function send(link: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch("/api/live/resenha", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ link }) });
  } catch {
    throw new Error("Sem internet agora. Confira sua conexão e tente de novo.");
  }
  const json = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
  if (!res.ok) throw new Error(json.error || "Não foi possível enviar o pedido.");
  return json.message ?? "Pedido enviado.";
}

/** Uma edição aberta: escolher o Insider e pedir autorização para comprar o convite. */
function CatalogEntry({ entry, onRequested }: { entry: ResenhaCatalogEntry; onRequested: () => Promise<void> | void }) {
  const name = useId();
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = entry.insiders.find((i) => i.participationId === selected) ?? null;
  const state = entry.request ? STATE_COPY[entry.request.status] : null;

  async function submit() {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    try {
      await send(chosen.participationId);
      await onRequested();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar o pedido.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="space-y-5 rounded-3xl glass p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-ink">{entry.headline}</h2>
          <p className="text-sm text-muted-foreground">
            {formatDateTime(entry.event.startsAt)} · {entry.event.venue} · {entry.event.city}
          </p>
          <p className="text-sm text-ink">
            {entry.event.ageRating} · Convite: {priceOf(entry).toLowerCase()}
          </p>
        </div>
        {state && <Tag tone={state.tone}>{state.tag}</Tag>}
      </div>

      {entry.request && state ? (
        <Notice tone={entry.request.status === "pending" ? "neutral" : "warning"}>{state.body(entry.request.insiderName)}</Notice>
      ) : (
        <fieldset className="space-y-3">
          <legend className="mb-1 text-[15px] font-semibold text-ink">Escolha um Insider para liberar a compra do seu convite</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {entry.insiders.map((insider) => {
              const active = insider.participationId === selected;
              return (
                <label
                  key={insider.participationId}
                  className={cn(
                    "flex min-h-16 items-center gap-3 rounded-2xl border p-3 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
                    !insider.available ? "cursor-not-allowed border-transparent bg-surface opacity-60" : active ? "cursor-pointer border-primary bg-primary/[0.05]" : "cursor-pointer border-transparent bg-surface hover:border-input"
                  )}
                >
                  <input type="radio" name={name} value={insider.participationId} checked={active} disabled={!insider.available || busy} onChange={() => setSelected(insider.participationId)} className="sr-only" />
                  <Avatar name={insider.name} src={insider.avatarUrl || null} size={48} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-ink">{insider.name}</span>
                    <span className="block text-[13px] text-muted-foreground">{insider.available ? INSIDER_KIND_LABEL[insider.kind] : "Sem convites disponíveis"}</span>
                  </span>
                </label>
              );
            })}
          </div>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            O Insider decide se libera a compra do seu convite. É um pedido por Resenha: se não for aprovado, não dá para pedir a outro Insider nesta edição.
          </p>
          {error && <Notice tone="error">{error}</Notice>}
          <Button onClick={() => void submit()} disabled={!chosen || busy} className="w-full sm:w-auto">
            {busy ? "Enviando pedido…" : chosen ? `Pedir a ${chosen.name.split(" ")[0]} para comprar o convite` : "Solicitar convite para comprar"}
          </Button>
        </fieldset>
      )}
    </li>
  );
}

/** Resenhas abertas em que o membro ainda pode pedir convite a um Insider. */
export function ResenhaCatalog({ entries, onRequested }: { entries: ResenhaCatalogEntry[]; onRequested: () => Promise<void> | void }) {
  if (entries.length === 0) return null;
  return (
    <ul className="space-y-3" aria-label="Pedir convite a um Insider">
      {entries.map((entry) => (
        <CatalogEntry key={entry.editionId} entry={entry} onRequested={onRequested} />
      ))}
    </ul>
  );
}
