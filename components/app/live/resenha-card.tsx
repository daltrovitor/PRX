// Hello World
"use client";

import Image from "next/image";
import { formatDateTime } from "@/lib/live/format";
import type { MemberResenhaView } from "@/lib/resenha/invites";
import { cn } from "@/lib/utils";

/** Logo oficial da Resenha (branco): sempre sobre fundo preto, nos dois temas. */
export function ResenhaLogo({ className, priority = false }: { className?: string; priority?: boolean }) {
  return <Image src="/brand/resenha-logo.png" alt="Resenha" width={1200} height={181} priority={priority} sizes="(max-width: 640px) 80vw, 480px" className={cn("h-auto w-full", className)} />;
}

const ctaOf = (r: MemberResenhaView) =>
  r.ticket === "valid" || r.ticket === "used" ? "Ingresso garantido" : r.ticket === "pending_payment" ? "Concluir pagamento" : r.event.salesOpen ? "Garantir ingresso" : "Ver convite";

/**
 * Banner da Resenha na Home, sempre visível. Leva à aba Resenha do PRX LIVE,
 * onde ficam as Resenhas para as quais a pessoa foi convidada. Com convite,
 * mostra a festa e quem convidou; sem, avisa que é só por convite.
 */
export function ResenhaHomeCard({ resenhas, onOpen }: { resenhas: MemberResenhaView[]; onOpen: () => void }) {
  const first = resenhas[0];
  const more = resenhas.length - 1;
  const cta = first ? ctaOf(first) : "Ver meus convites";
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex w-full cursor-pointer flex-col overflow-hidden rounded-3xl border border-white/10 bg-black text-left text-white transition-transform duration-300 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
      aria-label={first ? `Resenha, evento exclusivo: convite de ${first.insiderName}. ${cta}` : `Resenha, evento exclusivo: só por convite. ${cta}`}
    >
      {/* Arte oficial da edição (Resenha · 20/11 · Antonieta Club), já em fundo preto. */}
      <Image src="/brand/resenha-banner.webp" alt="" width={2172} height={724} priority sizes="(min-width: 1024px) 40vw, 100vw" className="h-auto w-full" />
      <span className="mx-5 mt-4 self-start rounded-md border border-white/25 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] sm:mx-6">Evento exclusivo</span>
      <div className="flex flex-wrap items-end justify-between gap-4 p-5 pt-3 sm:p-6 sm:pt-3">
        {first ? (
          <div className="min-w-0 space-y-1">
            <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-white/60">Convite de {first.insiderName}</p>
            <p className="text-lg font-semibold tracking-[-0.01em]">{first.headline}</p>
            <p className="text-sm text-white/70">
              {formatDateTime(first.event.startsAt)} · {first.event.city}
              {more > 0 ? ` · +${more} ${more === 1 ? "convite" : "convites"}` : ""}
            </p>
          </div>
        ) : (
          <div className="min-w-0 space-y-1">
            <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-white/60">Só por convite</p>
            <p className="max-w-sm text-sm text-white/70">Quando um Insider te convidar, a sua Resenha aparece aqui.</p>
          </div>
        )}
        <span className="inline-flex min-h-12 items-center rounded-full bg-white px-5 text-sm font-semibold text-black transition-colors group-hover:bg-white/90">{cta}</span>
      </div>
    </button>
  );
}
