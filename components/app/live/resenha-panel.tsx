// Hello World
"use client";

import { useState } from "react";
import type { User } from "@/hooks/use-auth";
import type { ActionResult, QuoteResult } from "@/components/app/use-prx-stores";
import { EventPurchaseSheet } from "@/components/app/live/event-purchase-sheet";
import { ResenhaLogo } from "@/components/app/live/resenha-card";
import { ResenhaCatalog, priceOf } from "@/components/app/live/resenha-catalog";
import { Button, Notice, Tag } from "@/components/app/ui";
import { MemberId } from "@/components/app/profile/member-id";
import { formatDateTime } from "@/lib/live/format";
import type { MemberResenhaView } from "@/lib/resenha/invites";
import type { MemberResenhaCatalog } from "@/lib/resenha/invite-requests";

type Reserve = (input: { eventId: string; batchId: string; promoCode?: string; birthDate?: string; parentEmail?: string }) => Promise<ActionResult>;
type Quote = (input: { eventId: string; batchId: string; promoCode?: string }) => Promise<QuoteResult>;

/**
 * Área exclusiva do PRX LIVE: quem um Insider convidou garante o ingresso da
 * Resenha (pago ou gratuito, conforme o lote do evento); quem ainda não foi
 * convidado escolhe um Insider no catálogo e pede para comprar o convite.
 */
export function ResenhaPanel({
  resenhas,
  catalog,
  member,
  reserve,
  quote,
  onTickets,
  onChanged,
}: {
  resenhas: MemberResenhaView[];
  catalog: MemberResenhaCatalog;
  member: User;
  reserve: Reserve;
  quote: Quote;
  onTickets: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = resenhas.find((r) => r.inviteId === selectedId) ?? null;

  const nothing = resenhas.length === 0 && catalog.entries.length === 0;

  return (
    <section aria-label="Resenha" className="space-y-4">
      <div className="rounded-3xl border border-white/10 bg-black px-6 py-8 sm:px-10">
        <ResenhaLogo className="mx-auto max-w-[460px]" priority />
        <p className="mt-5 text-center text-sm text-white/70">{resenhas.length > 0 ? "Acesso exclusivo por convite. Seu nome está na lista." : "Acesso exclusivo por convite."}</p>
      </div>

      {catalog.minor && resenhas.length === 0 && <Notice tone="warning">A Resenha é só para maiores de 18 anos.</Notice>}

      {nothing && !catalog.minor && (
        <div className="space-y-4 rounded-3xl glass p-5 sm:p-6">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink">Você ainda não foi convidado</h2>
          <p className="text-sm text-muted-foreground">
            Quem entra na Resenha é chamado por um Insider. Passe o seu ID PRX para ele: quando o convite chegar, a festa aparece aqui e você recebe um aviso no celular.
          </p>
          <MemberId />
        </div>
      )}

      <ul className="space-y-3 empty:hidden">
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

      <ResenhaCatalog entries={catalog.entries} onRequested={onChanged} />

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
