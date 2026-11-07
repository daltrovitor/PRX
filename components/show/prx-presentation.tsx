// Hello World
"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, cancelFrame, frame, motion, useScroll, useSpring, type FrameData } from "motion/react";
import { ReactLenis, type LenisRef } from "lenis/react";
import type { LenisOptions } from "lenis";
import { PrxLogo } from "@/components/brand/prx-logo";
import { ViraWebCredit } from "@/components/brand/viraweb-credit";
import { LIQUID, SPRING_UI, Specular, type Tone } from "@/components/marketing/landing/landing-kit";
import { Slide } from "@/components/show/show-kit";
import { buildSlides } from "@/components/show/show-slides";
import { useMainSiteUrl } from "@/lib/site";
import { cn } from "@/lib/utils";

/*
 * Apresentação "PRX — The ecosystem for the next generation", servida em
 * show.prx.app.br (proxy.ts reescreve a raiz do subdomínio para /apresentacao).
 * Mesma linguagem da landing: Lenis dentro do loop de quadros do Motion, cápsula
 * de vidro que troca de tom com a página, molas 300/28 e revelações na rolagem.
 * Navegação de apresentação: ↓ → PageDown e Espaço avançam; ↑ ← PageUp voltam;
 * Home e End vão à capa e ao fim. O endereço guarda a página (#pass, #live…).
 */

const LENIS_OPTIONS: LenisOptions = { autoRaf: false, lerp: 0.08, anchors: true, syncTouch: false };
const SCROLL = { duration: 1.1 } as const;

const toneOf = (tone: "night" | "day"): Tone => (tone === "night" ? "dark" : "light");
const BAR_TEXT: Record<Tone, string> = { dark: "text-white", light: "text-[#0b0b10]" };
const NAV_LINK: Record<Tone, string> = {
  dark: "text-white/80 hover:bg-white/[0.08] hover:text-white",
  light: "text-[#3d3d48] hover:bg-black/[0.05] hover:text-[#0b0b10]",
};
const MENU_PANEL: Record<Tone, string> = {
  dark: "border border-x-white/10 border-t-white/25 border-b-white/5 bg-[#0b0b12]/90 text-white shadow-[0_24px_48px_-12px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.14)]",
  light: "border border-x-black/[0.06] border-t-white border-b-black/[0.08] bg-white/95 text-[#0b0b10] shadow-[0_24px_48px_-20px_rgba(22,12,52,0.3),inset_0_1px_1px_rgba(255,255,255,0.9)]",
};

const pad = (n: number) => String(n).padStart(2, "0");

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

function Arrow({ up = false }: { up?: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={cn("h-[18px] w-[18px]", up && "rotate-180")} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14" />
      <path d="m6 13 6 6 6-6" />
    </svg>
  );
}

export function PrxPresentation() {
  const appUrl = useMainSiteUrl();
  const slides = useMemo(() => buildSlides(appUrl), [appUrl]);
  const lenisRef = useRef<LenisRef>(null);
  const [current, setCurrent] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const headerRef = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 300, damping: 40, mass: 0.4 });

  const tone = toneOf(slides[current]?.tone ?? "night");
  const total = slides.length;

  // Lenis avança dentro do frame loop do Motion: rolagem e molas leem o mesmo quadro.
  useEffect(() => {
    const update = (data: FrameData) => lenisRef.current?.lenis?.raf(data.timestamp);
    frame.update(update, true);
    return () => cancelFrame(update);
  }, []);

  // Página atual = a que cruza o meio da tela.
  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>("section[data-slide]"));
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setCurrent(Number((entry.target as HTMLElement).dataset.slide ?? 0));
        }
      },
      { rootMargin: "-50% 0px -50% 0px" },
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [slides]);

  // O endereço acompanha a página (compartilhar show.prx.app.br/#live abre no PRX LIVE).
  useEffect(() => {
    const id = slides[current]?.id;
    if (!id) return;
    const next = current === 0 ? window.location.pathname + window.location.search : `#${id}`;
    if (current === 0 ? window.location.hash !== "" : window.location.hash !== `#${id}`) window.history.replaceState(null, "", next);
  }, [current, slides]);

  const goTo = useCallback(
    (index: number) => {
      const target = document.getElementById(slides[Math.max(0, Math.min(total - 1, index))]?.id ?? "");
      if (!target) return;
      const lenis = lenisRef.current?.lenis;
      if (lenis) lenis.scrollTo(target, SCROLL);
      else target.scrollIntoView({ behavior: "smooth" });
    },
    [slides, total],
  );

  /** Avança: páginas mais altas que a tela (celular) rolam por partes antes de trocar. */
  const step = useCallback(
    (dir: 1 | -1, whole = false) => {
      const section = document.getElementById(slides[current]?.id ?? "");
      const lenis = lenisRef.current?.lenis;
      if (section && lenis && !whole) {
        const rect = section.getBoundingClientRect();
        const view = window.innerHeight;
        if (dir === 1 && rect.bottom > view + 8) return lenis.scrollTo(window.scrollY + Math.min(view * 0.85, rect.bottom - view), SCROLL);
        if (dir === -1 && rect.top < -8) return lenis.scrollTo(window.scrollY + Math.max(-view * 0.85, rect.top), SCROLL);
      }
      goTo(current + dir);
    },
    [current, goTo, slides],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return;
      if (menuOpen && e.key === "Escape") {
        setMenuOpen(false);
        menuButton.current?.focus();
        return;
      }
      if (menuOpen) return;
      // Espaço sobre um link ou botão focado é clique, não navegação.
      const onControl = e.target instanceof HTMLElement && e.target.closest("a, button");
      const keys: Record<string, () => void> = {
        ArrowDown: () => step(1),
        PageDown: () => step(1),
        ArrowRight: () => step(1, true),
        ArrowUp: () => step(-1),
        PageUp: () => step(-1),
        ArrowLeft: () => step(-1, true),
        Home: () => goTo(0),
        End: () => goTo(total - 1),
      };
      if (e.key === " " && !onControl) keys[" "] = () => step(e.shiftKey ? -1 : 1);
      const action = keys[e.key];
      if (!action) return;
      e.preventDefault();
      action();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo, menuOpen, step, total]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: PointerEvent) => {
      if (e.target instanceof Node && !headerRef.current?.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [menuOpen]);

  return (
    <MotionConfig reducedMotion="user">
      <ReactLenis root ref={lenisRef} options={LENIS_OPTIONS}>
        <div className="prx-show min-h-dvh overflow-x-clip bg-[#050508] text-white selection:bg-[#7c3aed] selection:text-white">
          <header ref={headerRef} className="fixed inset-x-0 top-0 z-50 px-2 pt-2 sm:px-4 sm:pt-3">
            <div
              className={cn(
                "relative mx-auto flex h-14 max-w-[1200px] items-center justify-between gap-2 overflow-hidden rounded-full pl-4 pr-1 transition-[background-color,border-color,box-shadow,color] duration-500 sm:h-16 sm:pl-6 sm:pr-2",
                LIQUID[tone],
                BAR_TEXT[tone],
              )}
            >
              <motion.span aria-hidden style={{ scaleX: progress }} className="absolute inset-x-6 bottom-0 h-px origin-left bg-[#7c3aed]" />
              <a href="#capa" className="flex min-h-12 shrink-0 cursor-pointer items-center" aria-label="PRX — voltar à capa">
                <PrxLogo variant="compact" title="" className="h-[22px] w-auto sm:h-6" />
              </a>

              <p className="ob-label hidden truncate text-[12px] opacity-85 md:block" aria-live="polite">
                {slides[current]?.label}
              </p>

              <div className="flex items-center gap-0.5 sm:gap-1">
                <p className="ob-label px-2 text-[12px] tabular-nums opacity-85" aria-label={`Página ${current + 1} de ${total}`}>
                  {pad(current + 1)}
                  <span aria-hidden className="opacity-50">
                    {" "}
                    / {pad(total)}
                  </span>
                </p>
                <a
                  href={appUrl}
                  className="hidden min-h-12 cursor-pointer items-center whitespace-nowrap rounded-full bg-[#7c3aed] px-5 text-[14px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_10px_28px_-10px_rgba(124,58,237,0.8)] transition-[background-color,transform] duration-200 hover:bg-[#6d28d9] active:scale-[0.98] min-[400px]:inline-flex"
                >
                  Entrar na PRX
                </a>
                <button
                  ref={menuButton}
                  type="button"
                  aria-expanded={menuOpen}
                  aria-controls={menuId}
                  aria-label={menuOpen ? "Fechar sumário" : "Abrir sumário"}
                  onClick={() => setMenuOpen((o) => !o)}
                  className={cn("inline-flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors", NAV_LINK[tone])}
                >
                  <span aria-hidden className="relative block h-3 w-[18px]">
                    <span className={cn("absolute left-0 top-0 h-[1.5px] w-full rounded-full bg-current transition-transform duration-300", menuOpen && "translate-y-[5.25px] rotate-45")} />
                    <span className={cn("absolute bottom-0 left-0 h-[1.5px] w-full rounded-full bg-current transition-transform duration-300", menuOpen && "-translate-y-[5.25px] -rotate-45")} />
                  </span>
                </button>
              </div>
            </div>

            <AnimatePresence>
              {menuOpen && (
                <motion.nav
                  id={menuId}
                  aria-label="Sumário da apresentação"
                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                  transition={SPRING_UI}
                  data-lenis-prevent
                  className={cn(
                    "absolute right-2 top-[calc(100%+8px)] max-h-[calc(100dvh-96px)] w-[min(360px,calc(100vw-16px))] origin-top-right overflow-y-auto overscroll-contain rounded-[22px] p-2 backdrop-blur-2xl sm:right-4 lg:right-[max(1rem,calc((100vw-1200px)/2))]",
                    MENU_PANEL[tone],
                  )}
                >
                  <Specular />
                  <ol className="relative">
                    {slides.map((s, i) => (
                      <li key={s.id}>
                        <a
                          href={`#${s.id}`}
                          onClick={() => setMenuOpen(false)}
                          aria-current={i === current ? "page" : undefined}
                          className={cn("flex min-h-12 cursor-pointer items-center gap-3 rounded-[14px] px-3 text-[15px] font-medium transition-colors", NAV_LINK[tone], i === current && "bg-[#7c3aed]/15")}
                        >
                          <span aria-hidden className="ob-label w-6 text-[11px] tabular-nums opacity-60">
                            {pad(i + 1)}
                          </span>
                          {s.label}
                        </a>
                      </li>
                    ))}
                  </ol>
                </motion.nav>
              )}
            </AnimatePresence>
          </header>

          <main>
            {slides.map((s, i) => (
              <Slide key={s.id} id={s.id} index={i} tone={s.tone} label={s.label} media={s.media}>
                {s.content}
              </Slide>
            ))}
          </main>

          {/* Controles de apresentação (mouse e toque); o teclado faz o mesmo. */}
          <div className={cn("fixed bottom-4 right-4 z-40 hidden flex-col gap-2 rounded-full p-1 sm:flex", LIQUID[tone], BAR_TEXT[tone])}>
            <button type="button" onClick={() => step(-1, true)} disabled={current === 0} aria-label="Página anterior" className={cn("inline-flex h-12 w-12 cursor-pointer items-center justify-center rounded-full transition-colors disabled:cursor-default disabled:opacity-35", NAV_LINK[tone])}>
              <Arrow up />
            </button>
            <button type="button" onClick={() => step(1, true)} disabled={current === total - 1} aria-label="Próxima página" className={cn("inline-flex h-12 w-12 cursor-pointer items-center justify-center rounded-full transition-colors disabled:cursor-default disabled:opacity-35", NAV_LINK[tone])}>
              <Arrow />
            </button>
          </div>

          <footer className="border-t border-white/[0.06] bg-[#050508] px-5 py-8 text-[13px] text-white/70 sm:px-8">
            <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-between gap-4 sm:flex-row">
              <p>PRX — Next is Yours</p>
              <ViraWebCredit onDark />
            </div>
          </footer>
        </div>
      </ReactLenis>
    </MotionConfig>
  );
}
