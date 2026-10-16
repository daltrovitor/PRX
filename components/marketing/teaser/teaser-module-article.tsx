// Hello World
import Image from "next/image";
import type { TeaserModule } from "@/components/marketing/teaser/teaser-data";

/**
 * Um capítulo da seção de módulos. No celular a foto vem dentro do capítulo;
 * no computador ela fica no quadro fixo ao lado (TeaserModules).
 */
export function TeaserModuleArticle({ module: m, index, total }: { module: TeaserModule; index: number; total: number }) {
  const number = String(index + 1).padStart(2, "0");
  return (
    <article id={m.id} data-chapter aria-labelledby={`${m.id}-title`} className="scroll-mt-8 border-t border-white/10 py-14 sm:py-20 lg:flex lg:min-h-[92vh] lg:flex-col lg:justify-center lg:py-24">
      <div className="relative mb-8 aspect-[4/5] w-full overflow-hidden border border-white/10 bg-[#07070b] sm:aspect-[16/11] lg:hidden">
        <Image src={m.image} alt={m.alt} fill sizes="100vw" placeholder="blur" className={`object-cover ${m.focus}`} />
        <span aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,5,8,0)_55%,rgba(5,5,8,0.7)_100%)]" />
      </div>

      <div className="flex items-end justify-between gap-4">
        <h3 id={`${m.id}-title`} className="overflow-hidden">
          <span data-line className="ob-display block text-[clamp(48px,7.6vw,108px)] leading-[0.92] tracking-[0.03em] text-white">
            <span className="block text-[0.4em] leading-none tracking-[0.24em] text-white/60">PRX</span>
            {m.name}
          </span>
        </h3>
        <p className="shrink-0 font-mono text-[12px] tracking-[0.16em] text-white/60">
          {number} / {String(total).padStart(2, "0")}
        </p>
      </div>
      <p className="mt-3 font-mono text-[12px] uppercase tracking-[0.2em] text-[#b69cfb]">{m.moment}</p>

      <p data-fade-in className="mt-8 max-w-[620px] text-balance text-[clamp(24px,2.8vw,40px)] font-light leading-[1.12] tracking-[-0.02em] text-white">
        {m.title[0]}
        <br />
        {m.title[1]}
      </p>
      <p data-fade-in className="mt-5 max-w-[560px] text-pretty text-[16px] leading-relaxed text-white/75 sm:text-[17px]">
        {m.lead}
      </p>

      <ul data-fade-in aria-label={`O que tem no PRX ${m.name}`} className="mt-8 grid max-w-[620px] grid-cols-1 border-b border-white/10 sm:grid-cols-2 sm:gap-x-8">
        {m.points.map((point) => (
          <li key={point} className="flex items-center gap-3 border-t border-white/10 py-3 text-[15px] text-white/85">
            <span aria-hidden className="h-1.5 w-1.5 shrink-0 rotate-45 bg-[#9468fa]" />
            {point}
          </li>
        ))}
      </ul>

      {m.signature && <p className="mt-6 font-mono text-[12px] uppercase tracking-[0.2em] text-white/60">{m.signature}</p>}
    </article>
  );
}
