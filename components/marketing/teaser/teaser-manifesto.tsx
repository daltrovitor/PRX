// Hello World
"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Reveal } from "@/components/marketing/landing/landing-kit";
import { TEASER_JOURNEYS } from "@/components/marketing/teaser/teaser-data";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const MANIFESTO = "Um ecossistema criado para transformar boas escolhas, comportamento e ambição em acesso, benefícios e oportunidades reais.";

/**
 * O que é a PRX: o manifesto acende palavra por palavra conforme a rolagem
 * (opacidade mínima de 0,4, que ainda passa 3:1 como texto grande) e as
 * jornadas que o ecossistema conecta em linhas editoriais.
 */
export function TeaserManifesto() {
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const q = gsap.utils.selector(rootRef);
      gsap.fromTo(
        q("[data-word]"),
        { opacity: 0.4 },
        { opacity: 1, stagger: 0.12, ease: "none", scrollTrigger: { trigger: q("[data-words]")[0], start: "top 82%", end: "bottom 48%", scrub: true } },
      );
    },
    { scope: rootRef },
  );

  return (
    <section ref={rootRef} id="manifesto" aria-labelledby="manifesto-title" className="relative mx-auto max-w-[1440px] px-5 py-24 sm:px-8 sm:py-32 lg:px-12 lg:py-40">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <h2 id="manifesto-title" className="font-mono text-[12px] uppercase tracking-[0.2em] text-white/70 lg:col-span-3 lg:pt-4">
          O que é a PRX
        </h2>
        <p data-words className="text-balance text-[clamp(30px,4.6vw,68px)] font-light leading-[1.06] tracking-[-0.025em] text-white lg:col-span-9">
          {MANIFESTO.split(" ").map((word, i) => (
            <span key={`${word}-${i}`} data-word>
              {word}{" "}
            </span>
          ))}
        </p>
      </div>

      <ol aria-label="Jornadas que a PRX conecta" className="mt-20 border-t border-white/10 lg:mt-28">
        {TEASER_JOURNEYS.map(([from, to], i) => (
          <li key={from} className="border-b border-white/10">
            <Reveal index={i} amount={0.5} className="grid grid-cols-[3rem_1fr] items-baseline gap-x-4 py-6 sm:grid-cols-[4rem_1fr_1fr] sm:py-8 lg:grid-cols-12">
              <span className="font-mono text-[12px] tracking-[0.18em] text-white/55 lg:col-span-3">{String(i + 1).padStart(2, "0")}</span>
              <span className="ob-display text-[clamp(20px,2.6vw,36px)] leading-[1.1] tracking-[0.05em] text-white lg:col-span-4">{from}</span>
              <span className="ob-display col-start-2 text-[clamp(20px,2.6vw,36px)] leading-[1.1] tracking-[0.05em] text-[#b69cfb] sm:col-start-auto lg:col-span-5">{to}</span>
            </Reveal>
          </li>
        ))}
      </ol>

      <Reveal amount={0.6} className="mt-20 grid grid-cols-1 lg:mt-28 lg:grid-cols-12">
        <p className="text-balance text-[clamp(24px,3vw,42px)] font-light leading-[1.15] tracking-[-0.02em] text-white/80 lg:col-span-8 lg:col-start-4">
          Não queremos apenas falar com a próxima geração. <span className="text-white">Queremos crescer com ela.</span>
        </p>
      </Reveal>
    </section>
  );
}
