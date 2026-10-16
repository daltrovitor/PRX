// Hello World
"use client";

import { useId, useRef } from "react";
import Image from "next/image";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { PrxRevealMark, addPrxRevealTweens, showPrxRevealFinal } from "@/components/brand/prx-logo-reveal";
import { Tagline } from "@/components/marketing/tagline";
import { TEASER_IMAGES, TEASER_MODULES } from "@/components/marketing/teaser/teaser-data";
import { TeaserWaitlist } from "@/components/marketing/teaser/teaser-waitlist";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const SEEN_KEY = "prx-teaser-intro";
/** Momento em que a cortina da abertura sobe (segundos da timeline). */
const CURTAIN_AT = 2.25;
const LINES = [
  { word: "EM", indent: "" },
  { word: "BREVE.", indent: "pl-[0.55em]" },
] as const;

/**
 * Abertura + primeira dobra do prx.app.br (composição editorial assimétrica):
 *   1. cortina obsidiana: o símbolo se encaixa, P R X sobem e "the next pays" abre;
 *   2. a cortina sobe e "EM BREVE." nasce letra a letra de dentro de máscaras,
 *      o cristal acende ao fundo e as réguas se desenham;
 *   3. depois, o cristal respira devagar, segue o cursor e desce em paralaxe ao rolar.
 * Quem já viu a abertura nesta sessão entra direto na cortina subindo.
 * Movimento reduzido: tudo parado e visível desde o início.
 */
export function TeaserHero() {
  const rootRef = useRef<HTMLElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  // Lido uma vez por montagem: no StrictMode o efeito roda duas vezes e a segunda leitura já veria a marca.
  const seenRef = useRef<boolean | null>(null);
  const uid = useId().replace(/:/g, "");

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) return;
      const q = gsap.utils.selector(root);
      const intro = q("[data-intro]")[0] as HTMLElement | undefined;
      if (intro) intro.style.animation = "none";

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        showPrxRevealFinal(q, gsap);
        gsap.set(q("[data-intro], [data-skip]"), {
          autoAlpha: 0,
          display: "none",
        });
        return;
      }

      const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
      timelineRef.current = tl;
      gsap.set(q("[data-logo]"), { autoAlpha: 1 });
      tl.add(addPrxRevealTweens(gsap.timeline({ defaults: { ease: "expo.out" } }), q, gsap).timeScale(1.3), 0)
        .fromTo(q("[data-intro-progress]"), { scaleX: 0 }, { scaleX: 1, duration: CURTAIN_AT - 0.15, ease: "none" }, 0)
        .to(q("[data-intro]"), { yPercent: -100, duration: 1.05, ease: "expo.inOut" }, CURTAIN_AT)
        .to(q("[data-skip]"), { autoAlpha: 0, duration: 0.3 }, CURTAIN_AT)
        .set(q("[data-intro], [data-skip]"), { display: "none" })
        .from(q("[data-char]"), { yPercent: 112, duration: 1.35, stagger: 0.05 }, CURTAIN_AT + 0.45)
        // O cristal acende tirando um véu escuro: a foto em si nunca fica invisível e pinta assim que carrega (LCP).
        .from(q("[data-crystal]"), { scale: 1.18, duration: 2.4, ease: "power2.out" }, CURTAIN_AT + 0.3)
        .fromTo(q("[data-crystal-veil]"), { opacity: 1 }, { opacity: 0, duration: 2.2, ease: "power2.out" }, CURTAIN_AT + 0.3)
        .from(
          q("[data-rule]"),
          {
            scaleX: 0,
            transformOrigin: "0% 50%",
            duration: 1.3,
            stagger: 0.12,
            ease: "power3.inOut",
          },
          CURTAIN_AT + 0.5,
        )
        .from(
          q("[data-fade]"),
          {
            y: 28,
            autoAlpha: 0,
            duration: 1.1,
            stagger: 0.09,
            ease: "power3.out",
          },
          CURTAIN_AT + 0.85,
        )
        .from(
          q("[data-index-item]"),
          {
            x: 18,
            autoAlpha: 0,
            duration: 0.9,
            stagger: 0.05,
            ease: "power3.out",
          },
          CURTAIN_AT + 0.9,
        );

      if (seenRef.current === null) {
        try {
          seenRef.current = sessionStorage.getItem(SEEN_KEY) === "1";
          sessionStorage.setItem(SEEN_KEY, "1");
        } catch {
          seenRef.current = false; // sem armazenamento (aba privada): a abertura toca inteira
        }
      }
      if (seenRef.current) tl.seek(CURTAIN_AT - 0.2);

      // Respiração lenta do cristal depois da entrada.
      gsap.to(q("[data-crystal-float]"), {
        y: -16,
        rotate: 1.2,
        duration: 6.5,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
      });

      // Paralaxe ao rolar: o cristal desce mais devagar que o texto.
      gsap.to(q("[data-crystal-scroll]"), {
        yPercent: 18,
        scale: 1.06,
        ease: "none",
        scrollTrigger: {
          trigger: root,
          start: "top top",
          end: "bottom top",
          scrub: true,
        },
      });
      gsap.to(q("[data-title]"), {
        yPercent: -14,
        ease: "none",
        scrollTrigger: {
          trigger: root,
          start: "top top",
          end: "bottom top",
          scrub: true,
        },
      });

      // O cristal segue o cursor de leve (só com mouse).
      if (window.matchMedia("(pointer: fine)").matches) {
        const target = q("[data-crystal-pointer]")[0];
        const toX = gsap.quickTo(target, "x", {
          duration: 1.4,
          ease: "power3.out",
        });
        const toY = gsap.quickTo(target, "y", {
          duration: 1.4,
          ease: "power3.out",
        });
        const move = (e: PointerEvent) => {
          toX((e.clientX / window.innerWidth - 0.5) * 36);
          toY((e.clientY / window.innerHeight - 0.5) * 28);
        };
        window.addEventListener("pointermove", move, { passive: true });
        return () => window.removeEventListener("pointermove", move);
      }
    },
    { scope: rootRef },
  );

  function skip() {
    const tl = timelineRef.current;
    if (tl && tl.time() < CURTAIN_AT) tl.seek(CURTAIN_AT);
  }

  return (
    <section ref={rootRef} aria-labelledby="teaser-title" className="relative min-h-dvh overflow-hidden">
      {/* Abertura: cobre a página até a cortina subir. Sem JavaScript, some sozinha (globals.css). */}
      <div data-intro aria-hidden className="teaser-intro fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#050508]">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(50%_40%_at_50%_50%,rgba(124,58,237,0.22),transparent_70%)]" />
        <PrxRevealMark uid={uid} className="relative h-auto w-[min(74vw,440px)] overflow-visible text-white" />
        <div className="absolute bottom-[16%] left-1/2 h-px w-[min(56vw,320px)] -translate-x-1/2 bg-white/15">
          <div data-intro-progress className="h-full origin-left bg-[#9468fa]" />
        </div>
      </div>
      <button
        type="button"
        data-skip
        onClick={skip}
        className="teaser-intro fixed bottom-4 right-4 z-[51] inline-flex min-h-12 cursor-pointer items-center px-4 text-[12px] font-medium uppercase tracking-[0.18em] text-white/75 transition-colors hover:text-white sm:bottom-6 sm:right-6"
      >
        Pular abertura
      </button>

      {/* Palco: haze violeta à direita, cobalto à esquerda e o cristal PRX. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-20 bg-[radial-gradient(48%_56%_at_78%_38%,rgba(124,58,237,0.26),transparent_72%),radial-gradient(40%_40%_at_0%_100%,rgba(0,102,255,0.12),transparent_70%)]"
      />
      <div data-crystal-scroll aria-hidden className="pointer-events-none absolute -right-[22%] top-[-4dvh] -z-10 aspect-[9/16] h-[78dvh] sm:-right-[6%] sm:h-[96dvh] lg:right-[2%] lg:h-[112dvh]">
        <div data-crystal className="absolute inset-0">
          <div data-crystal-pointer className="absolute inset-0">
            <div data-crystal-float className="absolute inset-0">
              <Image
                src={TEASER_IMAGES.crystal}
                alt=""
                fill
                loading="eager"
                fetchPriority="high"
                sizes="(min-width: 1024px) 46vw, 80vw"
                className="object-cover opacity-70 mix-blend-screen [mask-image:radial-gradient(closest-side,#000_42%,transparent_100%)] lg:opacity-90"
              />
            </div>
          </div>
          <div data-crystal-veil className="absolute inset-0 bg-[#050508] opacity-0 [mask-image:radial-gradient(closest-side,#000_55%,transparent_100%)]" />
        </div>
      </div>

      {/* Base escurecida: a lista de módulos fica legível sobre o cristal e a dobra se funde à faixa seguinte.
          Cristal e véu em unidades de tela: a altura da dobra pode mudar (frase sorteada) sem deslocar o fundo. */}
      <div aria-hidden className="absolute inset-x-0 top-[42dvh] -z-10 h-[58dvh] lg:h-[70dvh] bg-[linear-gradient(180deg,rgba(5,5,8,0)_0%,rgba(5,5,8,0.78)_55%,#050508_100%)]" />

      <div className="relative z-10 mx-auto flex min-h-dvh max-w-[1440px] flex-col justify-start gap-10 lg:justify-between px-5 pb-10 pt-24 sm:px-8 lg:px-12 lg:pb-12 lg:pt-28">
        <h1 id="teaser-title" data-title className="ob-display text-[clamp(64px,min(22vw,27dvh),208px)] leading-[0.84] tracking-[0.015em] text-white">
          <span className="sr-only">PRX: em breve.</span>
          <span aria-hidden className="block">
            {LINES.map(({ word, indent }) => (
              <span key={word} className={`block h-[0.9em] overflow-hidden leading-[0.9] ${indent}`}>
                {Array.from(word).map((char, i) => (
                  <span key={`${word}-${i}`} data-char className="inline-block">
                    {char}
                  </span>
                ))}
              </span>
            ))}
          </span>
        </h1>

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-6 xl:col-span-5">
            <div data-rule className="h-px bg-white/20" />
            <p data-fade className="ob-display mt-6 min-h-[2.36em] text-balance text-[clamp(20px,2.4vw,28px)] leading-[1.18] tracking-[0.06em] text-white">
              <Tagline />
            </p>
            <p data-fade className="mt-4 max-w-[520px] text-pretty text-[16px] leading-relaxed text-white/75 sm:text-[17px]">
              Conta digital, benefícios, eventos, investimentos, saúde mental e conexões num só ecossistema. A PRX chega em <strong className="font-semibold text-white">prx.app.br</strong>.
            </p>
            <div data-fade className="mt-8 max-w-[520px]">
              <TeaserWaitlist source="hero" />
            </div>
          </div>

          <nav aria-label="Módulos da PRX" className="hidden lg:col-span-4 lg:col-start-9 lg:block">
            <div data-rule className="h-px bg-white/20" />
            <ol className="mt-3">
              {TEASER_MODULES.map((m, i) => (
                <li key={m.id} data-index-item>
                  <a
                    href={`#${m.id}`}
                    className="group grid h-8 cursor-pointer grid-cols-[2.5rem_1fr_auto] items-center border-b border-white/[0.07] font-mono text-[12px] uppercase tracking-[0.14em] text-white/70 transition-colors hover:text-white"
                  >
                    <span className="text-white/55">{String(i + 1).padStart(2, "0")}</span>
                    <span className="text-white transition-transform duration-300 group-hover:translate-x-1">PRX {m.name}</span>
                    <span className="normal-case tracking-[0.04em]">{m.moment}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </div>
      </div>
    </section>
  );
}
