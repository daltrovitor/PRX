// Hello World
import type { CSSProperties } from "react";
import type gsap from "gsap";
import { PRX_GRADIENTS, PRX_LAYOUT, PRX_PATHS } from "@/lib/brand/prx-logo-data";

/*
 * Revelação vetorial da marca PRX, compartilhada pela abertura do app
 * (PrxLoader) e pelo teaser do prx.app.br:
 *   1. as duas peças do símbolo deslizam e se encaixam no centro;
 *   2. o símbolo vai para a esquerda enquanto P, R e X sobem de uma máscara;
 *   3. a assinatura "NEXT IS YOURS" aparece da esquerda
 *      para a direita e a barra abre do centro.
 */

/** Deslocamento que centraliza o símbolo sozinho antes do lockup abrir (unidades do viewBox). */
export const SYMBOL_CENTER_OFFSET = PRX_LAYOUT.viewBox.full[2] / 2 - PRX_LAYOUT.viewBox.symbol[2] / 2;

type Stops = ReadonlyArray<readonly [number, string]>;

function GradientStops({ stops }: { stops: Stops }) {
  return (
    <>
      {stops.map(([offset, color]) => (
        <stop key={offset} offset={offset} stopColor={color} />
      ))}
    </>
  );
}

/** SVG com os alvos da animação (data-*). Começa invisível: a timeline decide quando aparece. */
export function PrxRevealMark({ uid, className, style }: { uid: string; className?: string; style?: CSSProperties }) {
  const ids = { symbol: `rv-s-${uid}`, x: `rv-x-${uid}`, bar: `rv-b-${uid}`, wordClip: `rv-wc-${uid}`, tagClip: `rv-tc-${uid}` };
  const [vx, vy, vw, vh] = PRX_LAYOUT.viewBox.full;
  const { symbol: sg, x: xg, bar: bg } = PRX_GRADIENTS;
  const bar = PRX_LAYOUT.bar;

  return (
    <svg
      data-logo
      viewBox={`${vx} ${vy} ${vw} ${vh}`}
      className={className}
      style={{ visibility: "hidden", ...style }}
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id={ids.symbol} gradientUnits="userSpaceOnUse" cx={sg.cx} cy={sg.cy} r={sg.r}>
          <GradientStops stops={sg.stops} />
        </radialGradient>
        <linearGradient id={ids.x} gradientUnits="userSpaceOnUse" x1={xg.x1} y1={xg.y1} x2={xg.x2} y2={xg.y2}>
          <GradientStops stops={xg.stops} />
        </linearGradient>
        <linearGradient id={ids.bar} gradientUnits="userSpaceOnUse" x1={bar.x} y1={0} x2={bar.x + bar.w} y2={0}>
          <GradientStops stops={bg.stops} />
        </linearGradient>
        {/* Janela do wordmark nas coordenadas do arquivo mestre: as letras sobem por baixo dela. */}
        <clipPath id={ids.wordClip}>
          <rect x={90} y={296} width={500} height={112} />
        </clipPath>
        <clipPath id={ids.tagClip}>
          <rect data-tag-clip x={0} y={0} width={0} height={vh} />
        </clipPath>
      </defs>

      <g data-symbol-group>
        <g transform={PRX_LAYOUT.symbol}>
          <path data-piece="white" fill="currentColor" d={PRX_PATHS.symbolWhite} />
          <path data-piece="color" fill={`url(#${ids.symbol})`} d={PRX_PATHS.symbolColor} />
        </g>
      </g>

      <g transform={PRX_LAYOUT.wordFull}>
        <g clipPath={`url(#${ids.wordClip})`}>
          <path data-letter fill="currentColor" fillRule="evenodd" d={PRX_PATHS.p} />
          <path data-letter fill="currentColor" fillRule="evenodd" d={PRX_PATHS.r} />
          <path data-letter fill={`url(#${ids.x})`} d={PRX_PATHS.xMain} />
        </g>
        <path data-piece="x-arm" fill={`url(#${ids.x})`} d={PRX_PATHS.xArm} />
      </g>

      <g clipPath={`url(#${ids.tagClip})`}>
        <text
          x={549}
          y={153}
          textAnchor="middle"
          fill="currentColor"
          style={{
            fontFamily: "var(--font-sans, system-ui, sans-serif)",
            fontSize: "28px",
            fontWeight: 400,
            letterSpacing: "0.6em",
          }}
        >
          NEXT IS YOURS
        </text>
      </g>
    </svg>
  );
}

type Selector = (selector: string) => Element[];

/** Monta a sequência da revelação na timeline informada (~2,7s em velocidade 1). */
export function addPrxRevealTweens(tl: gsap.core.Timeline, q: Selector, gsapInstance: typeof gsap): gsap.core.Timeline {
  gsapInstance.set(q("[data-symbol-group]"), { x: SYMBOL_CENTER_OFFSET });
  return tl
    .from(q("[data-piece='white']"), { x: -90, y: -20, autoAlpha: 0, duration: 0.85 }, 0.1)
    .from(q("[data-piece='color']"), { x: 90, y: 20, autoAlpha: 0, duration: 0.85 }, 0.18)
    .to(q("[data-symbol-group]"), { x: 0, duration: 0.85, ease: "expo.inOut" }, 0.8)
    .from(q("[data-letter]"), { y: 130, duration: 0.9, stagger: 0.09 }, 1.38)
    .from(q("[data-piece='x-arm']"), { x: 46, y: -46, autoAlpha: 0, duration: 0.7, ease: "back.out(2)" }, 1.78)
    .to(q("[data-tag-clip]"), { attr: { width: PRX_LAYOUT.viewBox.full[2] }, duration: 0.9, ease: "power3.inOut" }, 2.0)
    .from(q("[data-bar]"), { scaleX: 0, transformOrigin: "50% 50%", duration: 0.7, ease: "power3.out" }, 2.35);
}

/** Estado final (movimento reduzido): tudo visível, assinatura aberta. */
export function showPrxRevealFinal(q: Selector, gsapInstance: typeof gsap) {
  gsapInstance.set(q("[data-tag-clip]"), { attr: { width: PRX_LAYOUT.viewBox.full[2] } });
}
