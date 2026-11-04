// Hello World
"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode, type Ref } from "react";
import { Tagline } from "@/components/marketing/tagline";
import Image, { type StaticImageData } from "next/image";
import {
  AnimatePresence,
  MotionConfig,
  cancelFrame,
  frame,
  motion,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useTransform,
  type FrameData,
  type MotionValue,
} from "motion/react";
import { ReactLenis, type LenisRef } from "lenis/react";
import { Moon, Sun } from "lucide-react";
import type { LenisOptions } from "lenis";
import { PrxLogo } from "@/components/brand/prx-logo";
import { OBSIDIAN_IMAGES } from "@/components/obsidian/obsidian-ui";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";
import { IN_VIEW, LIQUID, LuxuryButton, Specular, brl, rise, type Tone } from "@/components/marketing/landing/landing-kit";
import {
  AppShowcaseSection,
  AudiencesSection,
  DifferentialsSection,
  FaqSection,
  FinalCtaSection,
  HowItWorksSection,
  ParentSection,
  PlansSection,
  SecuritySection,
  type LandingLinks,
} from "@/components/marketing/landing/landing-sections";
import { AuthSection } from "@/components/marketing/landing/landing-auth";

/*
 * Landing da página inicial (rota "/") na identidade Cyber-Luxury Obsidian. Abre com três momentos guiados pela rolagem:
 *   1. Palco Obsidian: breu com haze violeta e cobalto, o cristal 3D PRX ao fundo,
 *      o manifesto monumental à esquerda e, no centro, o cartão de metal com o saldo.
 *   2. A página fixa: o breu se dissolve no branco, o cartão encolhe, PRX LIVE e
 *      PRX PASS entram pelas bordas e "Descontos reais. Vantagens exclusivas." surge.
 *   3. Fundo branco: "As bets lucram com a perda.", os destaques Bank, Coins & Level
 *      e Pass em Liquid Glass e os quatro pilares com as fotos originais da marca.
 * Depois vêm as seções aprofundadas (landing/landing-sections.tsx) e, no fim, o acesso
 * com Entrar e Criar conta (landing/landing-auth.tsx).
 * Tudo é ligado à rolagem (nada se move sozinho) com molas stiffness 300 / damping 28,
 * e o Lenis roda dentro do loop de quadros do Motion para os dois nunca descompassarem.
 */

const SPRING = { stiffness: 300, damping: 28, mass: 0.6 } as const;
/** Com movimento reduzido, a cena acompanha a rolagem sem o atraso elástico da mola. */
const INSTANT = { stiffness: 2000, damping: 200, mass: 0.1 } as const;
/** A partir de 1024px o título fica ao lado do cartão; abaixo disso, empilhado. */
const DESKTOP = "(min-width: 1024px)";
/** Celulares baixos (SE, Android compactos): o cartão começa mais abaixo do manifesto. */
const SHORT = "(max-height: 740px)";
const TINY = "(max-height: 620px)";
const REDUCE = "(prefers-reduced-motion: reduce)";

/** Lenis sem RAF próprio (quem avança é o frame loop do Motion) e com âncoras suaves. */
const LENIS_OPTIONS: LenisOptions = { autoRaf: false, lerp: 0.08, anchors: true, syncTouch: false };

function subscribeMedia(query: string) {
  return (callback: () => void) => {
    const mq = window.matchMedia(query);
    mq.addEventListener("change", callback);
    return () => mq.removeEventListener("change", callback);
  };
}

function useMedia(query: string, serverValue: boolean): boolean {
  return useSyncExternalStore(
    subscribeMedia(query),
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

/* -------------------------------------------------------------------------- */
/* Botões                                                                     */
/* -------------------------------------------------------------------------- */

/** Botão de baixar o app: instala o PWA quando o navegador oferece; senão abre o app. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

function useInstallPrompt() {
  const [event, setEvent] = useState<InstallPromptEvent | null>(null);
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  return event;
}

function DownloadButton({ appUrl, className }: { appUrl: string; className?: string }) {
  const install = useInstallPrompt();
  return (
    <motion.a
      href={appUrl}
      onClick={(e) => {
        if (!install) return;
        e.preventDefault();
        void install.prompt();
      }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
      className={cn(
        "inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-full bg-white px-6 text-[15px] font-semibold text-[#0b0b10]",
        "shadow-[inset_0_-1px_0_rgba(11,11,16,0.12),0_14px_36px_-14px_rgba(148,104,250,0.75)]",
        className,
      )}
    >
      <svg aria-hidden viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 4v11" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 20h14" />
      </svg>
      Baixar o app
    </motion.a>
  );
}

/* -------------------------------------------------------------------------- */
/* Cabeçalho                                                                  */
/* -------------------------------------------------------------------------- */

interface NavItem {
  href: `#${string}`;
  label: string;
  soon?: boolean;
}

const NAV: ReadonlyArray<NavItem> = [
  { href: "#bank", label: "Bank" },
  { href: "#pass", label: "Pass" },
  { href: "#live", label: "Live" },
  { href: "#invest", label: "Invest", soon: true },
  { href: "#me", label: "Me", soon: true },
  { href: "#sou-pai", label: "Sou Pai" },
];

/** Seções extras que só cabem no menu compacto (celular e tablet). */
const MENU_EXTRA: ReadonlyArray<NavItem> = [
  { href: "#app", label: "O app ao vivo" },
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#seguranca", label: "Segurança" },
  { href: "#planos", label: "Planos" },
  { href: "#faq", label: "Perguntas frequentes" },
];

/** Alternador claro/escuro: o ícone gira e troca com a mesma mola do resto da página. */
function ThemeSwitch({ tone, className }: { tone: Tone; className?: string }) {
  const { theme, toggleTheme, mounted } = useTheme();
  const dark = mounted ? theme === "dark" : true;
  const label = dark ? "Ativar modo claro" : "Ativar modo escuro";
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className={cn("relative inline-flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full transition-colors", NAV_LINK[tone], className)}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={dark ? "sun" : "moon"}
          aria-hidden
          initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
          animate={{ rotate: 0, opacity: 1, scale: 1 }}
          exit={{ rotate: 90, opacity: 0, scale: 0.6 }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
          className="flex"
        >
          {dark ? <Sun className="h-[18px] w-[18px]" strokeWidth={1.7} /> : <Moon className="h-[18px] w-[18px]" strokeWidth={1.7} />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

const BAR_TEXT: Record<Tone, string> = { dark: "text-white", light: "text-[#0b0b10]" };
const NAV_LINK: Record<Tone, string> = {
  dark: "text-white/75 hover:bg-white/[0.08] hover:text-white",
  light: "text-[#3d3d48] hover:bg-black/[0.05] hover:text-[#0b0b10]",
};
const SOON_PILL: Record<Tone, string> = {
  dark: "border-x-white/10 border-t-white/25 border-b-white/5 bg-white/[0.08] text-white/80",
  light: "border-x-black/[0.06] border-t-white border-b-black/[0.08] bg-white/80 text-[#5b5b66]",
};
/** Menus pedem vidro mais denso: a leitura não pode competir com o manifesto por baixo. */
const MENU_PANEL: Record<Tone, string> = {
  dark: "border border-x-white/10 border-t-white/25 border-b-white/5 bg-[#0b0b12]/85 text-white shadow-[0_24px_48px_-12px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.14)]",
  light: "border border-x-black/[0.06] border-t-white border-b-black/[0.08] bg-white/90 text-[#0b0b10] shadow-[0_24px_48px_-20px_rgba(22,12,52,0.3),inset_0_1px_1px_rgba(255,255,255,0.9)]",
};

function SoonPill({ tone, className }: { tone: Tone; className?: string }) {
  return (
    <span className={cn("rounded-full border px-1.5 py-px text-[10px] font-semibold uppercase leading-4 tracking-[0.08em] backdrop-blur-md", SOON_PILL[tone], className)}>
      Em breve
    </span>
  );
}

/**
 * Menu compacto do celular. O botão mora na cápsula e o painel fica fora dela, no
 * próprio <header>: aninhado na cápsula (que já tem backdrop-filter) o painel perderia o desfoque.
 */
function useMobileMenu() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const root = useRef<HTMLElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      if (e.target instanceof Node && !root.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return { open, setOpen, panelId, root, button };
}

interface MenuControlProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  panelId: string;
  tone: Tone;
}

function MenuButton({ open, onOpenChange, panelId, tone, ref }: MenuControlProps & { ref: Ref<HTMLButtonElement> }) {
  return (
    <button
      ref={ref}
      type="button"
      aria-expanded={open}
      aria-controls={panelId}
      aria-label={open ? "Fechar menu" : "Abrir menu"}
      onClick={() => onOpenChange(!open)}
      className={cn("inline-flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors lg:hidden", NAV_LINK[tone])}
    >
      <span aria-hidden className="relative block h-3 w-[18px]">
        <span className={cn("absolute left-0 top-0 h-[1.5px] w-full rounded-full bg-current transition-transform duration-300", open && "translate-y-[5.25px] rotate-45")} />
        <span className={cn("absolute bottom-0 left-0 h-[1.5px] w-full rounded-full bg-current transition-transform duration-300", open && "-translate-y-[5.25px] -rotate-45")} />
      </span>
    </button>
  );
}

function MenuLink({ item, tone, onNavigate }: { item: NavItem; tone: Tone; onNavigate: () => void }) {
  return (
    <a
      href={item.href}
      onClick={onNavigate}
      className={cn("flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-[14px] px-4 text-[16px] font-medium transition-colors", NAV_LINK[tone])}
    >
      {item.label}
      {item.soon && <SoonPill tone={tone} />}
    </a>
  );
}

function MenuPanel({ open, onOpenChange, panelId, tone, login }: MenuControlProps & { login?: string }) {
  const close = () => onOpenChange(false);
  return (
    <AnimatePresence>
      {open && (
        <motion.nav
          id={panelId}
          aria-label="Menu do site"
          initial={{ opacity: 0, y: -8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
          className={cn(
            "absolute inset-x-2 top-[calc(100%+8px)] max-h-[calc(100dvh-88px)] origin-top overflow-y-auto overscroll-contain rounded-[22px] p-2 backdrop-blur-2xl sm:inset-x-4 lg:hidden",
            MENU_PANEL[tone],
          )}
          data-lenis-prevent
        >
          <Specular />
          <p className="ob-label relative px-4 pb-1 pt-3 text-[10.5px] opacity-70">Pilares</p>
          <ul className="relative">
            {NAV.map((item) => (
              <li key={item.href}>
                <MenuLink item={item} tone={tone} onNavigate={close} />
              </li>
            ))}
          </ul>
          <p className="ob-label relative px-4 pb-1 pt-3 text-[10.5px] opacity-70">Conheça</p>
          <ul className="relative">
            {MENU_EXTRA.map((item) => (
              <li key={item.href}>
                <MenuLink item={item} tone={tone} onNavigate={close} />
              </li>
            ))}
          </ul>
          <div className={cn("relative mt-2 flex items-center justify-between gap-2 border-t px-2 pt-2", tone === "dark" ? "border-white/10" : "border-black/[0.07]")}>
            {login && (
              <a href={login} onClick={close} className={cn("inline-flex min-h-12 cursor-pointer items-center rounded-[14px] px-2 text-[16px] font-medium transition-colors min-[400px]:hidden", NAV_LINK[tone])}>
                Entrar
              </a>
            )}
            <span className="hidden text-[14px] opacity-80 min-[400px]:inline">Tema</span>
            <ThemeSwitch tone={tone} />
          </div>
        </motion.nav>
      )}
    </AnimatePresence>
  );
}

/**
 * Cápsula de vidro líquido flutuante; fumê sobre o palco Obsidian, leitosa sobre o branco
 * (no tema escuro ela fica sempre fumê). Entrar e Criar conta levam aos fluxos do app.
 */
function Header({ links, tone, onBackToApp }: { links: LandingLinks; tone: Tone; onBackToApp?: () => void }) {
  const { open, setOpen, panelId, root, button } = useMobileMenu();
  return (
    <header ref={root} className="fixed inset-x-0 top-0 z-50 px-2 pt-2 sm:px-4 sm:pt-3">
      <div
        className={cn(
          "relative mx-auto flex h-14 max-w-[1200px] items-center justify-between gap-1 rounded-full pl-3 pr-1 transition-[background-color,border-color,box-shadow,color] duration-500 min-[360px]:pl-4 sm:h-16 sm:gap-2 sm:pl-6 sm:pr-2",
          LIQUID[tone],
          BAR_TEXT[tone],
        )}
      >
        <a href="#topo" className="flex min-h-12 min-w-12 shrink-0 cursor-pointer items-center" aria-label="PRX — início">
          <PrxLogo variant="symbol" title="" className="h-6 w-auto min-[420px]:hidden" />
          <PrxLogo variant="compact" title="" className="hidden h-[22px] w-auto min-[420px]:block sm:h-6 xl:h-7" />
        </a>

        <nav aria-label="Menu principal" className="hidden items-center lg:flex">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={cn("inline-flex min-h-12 min-w-12 cursor-pointer items-center justify-center gap-1.5 rounded-full px-2.5 text-[14px] font-medium transition-colors xl:px-3.5 xl:text-[15px]", NAV_LINK[tone])}
            >
              {item.label}
              {item.soon && <SoonPill tone={tone} />}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-0.5 sm:gap-1">
          <ThemeSwitch tone={tone} className="hidden md:inline-flex" />
          {onBackToApp ? (
            <button
              type="button"
              onClick={onBackToApp}
              className="inline-flex min-h-12 cursor-pointer items-center justify-center whitespace-nowrap rounded-full bg-[#7c3aed] px-4 text-[14px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_10px_28px_-10px_rgba(124,58,237,0.8)] transition-[background-color,transform] duration-200 hover:bg-[#6d28d9] active:scale-[0.98] min-[360px]:px-5"
            >
              Voltar ao app
            </button>
          ) : (
            <>
              <a
                href={links.login}
                className={cn("hidden min-h-12 cursor-pointer items-center whitespace-nowrap rounded-full px-3 text-[14px] font-semibold transition-colors min-[400px]:inline-flex sm:px-4", NAV_LINK[tone])}
              >
                Entrar
              </a>
              <LuxuryButton href={links.signup} className="px-4 min-[360px]:px-5">
                Criar conta
              </LuxuryButton>
            </>
          )}
          <MenuButton ref={button} open={open} onOpenChange={setOpen} panelId={panelId} tone={tone} />
        </div>
      </div>
      <MenuPanel open={open} onOpenChange={setOpen} panelId={panelId} tone={tone} login={onBackToApp ? undefined : links.login} />
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/* Cartões do palco                                                           */
/* -------------------------------------------------------------------------- */

/*
 * Os cartões mudam de tamanho com a tela e com a animação; o conteúdo acompanha
 * em unidades do contêiner (cqw), mantendo a mesma proporção do celular ao desktop.
 * O @container fica no invólucro: cqw no próprio elemento mediria o contêiner de fora.
 */

/** Borda especular das "ilhas" fotográficas (escuras nos dois fundos). */
const PHOTO_EDGE = "border border-x-white/10 border-t-white/30 border-b-white/5 bg-[#07070b]";

/** Cartão principal: a imagem oficial do PRX BANK (cartão preto sobre obsidiana) com vidro reflexivo, o Pix recebido e o saldo. */
function HeroCard() {
  return (
    <div className="@container w-full">
      <div
        className={cn(
          "relative isolate aspect-[3/4] w-full overflow-hidden rounded-[9cqw] text-white",
          "shadow-[0_40px_90px_-30px_rgba(0,0,0,0.85),0_0_90px_-24px_rgba(124,58,237,0.45),inset_0_1px_1px_rgba(255,255,255,0.2)]",
          PHOTO_EDGE,
        )}
      >
        <Image
          src={OBSIDIAN_IMAGES.bankCard}
          alt="Cartão PRX preto apoiado em uma pedra de obsidiana"
          fill
          sizes="(min-width: 1280px) 420px, (min-width: 1024px) 400px, (min-width: 640px) 40vw, 58vw"
          loading="eager"
          fetchPriority="high"
          placeholder="blur"
          className="-z-10 object-cover object-[50%_58%]"
        />
        {/* Vidro reflexivo: diagonal de luz no topo e retorno violeta no canto oposto. */}
        <span
          aria-hidden
          className="absolute inset-0 -z-10 bg-[linear-gradient(125deg,rgba(255,255,255,0.16)_0%,rgba(255,255,255,0)_30%,rgba(255,255,255,0)_68%,rgba(148,104,250,0.16)_100%)]"
        />
        <span aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(5,5,8,0)_42%,rgba(5,5,8,0.72)_100%)]" />
        <Specular className="-left-[20cqw] -top-[20cqw] h-[70cqw] w-[70cqw]" />

        <div
          className={cn(
            "absolute left-1/2 top-[4.5cqw] flex max-w-[92%] -translate-x-1/2 items-center gap-[2cqw] whitespace-nowrap rounded-full py-[1.4cqw] pl-[1.4cqw] pr-[3.4cqw] text-[clamp(9px,3.1cqw,13px)] font-medium",
            LIQUID.dark,
          )}
        >
          <span aria-hidden className="flex h-[max(16px,6cqw)] w-[max(16px,6cqw)] shrink-0 items-center justify-center rounded-full bg-[#7c3aed] text-white">
            <svg viewBox="0 0 24 24" className="h-[60%] w-[60%]" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5" />
              <path d="m5 12 7 7 7-7" />
            </svg>
          </span>
          <span className="truncate">Pix recebido · + {brl.format(1250)}</span>
        </div>

        <div className={cn("absolute inset-x-[3.5cqw] bottom-[3.5cqw] overflow-hidden rounded-[6.5cqw] p-[4.8cqw]", LIQUID.dark)}>
          <Specular className="-left-[12cqw] -top-[16cqw] h-[50cqw] w-[50cqw]" />
          <p className="ob-label relative text-[clamp(8px,2.7cqw,11px)] text-white/75">Saldo PRX Bank</p>
          <p className="relative mt-[1.6cqw] whitespace-nowrap text-[10.5cqw] font-light leading-none tracking-[-0.03em] tabular-nums">
            R$ 3.482<span className="text-[0.62em]">,90</span>
          </p>
          <p className="relative mt-[2.2cqw] text-[clamp(10px,3.1cqw,13px)] leading-snug text-white/75 @max-[300px]:hidden">Cada compra em parceiro vira PRX Coins</p>
        </div>
      </div>
    </div>
  );
}

const SIDE_SIZES = "(min-width: 1280px) 269px, (min-width: 1024px) 256px, (min-width: 640px) 32vw, 46vw";

/** PRX LIVE: o show ao vivo, o ingresso VIP e o cashback em coins no balcão. */
function LiveCard() {
  return (
    <div className="@container w-full">
      <div
        className={cn(
          "relative isolate flex aspect-[3/4] w-full flex-col justify-between overflow-hidden rounded-[11cqw] p-[6cqw] text-white shadow-[0_30px_60px_-24px_rgba(22,12,52,0.55)]",
          PHOTO_EDGE,
        )}
      >
        <Image src={OBSIDIAN_IMAGES.liveConcert} alt="" fill sizes={SIDE_SIZES} placeholder="blur" className="-z-10 object-cover object-[50%_42%]" />
        <span
          aria-hidden
          className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(5,5,8,0.55)_0%,rgba(5,5,8,0)_32%,rgba(5,5,8,0.2)_55%,rgba(5,5,8,0.88)_100%)]"
        />
        <div className="flex items-start justify-between gap-[3cqw]">
          <p className="ob-label text-[clamp(10px,5.6cqw,15px)] leading-[1.15] tracking-[0.16em]">
            PRX
            <br />
            Live
          </p>
          <span className={cn("rounded-full px-[3.6cqw] py-[1.2cqw] text-[clamp(9px,4.4cqw,12px)] font-semibold tracking-[0.08em]", LIQUID.dark)}>VIP</span>
        </div>
        <div className={cn("relative overflow-hidden rounded-[7cqw] p-[5cqw]", LIQUID.dark)}>
          <p className="truncate text-[clamp(9px,4.6cqw,13px)] text-white/80">Ingresso VIP · sáb, 22h</p>
          <p className="mt-[1.6cqw] whitespace-nowrap text-[10cqw] font-light leading-none tracking-[-0.03em] tabular-nums">− {brl.format(180)}</p>
          <p className="mt-[3.6cqw] inline-flex max-w-full items-center whitespace-nowrap rounded-full bg-[#7c3aed] px-[3.4cqw] py-[1.3cqw] text-[clamp(8px,4.2cqw,12px)] font-semibold">
            <span className="truncate">+ 36 coins no balcão</span>
          </p>
        </div>
      </div>
    </div>
  );
}

/** PRX PASS: cupons digitais, desconto no balcão e o ecossistema de parceiros credenciados. */
function PassCard() {
  const coupons = [
    { label: "Cafés", off: 20 },
    { label: "Academias", off: 35 },
    { label: "Shows", off: 50 },
  ];
  return (
    <div className="@container w-full">
      <div className={cn("relative flex aspect-[3/4] w-full flex-col justify-between overflow-hidden rounded-[11cqw] p-[7cqw] text-[var(--rv-ink)]", LIQUID.surface)}>
        <Specular className="-left-[24cqw] -top-[28cqw] h-[90cqw] w-[90cqw]" />
        <div className="relative flex items-start justify-between gap-[4cqw]">
          <div className="min-w-0">
            <p className="ob-label text-[clamp(10px,5.6cqw,15px)] leading-[1.15] tracking-[0.16em]">
              PRX
              <br />
              Pass
            </p>
            <p className="mt-[1.8cqw] truncate text-[clamp(9px,4.6cqw,13px)] text-[var(--rv-muted)]">Parceiros credenciados</p>
          </div>
          <span aria-hidden className="flex h-[15cqw] w-[15cqw] shrink-0 items-center justify-center rounded-full bg-[#7c3aed]/10 text-[#7c3aed] dark:text-[#a78bfa]">
            <svg viewBox="0 0 24 24" className="h-1/2 w-1/2" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="4" width="6" height="6" rx="1" />
              <rect x="14" y="4" width="6" height="6" rx="1" />
              <rect x="4" y="14" width="6" height="6" rx="1" />
              <path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 20h2M20 14v2" />
            </svg>
          </span>
        </div>
        <div className="relative">
          <p className="whitespace-nowrap text-[14cqw] font-light leading-none tracking-[-0.04em] text-[#7c3aed] dark:text-[#a78bfa]">−50%</p>
          <p className="mt-[2cqw] truncate text-[clamp(9px,4.6cqw,13px)] text-[var(--rv-body)]">Cupom digital · QR protegido</p>
          <ul className="mt-[3.5cqw] space-y-[1.6cqw] text-[clamp(9px,4.6cqw,13px)]">
            {coupons.map((c) => (
              <li key={c.label} className="flex items-center justify-between gap-[3cqw] border-t border-[var(--rv-line)] pt-[1.6cqw]">
                <span className="truncate text-[var(--rv-body)]">{c.label}</span>
                <span className="font-semibold tabular-nums">−{c.off}%</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Momentos 1 e 2: seção fixada guiada pela rolagem                           */
/* -------------------------------------------------------------------------- */

type PhoneHeight = "tall" | "short" | "tiny";

/** Abaixo do manifesto, no celular: quanto mais baixa a tela, mais o cartão desce para não encostar no botão. */
function heroCardY(desktop: boolean, height: PhoneHeight): [string, string] {
  if (desktop) return ["0dvh", "0dvh"];
  const start = { tall: "15dvh", short: "22dvh", tiny: "27dvh" }[height];
  return [start, "0dvh"];
}

function useStage(progress: MotionValue<number>, desktop: boolean, height: PhoneHeight, reduce: boolean) {
  const p = useSpring(progress, reduce ? INSTANT : SPRING);
  return {
    p,
    // A luz nasce atrás do cartão e se expande até lavar o breu; só então o breu some de vez.
    bloom: useTransform(p, [0.2, 0.6], [0, 2.6]),
    night: useTransform(p, [0.34, 0.6], [1, 0]),
    crystalY: useTransform(p, [0, 0.6], ["0%", "-8%"]),
    crystalScale: useTransform(p, [0, 0.6], [1, 1.14]),
    crystalRotate: useTransform(p, [0, 0.6], [0, -6]),
    titleY: useTransform(p, [0, 0.32], [0, desktop ? -160 : -110]),
    titleOpacity: useTransform(p, [0.04, 0.26], [1, 0]),
    cardScale: useTransform(p, [0.08, 0.62], [1, desktop ? 0.64 : 0.82]),
    cardX: useTransform(p, [0.08, 0.62], desktop ? ["17vw", "0vw"] : ["0vw", "0vw"]),
    cardY: useTransform(p, [0.08, 0.62], heroCardY(desktop, height)),
    leftX: useTransform(p, [0.4, 0.8], ["-75vw", "0vw"]),
    rightX: useTransform(p, [0.4, 0.8], ["75vw", "0vw"]),
    sideOpacity: useTransform(p, [0.4, 0.62], [0, 1]),
    newTitleOpacity: useTransform(p, [0.5, 0.74], [0, 1]),
    newTitleY: useTransform(p, [0.5, 0.74], [48, 0]),
  };
}

function PinnedStory({ appUrl, reduceMotion, onTone }: { appUrl: string; reduceMotion: boolean; onTone: (tone: Tone) => void }) {
  const ref = useRef<HTMLElement>(null);
  const desktop = useMedia(DESKTOP, true);
  const short = useMedia(SHORT, false);
  const tiny = useMedia(TINY, false);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const s = useStage(scrollYProgress, desktop, tiny ? "tiny" : short ? "short" : "tall", reduceMotion);

  // A cápsula do topo acompanha o palco: fumê enquanto o breu domina, leitosa quando a luz a alcança.
  useMotionValueEvent(s.p, "change", (v) => onTone(v < 0.45 ? "dark" : "light"));

  return (
    <section ref={ref} id="topo" aria-labelledby="manifesto" className="relative h-[300dvh] lg:h-[320dvh]">
      <div className="sticky top-0 h-dvh overflow-hidden bg-[var(--rv-bg)]">
        {/* Palco Obsidian: breu, haze violeta ao centro, cobalto na base e o cristal PRX fundido ao fundo. */}
        <motion.div aria-hidden style={{ opacity: s.night }} className="absolute inset-0 bg-[#050508]">
          <div className="absolute inset-0 bg-[radial-gradient(62%_52%_at_50%_46%,rgba(124,58,237,0.28),transparent_72%),radial-gradient(90%_42%_at_50%_108%,rgba(0,102,255,0.14),transparent_72%)]" />
          <motion.div
            style={{ y: s.crystalY, scale: s.crystalScale, rotate: s.crystalRotate }}
            className="absolute left-1/2 top-[30%] aspect-[9/16] h-[80%] -translate-x-1/2 mix-blend-screen lg:left-[58%] lg:top-[-5%] lg:h-[110%]"
          >
            <Image
              src={OBSIDIAN_IMAGES.crystal}
              alt=""
              fill
              sizes="(min-width: 1024px) 34rem, 100vw"
              loading="eager"
              placeholder="blur"
              className="object-cover opacity-90 [mask-image:radial-gradient(closest-side,#000_42%,transparent_100%)]"
            />
          </motion.div>
        </motion.div>

        {/* Bloom: a clareza do vidro nasce atrás do cartão (segue a mesma posição) e se espalha em luz difusa lavanda. */}
        <motion.div
          aria-hidden
          style={{ x: s.cardX, y: s.cardY, scale: s.bloom }}
          className="absolute left-1/2 top-[60%] aspect-square w-[100vmax] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,var(--rv-bg)_30%,var(--rv-bloom)_62%,transparent_100%)] lg:top-[58%]"
        />

        {/* Clareza do vidro: luz ambiente mínima sobre o branco para o Liquid Glass ter o que refratar. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(46rem_26rem_at_50%_62%,rgba(124,58,237,0.07),transparent_70%),radial-gradient(40rem_20rem_at_50%_100%,rgba(0,102,255,0.05),transparent_70%)]"
        />

        {/* Momento 1: o manifesto monumental à esquerda */}
        <motion.div
          style={{ y: s.titleY, opacity: s.titleOpacity }}
          className="absolute inset-x-0 top-[84px] z-20 mx-auto w-full max-w-[1200px] px-5 sm:top-[108px] sm:px-8 lg:top-1/2 lg:-translate-y-1/2"
        >
          <div className="max-w-[560px]">
            <h1 id="manifesto" className="ob-display text-[clamp(25px,8.2vw,46px)] leading-[1.1] tracking-[0.07em] text-white lg:text-[clamp(40px,3.9vw,60px)]">
              <Tagline />
            </h1>
            <p className="mt-4 max-w-[460px] text-[15px] leading-relaxed text-white/75 sm:mt-6 sm:text-[17px]">
              Sua vida financeira, benefícios reais e comunidade exclusiva unificados em um só ecossistema. Cada gasto em parceiro vira PRX Coins e impulsiona o seu nível.
            </p>
            <DownloadButton appUrl={appUrl} className="mt-5 sm:mt-8" />
          </div>
        </motion.div>

        {/* Momento 2: novo título centralizado, já sobre o branco */}
        <motion.div
          style={{ opacity: s.newTitleOpacity, y: s.newTitleY }}
          className="pointer-events-none absolute inset-x-0 top-[88px] z-20 px-5 text-center sm:top-[112px] lg:top-[11dvh]"
        >
          <h2 className="mx-auto max-w-[860px] text-balance text-[clamp(24px,7.6vw,52px)] font-semibold leading-[1] tracking-[-0.045em] text-[var(--rv-ink)] lg:text-[clamp(44px,4vw,64px)]">
            Descontos reais.
            <br />
            Vantagens exclusivas.
          </h2>
          <p className="mx-auto mt-3 max-w-[560px] text-pretty text-[15px] leading-relaxed text-[var(--rv-muted)] sm:mt-4 sm:text-[17px]">
            Do café diário aos grandes eventos: cada pagamento via Pix é categorizado no PRX Map e devolve vantagens instantâneas.
          </p>
        </motion.div>

        {/* Fileira de cartões: o central encolhe, os laterais entram pelas bordas */}
        {/* --c: largura do cartão central · --s: escala final · --side: largura dos laterais · --gap: respiro entre eles */}
        {/* No desktop o cartão respeita a altura da tela e, no fim, os três cartões têm a mesma largura (--side = --c × --s). */}
        <div className="absolute inset-x-0 top-[60%] z-10 [--c:58vw] [--gap:12px] [--s:0.82] [--side:46vw] max-[380px]:[--c:50vw] sm:[--c:40vw] sm:[--side:32vw] lg:top-[58%] lg:[--c:min(400px,46dvh)] lg:[--gap:24px] lg:[--s:0.64] lg:[--side:calc(var(--c)*var(--s))] xl:[--c:min(420px,46dvh)]">
          <motion.div
            style={{ x: s.leftX, opacity: s.sideOpacity }}
            className="absolute left-[calc(50%_-_var(--c)*var(--s)/2_-_var(--gap)_-_var(--side))] top-0 w-[var(--side)] -translate-y-1/2"
          >
            <LiveCard />
          </motion.div>
          <motion.div style={{ x: s.cardX, y: s.cardY, scale: s.cardScale }} className="absolute left-1/2 top-0 w-[var(--c)] -translate-x-1/2 -translate-y-1/2">
            <HeroCard />
          </motion.div>
          <motion.div
            style={{ x: s.rightX, opacity: s.sideOpacity }}
            className="absolute left-[calc(50%_+_var(--c)*var(--s)/2_+_var(--gap))] top-0 w-[var(--side)] -translate-y-1/2"
          >
            <PassCard />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Momento 3: gamificação, destaques e os quatro pilares                      */
/* -------------------------------------------------------------------------- */

function HighlightCard({ id, title, children, text, index }: { id?: string; title: string; children: ReactNode; text: string; index: number }) {
  return (
    // A âncora fica no <li> parado: a revelação anima só o conteúdo, e o Lenis mede a posição final.
    <li id={id} className="scroll-mt-28">
      <motion.div custom={index} variants={rise} initial="hidden" whileInView="show" viewport={IN_VIEW} className="h-full">
        <article className={cn("relative flex h-full flex-col justify-between gap-10 overflow-hidden rounded-[28px] p-6 text-[var(--rv-ink)] sm:p-7 lg:min-h-[300px]", LIQUID.surface)}>
          <Specular />
          <h3 className="ob-label relative text-[12px] text-[var(--rv-body)]">{title}</h3>
          <div className="relative">
            {children}
            <p className="mt-4 max-w-[300px] text-[15px] leading-relaxed text-[var(--rv-body)]">{text}</p>
          </div>
        </article>
      </motion.div>
    </li>
  );
}

function LevelBar() {
  return (
    <div>
      <p className="text-[40px] font-light leading-none tracking-[-0.04em] tabular-nums sm:text-[46px]">+ 120 coins</p>
      <div className="mt-5 flex items-center justify-between text-[12px] font-semibold text-[var(--rv-body)]">
        <span>Level 3</span>
        <span>Level 4</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--rv-line)]">
        <motion.span
          className="block h-full origin-left rounded-full bg-[#7c3aed]"
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 0.68 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ type: "spring", stiffness: 300, damping: 28, delay: 0.2 }}
        />
      </div>
    </div>
  );
}

interface LandingPillar {
  id: "pass" | "live" | "invest" | "me";
  name: string;
  caption: string;
  image: StaticImageData;
  /** Enquadramento da foto dentro do card vertical. */
  focus: string;
  soon: boolean;
}

const PILLARS: ReadonlyArray<LandingPillar> = [
  { id: "pass", name: "Pass", caption: "Clube de benefícios com descontos reais em parceiros credenciados.", image: OBSIDIAN_IMAGES.cardMetal, focus: "object-[50%_58%]", soon: false },
  { id: "live", name: "Live", caption: "Shows e eventos com ingresso VIP e cashback em coins.", image: OBSIDIAN_IMAGES.liveConcert, focus: "object-[50%_62%]", soon: false },
  { id: "invest", name: "Invest", caption: "Invista nos seus planos.", image: OBSIDIAN_IMAGES.investCopper, focus: "object-[50%_45%]", soon: true },
  { id: "me", name: "Me", caption: "Saúde mental e longevidade pra ir mais longe.", image: OBSIDIAN_IMAGES.meHorizon, focus: "object-[60%_62%]", soon: true },
];

function PillarCard({ pillar, index }: { pillar: LandingPillar; index: number }) {
  return (
    <li id={pillar.id} className="scroll-mt-28">
      <motion.div custom={index} variants={rise} initial="hidden" whileInView="show" viewport={IN_VIEW}>
        <article
          className={cn(
            "relative isolate flex aspect-[3/4.2] flex-col justify-between overflow-hidden rounded-[24px] p-4 text-white shadow-[0_30px_60px_-30px_rgba(22,12,52,0.6)] sm:p-5",
            PHOTO_EDGE,
          )}
        >
          <Image src={pillar.image} alt="" fill sizes="(min-width: 1024px) 282px, 50vw" placeholder="blur" className={cn("-z-10 object-cover", pillar.focus)} />
          <span aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(5,5,8,0.62)_0%,rgba(5,5,8,0.06)_34%,rgba(5,5,8,0.12)_52%,rgba(5,5,8,0.9)_100%)]" />
          <h4 className="ob-label text-[15px] leading-[1.15] tracking-[0.16em] sm:text-[18px]">
            PRX
            <br />
            {pillar.name}
          </h4>
          <div>
            {pillar.soon && (
              <span className={cn("ob-label mb-3 inline-flex rounded-full px-2.5 py-1 text-[10px] tracking-[0.14em]", LIQUID.dark)}>Em breve</span>
            )}
            <p className="text-[13px] leading-snug text-white/85 sm:text-[14px]">{pillar.caption}</p>
          </div>
        </article>
      </motion.div>
    </li>
  );
}

function AchievementsSection({ appUrl }: { appUrl: string }) {
  return (
    <section id="conquistas" aria-labelledby="conquistas-title" className="relative isolate scroll-mt-24 overflow-hidden bg-[var(--rv-bg)] px-5 pb-24 pt-10 sm:px-8 sm:pb-32">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(48rem_28rem_at_12%_46%,rgba(124,58,237,0.08),transparent_70%),radial-gradient(40rem_26rem_at_90%_64%,rgba(0,102,255,0.06),transparent_70%)]"
      />
      <div className="mx-auto max-w-[1200px]">
        <div className="text-center">
          <motion.h2
            id="conquistas-title"
            variants={rise}
            custom={0}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.6 }}
            className="mx-auto max-w-[1100px] text-balance text-[clamp(30px,7.6vw,52px)] font-semibold leading-[1.02] tracking-[-0.045em] text-[var(--rv-ink)] md:text-[clamp(44px,4.8vw,72px)]"
          >
            As bets lucram com a perda.
            <br />
            <span className="text-[#7c3aed] dark:text-[#a78bfa]">Nós premiamos suas conquistas.</span>
          </motion.h2>
          <motion.p
            variants={rise}
            custom={1}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.6 }}
            className="mx-auto mt-5 max-w-[620px] text-pretty text-[16px] leading-relaxed text-[var(--rv-muted)] sm:text-[19px]"
          >
            Economizar, bater metas e viver experiências pontua no seu PRX Level. Suba de nível e desbloqueie limites ampliados, anuidade zero e acesso a lounges VIP.
          </motion.p>
          <motion.div variants={rise} custom={2} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.6 }} className="mt-8 flex justify-center">
            <LuxuryButton href={appUrl} className="px-7 text-[15px]">
              Abrir minha conta
            </LuxuryButton>
          </motion.div>
        </div>

        <ul className="mt-12 grid gap-4 text-left sm:mt-16 lg:grid-cols-3 lg:gap-5">
          <HighlightCard id="bank" index={0} title="PRX Bank" text="Conta digital, Pix 24/7 sem tarifas e cartão de metal exclusivo.">
            <p className="text-[40px] font-light leading-none tracking-[-0.04em] tabular-nums sm:text-[46px]">
              R$ 0<span className="ml-2 text-[15px] font-medium tracking-normal text-[var(--rv-muted)]">de tarifa no Pix</span>
            </p>
          </HighlightCard>
          <HighlightCard index={1} title="PRX Coins & Level" text="Cada compra em parceiro reconhecida na hora; pontuação acumulada para subir de nível.">
            <LevelBar />
          </HighlightCard>
          <HighlightCard index={2} title="PRX Pass" text="Descontos de 20% a 50% direto no balcão via QR Code protegido.">
            <p className="text-[40px] font-light leading-none tracking-[-0.04em] text-[#7c3aed] tabular-nums dark:text-[#a78bfa] sm:text-[46px]">20–50%</p>
          </HighlightCard>
        </ul>

        <div className="mt-16 sm:mt-24">
          <h3 className="ob-label border-b border-[var(--rv-line)] pb-4 text-[12px] text-[var(--rv-body)]">Os pilares PRX</h3>
          <ul className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 lg:gap-5">
            {PILLARS.map((pillar, i) => (
              <PillarCard key={pillar.id} pillar={pillar} index={i} />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

import { PrxFooter } from "@/components/marketing/prx-footer";

/* -------------------------------------------------------------------------- */
/* Página                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A landing é a página inicial: Entrar e Criar conta rolam até a seção de acesso
 * da própria página (#entrar / #criar-conta), que troca a aba do formulário.
 */
const LINKS: LandingLinks = { appUrl: "/", login: "#entrar", signup: "#criar-conta", parent: "/sou-pai" };

export interface RevolutLandingProps {
  /** Chamado depois de entrar ou criar a conta (a página inicial troca para o app). */
  onEnterApp?: () => void;
  /** Membro logado revendo a apresentação: o topo mostra "Voltar ao app". */
  onBackToApp?: () => void;
}

export function RevolutLanding({ onEnterApp, onBackToApp }: RevolutLandingProps) {
  const reduceMotion = useMedia(REDUCE, false);
  const { theme, mounted } = useTheme();
  const [stageTone, setStageTone] = useState<Tone>("dark");
  // No tema escuro a página inteira é obsidiana: a cápsula fica sempre fumê.
  const tone: Tone = mounted && theme === "dark" ? "dark" : stageTone;
  const lenisRef = useRef<LenisRef>(null);

  // Lenis avança dentro do frame loop do Motion: rolagem e molas leem o mesmo quadro.
  useEffect(() => {
    const update = (data: FrameData) => lenisRef.current?.lenis?.raf(data.timestamp);
    frame.update(update, true);
    return () => cancelFrame(update);
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <ReactLenis root ref={lenisRef} options={LENIS_OPTIONS}>
        <div className="prx-rv min-h-dvh overflow-x-clip selection:bg-[#7c3aed] selection:text-white">
          <Header links={LINKS} tone={tone} onBackToApp={onBackToApp} />
          <main>
            <PinnedStory appUrl={LINKS.signup} reduceMotion={reduceMotion} onTone={setStageTone} />
            <AchievementsSection appUrl={LINKS.signup} />
            <AppShowcaseSection />
            <HowItWorksSection />
            <DifferentialsSection />
            <SecuritySection />
            <ParentSection links={LINKS} />
            <AudiencesSection />
            <PlansSection links={LINKS} />
            <FaqSection />
            <FinalCtaSection links={LINKS} />
            <AuthSection onAuthenticated={onEnterApp ?? onBackToApp} />
          </main>
          <PrxFooter onDark={true} />
        </div>
      </ReactLenis>
    </MotionConfig>
  );
}
