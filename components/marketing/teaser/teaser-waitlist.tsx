// Hello World
"use client";

import { useState } from "react";
import { TeaserPreregDialog } from "@/components/marketing/teaser/teaser-prereg-dialog";
import { cn } from "@/lib/utils";

/**
 * Chamada da Lista de Espera VIP: um botão que abre o pop-up de pré-cadastro
 * (nome, e-mail, celular e idade). O envio e as regras ficam em
 * teaser-prereg-dialog.tsx e em POST /api/waitlist.
 */
export function TeaserWaitlist({ className, source = "hero" }: { className?: string; source?: "hero" | "final" }) {
  const [open, setOpen] = useState(false);

  return (
    <div role="group" aria-label={source === "hero" ? "Lista de Espera VIP" : "Lista de Espera VIP (fim da página)"} className={cn("w-full", className)}>
      <p className="font-mono text-[12px] uppercase tracking-[0.18em] text-white/70">Lista de Espera VIP</p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="group/cta mt-3 flex h-14 w-full cursor-pointer items-center justify-center bg-[#7c3aed] px-6 text-[15px] font-semibold text-white transition-colors hover:bg-[#6d28d9] min-[460px]:w-auto"
      >
        <span className="inline-flex items-center gap-2">
          Fazer pré-cadastro
          <span aria-hidden className="transition-transform duration-300 group-hover/cta:translate-x-1">
            →
          </span>
        </span>
      </button>
      <p className="mt-3 text-[13px] leading-relaxed text-white/70">Leva menos de um minuto: nome, e-mail, celular e idade.</p>
      <TeaserPreregDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
