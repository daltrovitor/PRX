// Hello World
"use client";

import type { PointerEvent } from "react";
import { motion } from "motion/react";
import { PrxLogo } from "@/components/brand/prx-logo";
import { ContactlessIcon, EmbossedMark, EmvChip } from "@/components/app/bank/card-art";
import { cn } from "@/lib/utils";

/**
 * Arte do cartão PRX: preto fosco, símbolo da marca em relevo, chip e nome do
 * titular. Tudo é medido em cqw, a largura do próprio cartão, então a arte
 * escala inteira. Estilos da superfície: .prx-card-art em globals.css.
 */

const cardShell = "prx-card-art block aspect-[1.586/1] w-full select-none rounded-[5.4cqw] text-left";
const light = "font-[family-name:var(--font-light),var(--font-sans)] font-light";

/**
 * A película acompanha o ponteiro (variáveis CSS, sem re-render).
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

/**
 * Frente do cartão. Só <span>: o PaymentCard é um <button>, que não aceita bloco.
 * `status` diz a situação ("Em breve": os cartões ainda não são emitidos, então
 * não há número nem validade inventados).
 */
function CardFace({ holder, status }: { holder: string; status: string }) {
  return (
    <>
      <EmbossedMark className="pointer-events-none absolute left-[49.5cqw] top-[5.9cqw] h-auto w-[63.7cqw]" />

      <span className="absolute left-[5.4cqw] top-[5.2cqw] flex items-center gap-[2.6cqw]">
        <PrxLogo variant="symbol" title="" className="h-[6.6cqw] w-auto text-white" />
        <span className={cn(light, "text-[3.3cqw] leading-none tracking-[0.5em] text-white/90")}>PRX</span>
      </span>
      <span className={cn(light, "absolute right-[5.4cqw] top-[6.2cqw] text-[length:max(9px,2.3cqw)] uppercase leading-none tracking-[0.28em] text-white/55")}>{status}</span>

      <span className="absolute left-[5.4cqw] top-[24.5cqw] flex items-center gap-[2.8cqw]">
        <EmvChip className="h-[10cqw] w-auto drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]" />
        <ContactlessIcon className="h-[6.6cqw] w-auto text-white/80" />
      </span>

      <span className="absolute inset-x-[5.4cqw] bottom-[5.2cqw] flex items-end justify-between gap-[3cqw]">
        <span className={cn(light, "line-clamp-2 min-w-0 break-words text-[3.3cqw] uppercase leading-[1.3] tracking-[0.2em] text-white/90")}>{holder}</span>
      </span>
    </>
  );
}

/**
 * Cartão PRX em destaque (carrossel da Home). Os cartões ainda não são
 * emitidos: mostra "Em breve", sem número inventado.
 */
export function PaymentCard({ holder, onClick }: { holder: string; onClick?: () => void }) {
  return (
    <div className="@container w-full">
      <motion.button
        type="button"
        onClick={onClick}
        whileTap={{ scale: 0.98 }}
        transition={{ type: "spring", stiffness: 400, damping: 24 }}
        onPointerMove={trackHolo}
        onPointerLeave={resetHolo}
        className={cn(cardShell, "cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-primary")}
        aria-label="Cartão PRX Bank, chega em breve. Abrir cartões"
      >
        <CardFace holder={holder} status="Em breve" />
      </motion.button>
    </div>
  );
}

/**
 * Cartão na aba Cartões, ainda sem emissão ("Em breve"). Quando existir, número
 * completo e CVV ficam só no emissor. Inclinação sutil ao passar o mouse
 * (física de mola), nunca em movimento contínuo.
 */
export function CardVisual({ holder, label }: { holder: string; label: string }) {
  return (
    <div className="@container mx-auto w-full max-w-[380px] sm:mx-0">
      <motion.div
        whileHover={{ rotateX: 4, rotateY: -6, y: -2 }}
        transition={{ type: "spring", stiffness: 300, damping: 24 }}
        style={{ transformPerspective: 900 }}
        onPointerMove={trackHolo}
        onPointerLeave={resetHolo}
        className={cardShell}
        aria-label={`Cartão ${label.toLowerCase()} PRX, chega em breve`}
        role="img"
      >
        <CardFace holder={holder} status={`${label} · Em breve`} />
      </motion.div>
    </div>
  );
}
