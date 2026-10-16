// Hello World
import Image from "next/image";
import coinImg from "@/public/brand/prx-coin.png";
import { Reveal } from "@/components/marketing/landing/landing-kit";
import { TEASER_LOOP } from "@/components/marketing/teaser/teaser-data";

/**
 * Como a PRX recompensa: o ciclo de três passos (Pix em parceiro → PRX Coins e
 * XP → ecossistema) e o NO BET, a primeira mecânica de comportamento.
 */
export function TeaserLoop() {
  return (
    <section id="como-funciona" aria-labelledby="loop-title" className="relative overflow-hidden border-t border-white/10">
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(42%_50%_at_88%_20%,rgba(124,58,237,0.16),transparent_72%)]" />
      <div className="mx-auto max-w-[1440px] px-5 py-24 sm:px-8 sm:py-32 lg:px-12">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <Reveal amount={0.6} className="lg:col-span-8">
            <h2 id="loop-title" className="ob-display text-[clamp(40px,6.6vw,96px)] leading-[0.94] tracking-[0.03em] text-white">
              Boas escolhas
              <br />
              viram vantagem.
            </h2>
          </Reveal>
          <Reveal index={1} amount={0.6} className="flex items-end lg:col-span-4 lg:justify-end">
            <Image src={coinImg} alt="PRX Coin" width={132} height={132} sizes="132px" className="h-24 w-24 drop-shadow-[0_18px_40px_rgba(124,58,237,0.45)] sm:h-[132px] sm:w-[132px]" />
          </Reveal>
        </div>

        <ol className="mt-16 grid grid-cols-1 border-t border-white/10 md:grid-cols-3">
          {TEASER_LOOP.map((step, i) => (
            <li key={step.title} className="border-b border-white/10 md:border-b-0 md:border-r md:px-6 md:first:pl-0 md:last:border-r-0 md:last:pr-0">
              <Reveal index={i} amount={0.4} className="flex h-full flex-col gap-6 py-8 md:py-10">
                <span className="font-mono text-[12px] tracking-[0.18em] text-white/60">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="text-[22px] font-medium leading-tight tracking-[-0.02em] text-white sm:text-[24px]">{step.title}</h3>
                <p className="text-[16px] leading-relaxed text-white/75">{step.text}</p>
              </Reveal>
            </li>
          ))}
        </ol>

        <div className="mt-24 grid grid-cols-1 gap-10 border-t border-white/10 pt-16 sm:mt-32 lg:grid-cols-12">
          <Reveal amount={0.5} className="lg:col-span-7">
            <h3 className="ob-display text-[clamp(64px,13vw,184px)] leading-[0.86] tracking-[0.04em] text-white">
              No <span className="text-[#b69cfb]">bet.</span>
            </h3>
          </Reveal>
          <Reveal index={1} amount={0.4} className="self-end lg:col-span-5">
            <p className="text-balance text-[clamp(22px,2.4vw,32px)] font-light leading-[1.15] tracking-[-0.02em] text-white">Não apostar também pode valer.</p>
            <p className="mt-5 text-pretty text-[16px] leading-relaxed text-white/75">
              Uma das primeiras mecânicas de comportamento da PRX. A proposta é reconhecer quem passa períodos sem transações para plataformas de apostas, com critérios técnicos,
              regulatórios e de privacidade, e transformar isso em pontos, benefícios e experiências.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
