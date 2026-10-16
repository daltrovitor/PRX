// Hello World
import { TEASER_MODULES } from "@/components/marketing/teaser/teaser-data";
import { cn } from "@/lib/utils";

/** Losango entre os nomes: a quina do cristal, em violeta. */
function Facet() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden className="mx-[0.45em] inline-block h-[0.32em] w-[0.32em] shrink-0 align-middle">
      <rect x="2" y="2" width="8" height="8" transform="rotate(45 6 6)" fill="#9468fa" />
    </svg>
  );
}

function Row({ items, className, itemClassName }: { items: readonly string[]; className?: string; itemClassName?: string }) {
  // Duas cópias em sequência: a faixa anda meia largura e recomeça sem emenda.
  return (
    <div className={cn("flex w-max", className)}>
      {[0, 1].map((copy) => (
        <ul key={copy} className="flex shrink-0 items-center">
          {items.map((item) => (
            <li key={`${copy}-${item}`} className={cn("flex items-center whitespace-nowrap", itemClassName)}>
              {item}
              <Facet />
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}

/**
 * Faixa editorial com todos os módulos (os nomes em caixa alta e, em sentido
 * contrário, o momento de vida de cada um). Decorativa: os módulos estão
 * descritos na seção seguinte.
 */
export function TeaserMarquee() {
  const names = TEASER_MODULES.map((m) => `PRX ${m.name}`);
  const moments = TEASER_MODULES.map((m) => m.moment);
  return (
    <div aria-hidden className="relative overflow-hidden border-y border-white/10 py-6 sm:py-8">
      <Row items={names} className="teaser-marquee" itemClassName="ob-display text-[clamp(40px,7.4vw,104px)] leading-none tracking-[0.04em] text-white" />
      <Row
        items={moments}
        className="teaser-marquee teaser-marquee-reverse mt-3 sm:mt-4"
        itemClassName="font-mono text-[clamp(13px,1.3vw,16px)] uppercase tracking-[0.22em] text-white/60"
      />
    </div>
  );
}
