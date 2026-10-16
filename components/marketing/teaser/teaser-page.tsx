// Hello World
import { PrxLogo } from "@/components/brand/prx-logo";
import { SmoothScroll } from "@/components/app/smooth-scroll";
import { TeaserClosing, TeaserFaq, TeaserFooter } from "@/components/marketing/teaser/teaser-closing";
import { TeaserHero } from "@/components/marketing/teaser/teaser-hero";
import { TeaserLoop } from "@/components/marketing/teaser/teaser-loop";
import { TeaserManifesto } from "@/components/marketing/teaser/teaser-manifesto";
import { TeaserMarquee } from "@/components/marketing/teaser/teaser-marquee";
import { TeaserModules } from "@/components/marketing/teaser/teaser-modules";

/**
 * Teaser do prx.app.br (Lista de Espera VIP), na composição editorial
 * assimétrica sobre o palco Obsidian: abertura animada, "EM BREVE.",
 * manifesto, os dez módulos em capítulos, o ciclo de recompensas, perguntas e
 * a chamada final. Rolagem Lenis com o RAF sincronizado ao GSAP.
 */
export function TeaserPage() {
  return (
    <div className="prx-obsidian prx-obsidian-page isolate min-h-dvh overflow-x-clip bg-[#050508] text-white selection:bg-[#7c3aed] selection:text-white">
      <SmoothScroll>
        <header className="absolute inset-x-0 top-0 z-20">
          <div className="mx-auto flex h-20 max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-12">
            <PrxLogo variant="full" title="PRX" className="h-7 w-auto text-white sm:h-8" />
            <nav aria-label="Atalhos">
              <a
                href="#modulos"
                className="inline-flex min-h-12 cursor-pointer items-center gap-2 border border-white/20 px-4 font-mono text-[12px] uppercase tracking-[0.18em] text-white/85 transition-colors hover:border-white/60 hover:text-white"
              >
                Os módulos <span aria-hidden>↓</span>
              </a>
            </nav>
          </div>
        </header>
        <main>
          <TeaserHero />
          <TeaserMarquee />
          <TeaserManifesto />
          <TeaserModules />
          <TeaserLoop />
          <TeaserFaq />
          <TeaserClosing />
        </main>
        <TeaserFooter />
      </SmoothScroll>
    </div>
  );
}
