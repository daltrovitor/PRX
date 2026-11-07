// Hello World
import { useId } from "react";
import { PRX_GRADIENTS, PRX_LAYOUT, PRX_PATHS } from "@/lib/brand/prx-logo-data";

export type PrxLogoVariant = "full" | "compact" | "symbol";

interface PrxLogoProps {
  /** full: símbolo + PRX + assinatura; compact: símbolo + PRX; symbol: só o símbolo. */
  variant?: PrxLogoVariant;
  className?: string;
  /** Texto acessível. Passe string vazia quando o logo for decorativo. */
  title?: string;
}

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

/**
 * Marca PRX vetorial, traçada do arquivo mestre sem alterações de geometria.
 * As partes brancas do original usam currentColor: branco sobre fundo escuro,
 * grafite sobre o fundo branco do app.
 */
export function PrxLogo({ variant = "compact", className, title = "PRX" }: PrxLogoProps) {
  const uid = useId().replace(/:/g, "");
  const ids = { symbol: `prx-s-${uid}`, x: `prx-x-${uid}`, bar: `prx-b-${uid}` };
  const [vx, vy, vw, vh] = PRX_LAYOUT.viewBox[variant];
  const { symbol: sg, x: xg, bar: bg } = PRX_GRADIENTS;
  const bar = PRX_LAYOUT.bar;
  const decorative = title === "";

  return (
    <svg
      viewBox={`${vx} ${vy} ${vw} ${vh}`}
      className={className}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : title}
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
      </defs>

      <g transform={PRX_LAYOUT.symbol}>
        <path fill="currentColor" d={PRX_PATHS.symbolWhite} />
        <path fill={`url(#${ids.symbol})`} d={PRX_PATHS.symbolColor} />
      </g>

      {variant !== "symbol" && (
        <g transform={variant === "full" ? PRX_LAYOUT.wordFull : PRX_LAYOUT.wordCompact}>
          <path fill="currentColor" fillRule="evenodd" d={PRX_PATHS.p + PRX_PATHS.r} />
          <path fill={`url(#${ids.x})`} d={PRX_PATHS.xMain + PRX_PATHS.xArm} />
        </g>
      )}

      {variant === "full" && (
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
      )}
    </svg>
  );
}
