// Hello World
"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { TEASER_MODULES } from "@/components/marketing/teaser/teaser-data";
import { TeaserModuleArticle } from "@/components/marketing/teaser/teaser-module-article";
import { cn } from "@/lib/utils";

gsap.registerPlugin(useGSAP, ScrollTrigger);

/**
 * Todos os módulos da PRX em capítulos. No computador, os capítulos rolam à
 * esquerda e um quadro fixo à direita troca a foto de cada módulo (cruzamento
 * de opacidade e escala), com a régua de progresso embaixo. No celular, cada
 * capítulo traz a própria foto e o quadro some.
 */
export function TeaserModules() {
  const rootRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const total = TEASER_MODULES.length;
  const current = TEASER_MODULES[active] ?? TEASER_MODULES[0];

  useGSAP(
    () => {
      const q = gsap.utils.selector(rootRef);
      const chapters = q("[data-chapter]");
      chapters.forEach((chapter, i) => {
        ScrollTrigger.create({ trigger: chapter, start: "top 55%", end: "bottom 55%", onToggle: (self) => self.isActive && setActive(i) });
      });
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      chapters.forEach((chapter) => {
        const tl = gsap.timeline({ scrollTrigger: { trigger: chapter, start: "top 78%", once: true } });
        tl.from(chapter.querySelectorAll("[data-line]"), { yPercent: 105, duration: 1.2, ease: "expo.out" }).from(
          chapter.querySelectorAll("[data-fade-in]"),
          { y: 26, autoAlpha: 0, duration: 1, stagger: 0.1, ease: "power3.out" },
          0.15,
        );
      });

      // A foto anda dentro do quadro enquanto a seção passa.
      gsap.fromTo(q("[data-stage-drift]"), { yPercent: -4 }, { yPercent: 4, ease: "none", scrollTrigger: { trigger: rootRef.current, start: "top bottom", end: "bottom top", scrub: true } });
    },
    { scope: rootRef },
  );

  return (
    <section ref={rootRef} id="modulos" aria-labelledby="modulos-title" className="relative mx-auto max-w-[1440px] px-5 pb-16 sm:px-8 lg:px-12">
      <div className="grid grid-cols-1 gap-8 pb-16 pt-8 lg:grid-cols-12 lg:pb-24">
        <h2 id="modulos-title" className="ob-display text-[clamp(48px,9vw,140px)] leading-[0.9] tracking-[0.02em] text-white lg:col-span-8">
          Todos os
          <br />
          módulos.
        </h2>
        <p className="max-w-[420px] self-end text-pretty text-[16px] leading-relaxed text-white/75 sm:text-[17px] lg:col-span-4">
          Cada módulo cuida de um momento da vida. Juntos, transformam boas escolhas em acesso, benefícios e oportunidades.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-6">
          {TEASER_MODULES.map((m, i) => (
            <TeaserModuleArticle key={m.id} module={m} index={i} total={total} />
          ))}
        </div>

        <div aria-hidden className="hidden lg:col-span-6 lg:block">
          <div className="sticky top-0 flex h-dvh items-center">
            <figure className="relative w-full">
              <div className="relative aspect-[4/5] max-h-[78dvh] w-full overflow-hidden border border-white/10 bg-[#07070b]">
                <div data-stage-drift className="absolute inset-[-6%]">
                  {TEASER_MODULES.map((m, i) => (
                    <Image
                      key={m.id}
                      src={m.image}
                      alt=""
                      fill
                      sizes="(min-width: 1024px) 44vw, 1px"
                      placeholder="blur"
                      className={cn(
                        "object-cover transition-[opacity,transform] duration-[1100ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
                        m.focus,
                        i === active ? "scale-100 opacity-100" : "scale-[1.08] opacity-0",
                      )}
                    />
                  ))}
                </div>
                <span className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,5,8,0.45)_0%,rgba(5,5,8,0)_28%,rgba(5,5,8,0)_62%,rgba(5,5,8,0.75)_100%)]" />
                <span className="absolute left-5 top-5 font-mono text-[12px] uppercase tracking-[0.2em] text-white">PRX {current.name}</span>
                <span className="absolute right-5 top-5 font-mono text-[12px] uppercase tracking-[0.16em] text-white/75">{current.moment}</span>
                <div className="absolute inset-x-5 bottom-5 flex items-center gap-4">
                  <span className="font-mono text-[12px] tracking-[0.16em] text-white">
                    {String(active + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
                  </span>
                  <span className="flex flex-1 gap-1.5">
                    {TEASER_MODULES.map((m, i) => (
                      <span key={m.id} className="relative h-px flex-1 overflow-hidden bg-white/20">
                        <span
                          className={cn(
                            "absolute inset-0 origin-left bg-white transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
                            i <= active ? "scale-x-100" : "scale-x-0",
                          )}
                        />
                      </span>
                    ))}
                  </span>
                </div>
              </div>
            </figure>
          </div>
        </div>
      </div>
    </section>
  );
}
