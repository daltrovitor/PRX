// Hello World
import { useId } from "react";
import { PRX_LAYOUT, PRX_PATHS } from "@/lib/brand/prx-logo-data";

/**
 * Peças desenhadas do cartão PRX preto: o símbolo da marca em relevo (tom sobre
 * tom), o chip e o ícone de aproximação. Tudo vetorial, sem imagem: nítido em
 * qualquer tamanho e sem peso extra. A geometria do símbolo vem do arquivo mestre
 * da marca (lib/brand/prx-logo-data.ts), a mesma do logotipo.
 */

const [, , SYMBOL_W, SYMBOL_H] = PRX_LAYOUT.viewBox.symbol;

/**
 * Símbolo PRX em relevo: a luz entra por cima, à esquerda; a sombra cai para
 * baixo, à direita, e um fio de luz marca as bordas inferiores, como no metal
 * gravado. Fica quase do tom do cartão: só o relevo o revela.
 */
export function EmbossedMark({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, "");
  const glyph = `prx-emb-${uid}`;
  const face = `prx-emf-${uid}`;
  const edge = `prx-eme-${uid}`;

  return (
    <svg viewBox={`0 0 ${SYMBOL_W} ${SYMBOL_H}`} className={className} aria-hidden focusable="false" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <g id={glyph} transform={PRX_LAYOUT.symbol}>
          <path d={PRX_PATHS.symbolWhite} />
          <path d={PRX_PATHS.symbolColor} />
        </g>
        <linearGradient id={face} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1b1b21" />
          <stop offset="1" stopColor="#08080b" />
        </linearGradient>
        <linearGradient id={edge} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0.3" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.42" />
        </linearGradient>
      </defs>
      <use href={`#${glyph}`} transform="translate(-0.9 -1.1)" fill="#ffffff" fillOpacity="0.11" />
      <use href={`#${glyph}`} transform="translate(1.7 2.2)" fill="#000000" fillOpacity="0.78" />
      <use href={`#${glyph}`} fill={`url(#${face})`} stroke={`url(#${edge})`} strokeWidth="0.6" strokeLinejoin="round" />
    </svg>
  );
}

/** Chip EMV prateado. */
export function EmvChip({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, "");
  const metal = `prx-chip-${uid}`;

  return (
    <svg viewBox="0 0 50 40" className={className} aria-hidden focusable="false" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={metal} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f3f3f6" />
          <stop offset="0.42" stopColor="#a9a9b3" />
          <stop offset="0.72" stopColor="#e3e3e9" />
          <stop offset="1" stopColor="#8c8c96" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="49" height="39" rx="7" fill={`url(#${metal})`} />
      <g fill="none" stroke="#000000" strokeOpacity="0.4" strokeWidth="1" strokeLinecap="round">
        <path d="M0.5 14.5H16M0.5 25.5H16M34 14.5H49.5M34 25.5H49.5M16 0.5V9M16 31V39.5M34 0.5V9M34 31V39.5" />
        <rect x="16" y="9" width="18" height="22" rx="4.5" />
      </g>
    </svg>
  );
}

/** Ícone de pagamento por aproximação: quatro arcos crescentes. */
export function ContactlessIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 32"
      className={className}
      aria-hidden
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M3 12.5c1.6 2.2 1.6 4.8 0 7" />
      <path d="M8 9c3 3.8 3 10.2 0 14" />
      <path d="M13 5.5c4.4 5.4 4.4 15.6 0 21" />
      <path d="M18 2c5.8 7 5.8 21 0 28" />
    </svg>
  );
}
