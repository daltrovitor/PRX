// Hello World
"use client";

import { createContext, useContext, useRef, type ReactNode } from "react";
import Image, { type StaticImageData } from "next/image";
import { motion, useScroll, useTransform } from "motion/react";
import { cn } from "@/lib/utils";
import { LIQUID, SPRING_UI, Specular, rise } from "@/components/marketing/landing/landing-kit";

/*
 * Peças da apresentação PRX (show.prx.app.br), na mesma linguagem da landing:
 * palco obsidiana com névoa violeta e cobalto, vidro líquido, títulos monumentais
 * em Barlow caixa alta e revelações por mola (300/28) ligadas à rolagem.
 * Cada página tem um tom fixo — "night" (breu) ou "day" (branco) — e os
 * componentes leem as cores do tom pelas variáveis --s-* da própria seção.
 */

export type SlideTone = "night" | "day";

const ToneContext = createContext<SlideTone>("night");
export const useSlideTone = () => useContext(ToneContext);

export const TONE_CLASS: Record<SlideTone, string> = {
  night:
    "bg-[#050508] text-white [--s-ink:#ffffff] [--s-body:rgba(255,255,255,0.8)] [--s-muted:rgba(255,255,255,0.64)] [--s-line:rgba(255,255,255,0.1)] [--s-accent:#a78bfa] [--s-fill:#7c3aed]",
  day: "bg-white text-[#0b0b10] [--s-ink:#0b0b10] [--s-body:#3d3d48] [--s-muted:#5b5b66] [--s-line:rgba(11,11,16,0.09)] [--s-accent:#7c3aed] [--s-fill:#7c3aed]",
};

const glass = (tone: SlideTone) => (tone === "night" ? LIQUID.dark : LIQUID.light);

/** Borda especular das "ilhas" fotográficas (escuras nos dois tons). */
export const PHOTO_EDGE = "border border-x-white/10 border-t-white/30 border-b-white/5 bg-[#07070b]";

/* -------------------------------------------------------------------------- */
/* Página                                                                     */
/* -------------------------------------------------------------------------- */

export interface SlideProps {
  id: string;
  index: number;
  tone: SlideTone;
  /** Rótulo da página no sumário e no topo (ex.: "PRX PASS"). */
  label: string;
  media?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Uma página da apresentação: altura da tela no mínimo, conteúdo centrado na grade de 1200px. */
export function Slide({ id, index, tone, label, media, children, className }: SlideProps) {
  return (
    <ToneContext.Provider value={tone}>
      <section
        id={id}
        data-slide={index}
        data-tone={tone}
        data-label={label}
        aria-labelledby={`${id}-title`}
        className={cn("show-slide relative isolate flex min-h-dvh scroll-mt-0 items-center overflow-hidden px-5 pb-20 pt-28 sm:px-8 lg:pb-24 lg:pt-32", TONE_CLASS[tone], className)}
      >
        {media}
        <div className="relative mx-auto w-full max-w-[1200px]">{children}</div>
      </section>
    </ToneContext.Provider>
  );
}

/** Névoa da identidade: violeta e cobalto (mais contida no branco). */
export function Haze({ at = "70% 40%", className }: { at?: string; className?: string }) {
  const tone = useSlideTone();
  const strength = tone === "night" ? [0.26, 0.12] : [0.08, 0.05];
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 -z-10", className)}
      style={{
        background: `radial-gradient(52rem 34rem at ${at}, rgba(124,58,237,${strength[0]}), transparent 70%), radial-gradient(60rem 26rem at 50% 115%, rgba(0,102,255,${strength[1]}), transparent 72%)`,
      }}
    />
  );
}

/** Foto de fundo com leve paralaxe (só transform) e o degradê que protege o texto. */
export function BackdropPhoto({ src, focus = "object-center", shade = "left" }: { src: StaticImageData; focus?: string; shade?: "left" | "bottom" | "full" }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], ["-6%", "6%"]);
  const gradient = {
    left: "bg-[linear-gradient(90deg,#050508_0%,rgba(5,5,8,0.92)_38%,rgba(5,5,8,0.35)_70%,rgba(5,5,8,0.55)_100%)] max-lg:bg-[linear-gradient(180deg,rgba(5,5,8,0.7)_0%,rgba(5,5,8,0.9)_45%,#050508_100%)]",
    bottom: "bg-[linear-gradient(180deg,rgba(5,5,8,0.55)_0%,rgba(5,5,8,0.2)_35%,rgba(5,5,8,0.85)_75%,#050508_100%)]",
    full: "bg-[rgba(5,5,8,0.72)]",
  }[shade];
  return (
    <div ref={ref} aria-hidden className="absolute inset-0 -z-10 overflow-hidden">
      <motion.div style={{ y }} className="absolute inset-[-8%_0]">
        <Image src={src} alt="" fill sizes="100vw" placeholder="blur" className={cn("object-cover opacity-80", focus)} />
      </motion.div>
      <div className={cn("absolute inset-0", gradient)} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Tipografia                                                                 */
/* -------------------------------------------------------------------------- */

/** Nome do produto, monumental: "PRX" no tom da página e o nome em violeta. */
export function ProductName({ id, name, className }: { id: string; name: string; className?: string }) {
  return (
    <Reveal>
      <h2 id={`${id}-title`} className={cn("ob-display text-[clamp(44px,12vw,128px)] leading-[0.92] tracking-[0.05em] text-[var(--s-ink)]", className)}>
        PRX <span className="text-[var(--s-accent)]">{name}</span>
      </h2>
    </Reveal>
  );
}

const MOTION_TAG = { h1: motion.h1, h2: motion.h2, h3: motion.h3, p: motion.p } as const;

const maskLine = {
  hidden: { y: "108%" },
  show: (i: number) => ({ y: "0%", transition: { ...SPRING_UI, delay: 0.06 + i * 0.08 } }),
};

/**
 * Linhas que sobem por trás de uma máscara (tipografia cinética), uma a uma.
 * Quem observa a entrada na tela é o bloco: a linha escondida pela máscara não
 * cruza a tela (o overflow do pai a recorta) e nunca dispararia sozinha.
 */
export function Masked({ lines, as = "p", id, className }: { lines: ReadonlyArray<ReactNode>; as?: keyof typeof MOTION_TAG; id?: string; className?: string }) {
  const Tag = MOTION_TAG[as];
  return (
    <Tag id={id} className={className} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.4 }}>
      {lines.map((line, i) => (
        <span key={i} className="block overflow-hidden pb-[0.1em]">
          <motion.span className="block" custom={i} variants={maskLine}>
            {line}
          </motion.span>
        </span>
      ))}
    </Tag>
  );
}

/** Frase de impacto do produto (grotesca, peso 600, tracking fechado). */
export function Tagline({ lines, className }: { lines: ReadonlyArray<ReactNode>; className?: string }) {
  return (
    <Masked
      lines={lines}
      className={cn("mt-5 text-balance text-[clamp(26px,4.6vw,50px)] font-semibold leading-[1.02] tracking-[-0.045em] text-[var(--s-ink)] sm:mt-7", className)}
    />
  );
}

export function Lead({ children, className, index = 1 }: { children: ReactNode; className?: string; index?: number }) {
  return (
    <Reveal index={index}>
      <p className={cn("mt-5 max-w-[620px] text-pretty text-[16px] leading-relaxed text-[var(--s-body)] sm:text-[19px]", className)}>{children}</p>
    </Reveal>
  );
}

/** Assinatura em inglês da página ("The future pays more."). */
export function Signature({ children, className, index = 3 }: { children: ReactNode; className?: string; index?: number }) {
  return (
    <Reveal index={index}>
      <p className={cn("ob-label mt-8 text-[13px] text-[var(--s-accent)] sm:text-[14px]", className)}>{children}</p>
    </Reveal>
  );
}

/** Fecho da página: frase grande com a segunda parte opcional em violeta. */
export function Statement({ children, accent, className, index = 2 }: { children: ReactNode; accent?: ReactNode; className?: string; index?: number }) {
  return (
    <Reveal index={index}>
      <p className={cn("max-w-[900px] text-balance text-[clamp(22px,3.6vw,40px)] font-semibold leading-[1.1] tracking-[-0.035em] text-[var(--s-ink)]", className)}>
        {children}
        {accent && (
          <>
            {" "}
            <span className="text-[var(--s-accent)]">{accent}</span>
          </>
        )}
      </p>
    </Reveal>
  );
}

/* -------------------------------------------------------------------------- */
/* Blocos                                                                     */
/* -------------------------------------------------------------------------- */

export function Reveal({ children, index = 0, className, amount = 0.35 }: { children: ReactNode; index?: number; className?: string; amount?: number }) {
  return (
    <motion.div custom={index} variants={rise} initial="hidden" whileInView="show" viewport={{ once: true, amount }} className={className}>
      {children}
    </motion.div>
  );
}

/** Pílulas de vidro (ex.: Descontos. Cashback. Acesso antecipado.). */
export function Chips({ items, className, index = 2, label }: { items: ReadonlyArray<string>; className?: string; index?: number; label: string }) {
  const tone = useSlideTone();
  return (
    <Reveal index={index}>
      <ul aria-label={label} className={cn("mt-7 flex flex-wrap gap-2 sm:gap-2.5", className)}>
        {items.map((item) => (
          <li key={item} className={cn("rounded-full px-4 py-2.5 text-[14px] font-medium text-[var(--s-ink)] sm:text-[15px]", glass(tone))}>
            {item}
          </li>
        ))}
      </ul>
    </Reveal>
  );
}

/** Cartão de vidro com o reflexo especular da landing. */
export function GlassCard({ children, className }: { children: ReactNode; className?: string }) {
  const tone = useSlideTone();
  return (
    <div className={cn("relative overflow-hidden rounded-[24px] p-6 sm:p-7", glass(tone), className)}>
      <Specular />
      <div className="relative">{children}</div>
    </div>
  );
}

/** Lista numerada 01, 02, 03… com fio entre os itens. */
export function Steps({ items, className, label, size = "md" }: { items: ReadonlyArray<ReactNode>; className?: string; label: string; size?: "md" | "lg" }) {
  return (
    <ol aria-label={label} className={cn("border-t border-[var(--s-line)]", className)}>
      {items.map((item, i) => (
        <motion.li
          key={i}
          custom={i}
          variants={rise}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.6 }}
          className={cn("flex items-baseline gap-4 border-b border-[var(--s-line)] py-4 sm:gap-6", size === "lg" && "py-5 sm:py-6")}
        >
          <span aria-hidden className="ob-label w-8 shrink-0 text-[12px] tabular-nums text-[var(--s-accent)]">
            {String(i + 1).padStart(2, "0")}
          </span>
          <span className={cn("text-pretty font-medium text-[var(--s-ink)]", size === "lg" ? "text-[clamp(18px,2.2vw,24px)] tracking-[-0.02em]" : "text-[16px] sm:text-[17px]")}>{item}</span>
        </motion.li>
      ))}
    </ol>
  );
}

/** Foto em moldura de vidro escuro (ilha fotográfica, igual nos dois tons). */
export function PhotoFrame({ src, alt, focus = "object-center", className, sizes = "(min-width: 1024px) 480px, 100vw", children }: { src: StaticImageData; alt: string; focus?: string; className?: string; sizes?: string; children?: ReactNode }) {
  return (
    <div className={cn("relative isolate overflow-hidden rounded-[28px] shadow-[0_40px_90px_-30px_rgba(0,0,0,0.75),0_0_80px_-30px_rgba(124,58,237,0.45)]", PHOTO_EDGE, className)}>
      <Image src={src} alt={alt} fill sizes={sizes} placeholder="blur" className={cn("-z-10 object-cover", focus)} />
      <span aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(5,5,8,0.1)_0%,rgba(5,5,8,0)_40%,rgba(5,5,8,0.75)_100%)]" />
      <Specular className="-left-24 -top-24 h-72 w-72" />
      {children}
    </div>
  );
}
