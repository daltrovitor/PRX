// Hello World
"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { CopyButton, useQrDataUrl } from "@/components/app/pass/voucher-sheet";
import { Notice } from "@/components/app/ui";
import { formatPartyDate, sentence } from "@/lib/resenha/format";
import type { GuestView } from "@/lib/resenha/types";

const POLL_MS = 15_000;

/** Página do pedido: aguardando, "você tá na lista" (com o QR), "ainda não" ou removido. Atualiza sozinha enquanto espera. */
export function GuestStatus({ token, initial }: { token: string; initial: GuestView }) {
  const [view, setView] = useState(initial);
  const [offline, setOffline] = useState(false);
  const qr = useQrDataUrl(view.ticket?.qr, 320);
  const waiting = view.status === "pending";

  useEffect(() => {
    if (!waiting) return;
    let alive = true;
    const refresh = async () => {
      try {
        const res = await fetch(`/api/resenha/lista/${token}`, { cache: "no-store" });
        const data = (await res.json()) as { view?: GuestView };
        if (alive && res.ok && data.view) {
          setView(data.view);
          setOffline(false);
        }
      } catch {
        if (alive) setOffline(true);
      }
    };
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [waiting, token]);

  const first = view.name.split(" ")[0];

  if (view.cancelled) {
    return (
      <div className="space-y-6">
        <header className="space-y-3">
          <h1 className="ob-display text-[40px] leading-[1.02] text-ink sm:text-5xl">Esta Resenha foi cancelada.</h1>
          <p className="text-[15px] leading-relaxed text-muted-foreground">{first}, a {view.title} não vai acontecer na data marcada. O seu ingresso não vale mais. Qualquer novidade, o Insider avisa.</p>
        </header>
      </div>
    );
  }

  if (view.status === "approved" && view.ticket) {
    return (
      <div className="space-y-6">
        <header className="space-y-3">
          <h1 className="ob-display text-[40px] leading-[1.02] text-ink sm:text-5xl">
            Você tá
            <br />
            na lista.
          </h1>
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            {first}, {view.insiderName} liberou o seu acesso à {view.title}.
          </p>
        </header>
        <section className="glass space-y-5 rounded-3xl p-5 text-center sm:p-6" aria-label="Seu ingresso">
          {view.ticket.used ? (
            <Notice tone="success">Entrada registrada. Aproveite a Resenha.</Notice>
          ) : qr ? (
            <Image src={qr} alt="QR Code do seu ingresso" width={256} height={256} unoptimized className="mx-auto h-auto w-full max-w-[256px] rounded-2xl bg-white p-2" />
          ) : (
            <div aria-hidden className="mx-auto h-64 w-64 rounded-2xl bg-surface" />
          )}
          <div className="space-y-1">
            <p className="font-mono text-lg tracking-[0.12em] text-ink">{view.ticket.code}</p>
            <CopyButton value={view.ticket.code} label="Copiar código" />
          </div>
        </section>
        <section className="glass space-y-3 rounded-3xl p-5 sm:p-6">
          <dl className="space-y-3 text-[15px]">
            <div>
              <dt className="text-[13px] text-muted-foreground">Quando</dt>
              <dd className="font-medium text-ink">{sentence(formatPartyDate(view.startsAt))}</dd>
            </div>
            <div>
              <dt className="text-[13px] text-muted-foreground">Onde</dt>
              <dd className="font-medium text-ink">{[view.venue, view.address, view.city].filter(Boolean).join(" · ")}</dd>
            </div>
          </dl>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            O ingresso é gratuito, pessoal e vale uma única entrada. Leve um documento com foto: a entrada é 18+ e o nome na lista precisa bater com o documento.
          </p>
        </section>
      </div>
    );
  }

  const copy: Record<Exclude<GuestView["status"], "approved">, { title: string; body: string }> = {
    pending: { title: "Pedido enviado.", body: `${view.insiderName} vai avaliar o seu nome. Guarde esta página: o resultado aparece aqui e, se você entrar, também chega por e-mail.` },
    rejected: { title: "Ainda não.", body: "Novos nomes serão liberados. Esta página atualiza sozinha se o seu nome entrar." },
    revoked: { title: "Seu acesso foi removido.", body: `${view.insiderName} tirou o seu nome da lista. Se foi engano, fale com ele.` },
  };
  const state = copy[view.status === "approved" ? "revoked" : view.status];

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <h1 className="ob-display text-[40px] leading-[1.02] text-ink sm:text-5xl">{state.title}</h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          {first}, {state.body}
        </p>
      </header>
      <section className="glass rounded-3xl p-5 text-[15px] sm:p-6">
        <p className="font-medium text-ink">{view.title}</p>
        <p className="mt-1 text-muted-foreground">
          {sentence(formatPartyDate(view.startsAt))} · {view.city}
        </p>
        <p className="mt-3 text-[13px] text-muted-foreground">O endereço aparece só para quem está na lista.</p>
      </section>
      {offline && waiting && <Notice tone="warning">Sem conexão agora. Tentamos de novo em instantes.</Notice>}
    </div>
  );
}
