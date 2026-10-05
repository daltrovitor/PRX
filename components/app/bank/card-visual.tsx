// Hello World
"use client";

import type { PointerEvent } from "react";
import { motion } from "motion/react";
import { PrxLogo } from "@/components/brand/prx-logo";
import { cn } from "@/lib/utils";

const cardShell = "prx-holo flex aspect-[1.586/1] w-full select-none flex-col justify-between rounded-[22px] p-5 text-left";

/**
 * A película holográfica acompanha o ponteiro (variáveis CSS, sem re-render).
 * Sem ponteiro, volta ao repouso: nada se move sozinho.
 */
function trackHolo(event: PointerEvent<HTMLElement>) {
  const el = event.currentTarget;
  const rect = el.getBoundingClientRect();
  el.style.setProperty("--holo-x", `${(((event.clientX - rect.left) / rect.width) * 100).toFixed(1)}%`);
  el.style.setProperty("--holo-y", `${(((event.clientY - rect.top) / rect.height) * 100).toFixed(1)}%`);
}

function resetHolo(event: PointerEvent<HTMLElement>) {
  event.currentTarget.style.removeProperty("--holo-x");
  event.currentTarget.style.removeProperty("--holo-y");
}

/** Selo dos cartões PRX enquanto não são emitidos. */
function SoonBadge() {
  return <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-white/20 backdrop-blur-sm">Em breve</span>;
}

/**
 * Cartão PRX em destaque (carrossel da Home). Os cartões ainda não são
 * emitidos: mostra "Em breve", sem número inventado.
 */
export function PaymentCard({ holder, onClick }: { holder: string; onClick?: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 24 }}
      onPointerMove={trackHolo}
      onPointerLeave={resetHolo}
      className={cn(cardShell, "cursor-pointer")}
      aria-label="Cartão PRX Bank, chega em breve. Abrir cartões"
    >
      <span className="flex items-start justify-between">
        <span className="text-[12px] font-semibold uppercase tracking-[0.06em]">PRX Bank</span>
        <SoonBadge />
      </span>
      <span className="flex items-end justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-semibold uppercase tracking-[0.02em]">{holder}</span>
          <span className="mt-0.5 block text-[11px] font-medium text-white/80">Cartão chega em breve</span>
        </span>
        <PrxLogo variant="symbol" title="" className="h-7 w-auto shrink-0 text-white" />
      </span>
    </motion.button>
  );
}

/**
 * Cartão na aba Cartões, ainda sem emissão ("Em breve"). Quando existir, número
 * completo e CVV ficam só no emissor. Inclinação sutil ao passar o mouse
 * (física de mola), nunca em movimento contínuo.
 */
export function CardVisual({ holder, label }: { holder: string; label: string }) {
  return (
    <motion.div
      whileHover={{ rotateX: 4, rotateY: -6, y: -2 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      style={{ transformPerspective: 900 }}
      onPointerMove={trackHolo}
      onPointerLeave={resetHolo}
      className={cn(cardShell, "mx-auto max-w-[380px] opacity-80 sm:mx-0")}
      aria-label={`Cartão ${label.toLowerCase()} PRX, chega em breve`}
      role="img"
    >
      <div className="flex items-start justify-between">
        <span className="text-[12px] font-semibold uppercase tracking-[0.06em]">PRX Bank · {label}</span>
        <SoonBadge />
      </div>
      <p className="font-mono text-base font-medium tracking-[0.12em] text-white min-[360px]:text-lg sm:text-xl">•••• •••• •••• ••••</p>
      <div className="flex items-end justify-between gap-3 text-[11px] sm:text-[12px]">
        <div className="min-w-0">
          <span className="block font-medium text-white/70">Titular</span>
          <span className="block truncate font-semibold uppercase">{holder}</span>
        </div>
        <div className="shrink-0 text-right">
          <span className="block font-medium text-white/70">Validade</span>
          <span className="block font-mono">••/••</span>
        </div>
      </div>
    </motion.div>
  );
}
