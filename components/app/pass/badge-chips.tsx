// Hello World
import { BADGES, type BadgeCode } from "@/lib/badges/catalog";
import { cn } from "@/lib/utils";

/** Selos em linha, compactos (card do benefício, tabelas do admin). Passou de `max`: "+N". */
export function BadgeChips({ codes, max = 3, className }: { codes?: readonly BadgeCode[]; max?: number; className?: string }) {
  if (!codes?.length) return null;
  const shown = codes.slice(0, max);
  const rest = codes.length - shown.length;
  return (
    <ul aria-label="Selos" className={cn("flex flex-wrap gap-1.5", className)}>
      {shown.map((code) => (
        <li key={code} title={BADGES[code].recognizes} className="inline-flex h-6 items-center gap-1 rounded-full bg-card px-2 text-[11px] font-semibold tracking-[0.04em] text-ink">
          <span aria-hidden>{BADGES[code].emoji}</span>
          {BADGES[code].name}
        </li>
      ))}
      {rest > 0 && (
        <li className="inline-flex h-6 items-center rounded-full bg-card px-2 text-[11px] font-semibold text-muted-foreground" aria-label={`Mais ${rest} ${rest === 1 ? "selo" : "selos"}`}>
          +{rest}
        </li>
      )}
    </ul>
  );
}

/** Selos com o significado abaixo do nome (detalhe do benefício). */
export function BadgeList({ codes }: { codes?: readonly BadgeCode[] }) {
  if (!codes?.length) return null;
  return (
    <ul className="space-y-2">
      {codes.map((code) => {
        const badge = BADGES[code];
        return (
          <li key={code} className="flex items-center gap-3 rounded-2xl bg-surface p-3">
            <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card text-lg">
              {badge.emoji}
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold tracking-[0.04em] text-ink">{badge.name}</p>
              <p className="text-[13px] text-muted-foreground">{badge.recognizes}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
