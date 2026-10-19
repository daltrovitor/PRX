// Hello World
"use client";

import { useState } from "react";
import type { User } from "@/hooks/use-auth";
import type { ActionResult, QuoteResult } from "@/components/app/use-prx-stores";
import { EventPurchaseSheet } from "@/components/app/live/event-purchase-sheet";
import { ResenhaLogo } from "@/components/app/live/resenha-card";
import { Button, EmptyState, Tag, formatBRL } from "@/components/app/ui";
import { formatDateTime } from "@/lib/live/format";
import type { MemberResenhaView } from "@/lib/resenha/invites";

type Reserve = (input: { eventId: string; batchId: string; promoCode?: string; birthDate?: string; parentEmail?: string }) => Promise<ActionResult>;
type Quote = (input: { eventId: string; batchId: string; promoCode?: string }) => Promise<QuoteResult>;

function priceOf(r: MemberResenhaView): string {
  const open = r.event.batches.filter((b) => b.available);
  if (open.length === 0) return r.event.salesOpen ? "Esgotado" : "Vendas encerradas";
  const from = Math.min(...open.map((b) => b.price));
  return from === 0 ? "Gratuito" : `a partir de ${formatBRL(from)}`;
}

/**
 * Área exclusiva do PRX LIVE: só quem um Insider convidou chega aqui e garante
 * o ingresso da Resenha (pago ou gratuito, conforme o lote do evento).
 */
export function ResenhaPanel({
  resenhas,
  member,
  reserve,
  quote,
  onTickets,
  onChanged,
}: {
  resenhas: MemberResenhaView[];
  member: User;
  reserve: Reserve;
  quote: Quote;
  onTickets: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = resenhas.find((r) => r.inviteId === selectedId) ?? null;

  if (resenhas.length === 0) {
    return <EmptyState title="A Resenha é só para convidados" body="Quando um Insider te convidar, a Resenha aparece aqui e você recebe um aviso no celular." />;
  }

  return (
    <section aria-label="Resenha" className="space-y-4">
      <div className="rounded-3xl border border-white/10 bg-black px-6 py-8 sm:px-10">
        <ResenhaLogo className="mx-auto max-w-[460px]" priority />
        <p className="mt-5 text-center text-sm text-white/70">Acesso exclusivo por convite. Seu nome está na lista.</p>
      </div>

      <ul className="space-y-3">
        {resenhas.map((r) => {
          const has = r.ticket === "valid" || r.ticket === "used";
          const paying = r.ticket === "pending_payment";
          return (
            <li key={r.inviteId} className="space-y-4 rounded-3xl glass p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="text-[13px] font-medium text-muted-foreground">Convite de {r.insiderName}</p>
                  <h2 className="text-xl font-semibold tracking-[-0.02em] text-ink">{r.headline}</h2>
                  <p className="text-sm text-muted-foreground">
                    {formatDateTime(r.event.startsAt)} · {r.event.venue} · {r.event.city}
                  </p>
                </div>
                <Tag tone={has ? "success" : paying ? "warning" : "accent"}>{has ? "Ingresso garantido" : paying ? "Aguardando pagamento" : "Na lista"}</Tag>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-ink">{r.event.ageRating} · {priceOf(r)}</p>
                {has || paying ? (
                  <Button variant="secondary" onClick={onTickets}>
                    {has ? "Ver ingresso" : "Concluir pagamento"}
                  </Button>
                ) : (
                  <Button onClick={() => setSelectedId(r.inviteId)} disabled={!r.event.salesOpen || r.event.soldOut}>
                    Garantir ingresso
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <EventPurchaseSheet
        key={selected?.inviteId ?? "nenhum"}
        event={selected?.event ?? null}
        member={member}
        initialCode={null}
        reserve={reserve}
        quote={quote}
        onClose={() => setSelectedId(null)}
        onDone={() => {
          setSelectedId(null);
          void onChanged();
          onTickets();
        }}
      />
    </section>
  );
}
