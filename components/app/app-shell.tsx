// Hello World
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useLenis } from "lenis/react";
import type { User } from "@/hooks/use-auth";
import {
  IconBank,
  IconHome,
  IconLive,
  IconLogout,
  IconPass,
  IconQr,
  IconReels,
  IconRocket,
} from "@/components/icons/prx-icons";
import { PrxLogo } from "@/components/brand/prx-logo";
import { AppNavProvider, useAppNav, type AppTab } from "@/components/app/app-nav";
import { SmoothScroll } from "@/components/app/smooth-scroll";
import { usePassData, firstName } from "@/components/app/use-pass-data";
import { useLiveData, usePointsWallet } from "@/components/app/use-prx-stores";
import { NoticesSheet, useNotices } from "@/components/app/notifications";
import { useBankNotices } from "@/components/app/bank/use-bank-notices";
import { Avatar, initialsOf } from "@/components/app/ui";
import { ReelsScreen } from "@/components/app/screens/reels-screen";
import { CircleLoader } from "@/components/ui/circle-loader";
import { HomeScreen } from "@/components/app/screens/home-screen";
import { PassScreen } from "@/components/app/screens/pass-screen";
import { BankScreen } from "@/components/app/screens/bank-screen";
import { LiveScreen } from "@/components/app/screens/live-screen";
import { FoundersScreen } from "@/components/app/screens/founders-screen";
import { ProfileScreen } from "@/components/app/screens/profile-screen";
import { CRYSTAL_CORNER, CRYSTAL_HERO, ObsidianCrystal, ObsidianDock, type ObsidianDockItem } from "@/components/obsidian/obsidian-ui";
import { PwaInstallPrompt } from "@/components/app/pwa-install-prompt";
import { PushPrompt } from "@/components/app/profile/push-prompts";
import { ThemeToggle } from "@/components/theme-toggle";
import { useThemeScope } from "@/components/theme-provider";
import { cn } from "@/lib/utils";
import { calculatePrxLevel } from "@/lib/pass-data";

/**
 * 6 destinos oficiais da PRX (Início, PRX Pass, Destaques, PRX Bank, PRX Live, Founders).
 * Perfil, notificações e vouchers ficam fixos no topo do cabeçalho.
 */
const NAV_ITEMS: ReadonlyArray<ObsidianDockItem<AppTab>> = [
  { id: "home", label: "Início", Icon: IconHome },
  { id: "pass", label: "PRX Pass", Icon: IconPass },
  { id: "reels", label: "Destaques", Icon: IconReels },
  { id: "bank", label: "PRX Bank", Icon: IconBank },
  { id: "live", label: "PRX Live", Icon: IconLive },
  { id: "founders", label: "Founders", Icon: IconRocket },
];

interface AppShellProps {
  user: User;
  onLogout: () => void;
  onViewShowcase: () => void;
  /** Aviso da conta (ex.: menor aguardando o responsável), acima do conteúdo de todas as abas. */
  notice?: ReactNode;
}

export function AppShell(props: AppShellProps) {
  return (
    <AppNavProvider>
      <SmoothScroll>
        <ShellLayout {...props} />
      </SmoothScroll>
    </AppNavProvider>
  );
}

/** true depois que a página rola: o cabeçalho ganha o vidro fumê / glass-bar. */
function useScrolled(threshold = 8): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > threshold);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [threshold]);
  return scrolled;
}

/** Detecta quando o teclado virtual está aberto (formulários no mobile) para não empurrar a barra para cima dos botões. */
function useIsVirtualKeyboardOpen(): boolean {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onFocusIn = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable)
      ) {
        setIsOpen(true);
      }
    };

    const onFocusOut = () => {
      setTimeout(() => {
        const active = document.activeElement as HTMLElement | null;
        if (
          !active ||
          (active.tagName !== "INPUT" &&
            active.tagName !== "TEXTAREA" &&
            active.tagName !== "SELECT" &&
            !active.isContentEditable)
        ) {
          setIsOpen(false);
        }
      }, 150);
    };

    window.addEventListener("focusin", onFocusIn);
    window.addEventListener("focusout", onFocusOut);

    const vv = window.visualViewport;
    const onResize = () => {
      if (vv && window.innerHeight) {
        if (vv.height < window.innerHeight * 0.8) {
          setIsOpen(true);
        } else if (
          !document.activeElement ||
          (document.activeElement.tagName !== "INPUT" &&
            document.activeElement.tagName !== "TEXTAREA")
        ) {
          setIsOpen(false);
        }
      }
    };
    vv?.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("focusout", onFocusOut);
      vv?.removeEventListener("resize", onResize);
    };
  }, []);

  return isOpen;
}

function ShellLayout({ user, onLogout, onViewShowcase, notice }: AppShellProps) {
  useThemeScope("app");
  const { tab, go } = useAppNav();
  const pass = usePassData(user);
  const { data: live } = useLiveData(user.id);
  const { wallet: points } = usePointsWallet(user.id);
  const bank = useBankNotices(user.id);
  const notices = useNotices(pass, live?.wallet ?? null, points, bank.notices);
  const [noticesOpen, setNoticesOpen] = useState(false);
  const [isTabLoading, setIsTabLoading] = useState(false);
  const lenis = useLenis();
  const previousTab = useRef(tab);
  const scrolled = useScrolled();
  const isKeyboardOpen = useIsVirtualKeyboardOpen();

  useEffect(() => {
    if (previousTab.current === tab) return;
    previousTab.current = tab;
    setIsTabLoading(true);
    if (lenis) lenis.scrollTo(0, { immediate: true });
    else window.scrollTo({ top: 0 });
    const timer = setTimeout(() => {
      setIsTabLoading(false);
    }, 200);
    return () => clearTimeout(timer);
  }, [tab, lenis]);

  const member = pass.member;
  const name = member.name || "Membro PRX";
  const level = points?.level ?? member.prxLevel ?? calculatePrxLevel(member.prxScore ?? 0);
  const immersive = tab === "reels";

  return (
    <div className="prx-app relative isolate min-h-dvh overflow-x-clip bg-background text-foreground">
      {/* Luz volumétrica (cobalto e violeta) atrás do vidro fumê. */}
      <div aria-hidden className="prx-ambient" />
      {/* Escultura de cristal obsidiana no canto superior direito, em todas as abas (Destaques é vídeo em tela cheia). */}
      {!immersive && (
        <ObsidianCrystal
          priority
          sizes="(min-width: 1024px) 46vw, 88vw"
          className={cn(
            tab === "home" ? CRYSTAL_HERO : CRYSTAL_CORNER,
            // No breu, a Início ganha o cristal grande atrás do manifesto (texto branco sobre a pedra).
            tab === "home" && "dark:-right-[22%] dark:h-[430px] dark:w-[88vw] dark:sm:-right-[8%] dark:sm:h-[560px] dark:sm:w-[62vw] dark:lg:right-0 dark:lg:h-[700px] dark:lg:w-[46vw]"
          )}
        />
      )}
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-full focus:bg-ink focus:px-4 focus:py-3 focus:text-background"
      >
        Pular para o conteúdo
      </a>

      {/* Trilho lateral (desktop): vidro fumê flutuante com os 5 destinos oficiais */}
      <aside className="glass-bar fixed inset-y-3 left-3 z-40 hidden w-[232px] flex-col rounded-[28px] px-3 py-7 lg:flex">
        <button
          type="button"
          onClick={() => go("home")}
          className="flex min-h-12 cursor-pointer items-center self-start px-3"
          aria-label="PRX — ir para o início"
        >
          <PrxLogo variant="compact" title="" className="h-7 w-auto text-ink" />
        </button>

        <nav aria-label="Seções do app" className="mt-12 flex flex-col gap-1">
          {NAV_ITEMS.map(({ id, label, Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => go(id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-12 cursor-pointer items-center gap-3.5 rounded-[18px] px-4 transition-colors",
                  active ? "text-ink" : "text-muted-foreground hover:bg-surface hover:text-ink"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="rail-pill"
                    className="absolute inset-0 rounded-[18px] bg-card shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(22,12,52,0.06),0_8px_18px_-10px_rgba(22,12,52,0.28)] dark:bg-white/[0.07] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                    transition={{ type: "spring", stiffness: 300, damping: 28 }}
                  />
                )}
                <span className="relative">
                  <Icon size={20} strokeWidth={active ? 1.9 : 1.5} />
                  {active && (
                    <span
                      aria-hidden
                      className="absolute -right-1.5 -top-1 h-1.5 w-1.5 rounded-full bg-[#9468fa] shadow-[0_0_8px_rgba(148,104,250,0.95)]"
                    />
                  )}
                </span>
                <span className="ob-label relative text-[12px] tracking-[0.16em]">{label}</span>
              </button>
            );
          })}
        </nav>

        <div className="mt-auto space-y-2">
          <ThemeToggle variant="app" showLabel className="w-full justify-start" />
          <button
            type="button"
            onClick={onLogout}
            className="flex min-h-12 w-full cursor-pointer items-center gap-2 rounded-full px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface hover:text-ink"
          >
            <IconLogout size={18} />
            Sair
          </button>
        </div>
      </aside>

      <div className="relative z-10 lg:pl-64">
        {/* Cabeçalho minimalista com as localizações originais:
            - Esquerda: Logo (mobile) / "Olá, [Nome]" (desktop)
            - Direita: Vouchers (QR) · Tema (sol/lua) · Perfil (Avatar + Nível; avisos no Perfil) */}
        <header className="sticky top-0 z-30 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-4 lg:px-9 lg:pt-3">
          <div
            className={cn(
              "mx-auto flex h-16 w-full max-w-[1096px] items-center justify-between gap-2 rounded-[22px] border border-transparent pl-3 pr-1.5 transition-[background-color,border-color,box-shadow] duration-300 lg:pl-4",
              scrolled && "glass-bar"
            )}
          >
            <button
              type="button"
              onClick={() => go("home")}
              className="flex min-h-12 shrink-0 cursor-pointer items-center lg:invisible"
              aria-label="PRX — ir para o início"
            >
              <PrxLogo variant="compact" title="" className="h-7 w-auto text-ink" />
            </button>
            <p className="hidden text-[20px] font-semibold tracking-[-0.02em] text-ink lg:block">
              Olá, {firstName(member)}
            </p>
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => go("pass", "vouchers")}
                aria-label="Meus Vouchers e QR Codes"
                title="Meus Vouchers"
                className="glass-chip flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink transition-transform hover:scale-[1.03] active:scale-95"
              >
                <IconQr size={19} />
              </button>
              {/* Tema claro/escuro no lugar do sino; os avisos ficam no Perfil. */}
              <ThemeToggle variant="app" />
              <button
                type="button"
                onClick={() => go("profile")}
                aria-current={tab === "profile" ? "page" : undefined}
                aria-label={`Perfil de ${name}, nível ${level}${notices.length > 0 ? `, ${notices.length} ${notices.length === 1 ? "aviso" : "avisos"}` : ""}`}
                className={cn(
                  "glass-chip flex h-12 min-w-12 max-w-[200px] shrink cursor-pointer items-center gap-2.5 rounded-full p-1 text-left transition-[box-shadow,transform] hover:scale-[1.02] active:scale-95 min-[380px]:pr-4 lg:h-12",
                  tab === "profile" && "ring-2 ring-primary/60"
                )}
              >
                <span className="relative shrink-0">
                  <Avatar name={name} src={member.avatarUrl} size={36} className="ring-1 ring-black/10 dark:ring-white/[0.18]" />
                  {notices.length > 0 && <span aria-hidden className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-primary ring-2 ring-background" />}
                </span>
                <span className="hidden min-w-0 min-[380px]:block">
                  <span className="block truncate text-[13.5px] font-semibold leading-tight text-ink">{firstName(member)}</span>
                  <span className="block truncate text-[11px] leading-tight text-muted-foreground">Nível {level.toLocaleString("pt-BR")}</span>
                </span>
              </button>
            </div>
          </div>
        </header>

        <main id="conteudo" className="overflow-x-hidden">
          <div
            className={cn(
              "mx-auto w-full max-w-[1120px]",
              immersive
                ? "px-0 pb-[calc(88px+max(0.75rem,env(safe-area-inset-bottom)))] sm:px-6 lg:px-12 lg:pb-6"
                : "px-4 pb-48 pt-2 sm:px-6 lg:px-12 lg:pb-24 lg:pt-4"
            )}
          >
            {notice && !immersive && <div className="mb-6">{notice}</div>}
            {isTabLoading ? (
              <CircleLoader minHeight={380} label="Carregando janela..." />
            ) : (
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={tab}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                >
                  {tab === "home" && <HomeScreen pass={pass} />}
                  {tab === "pass" && <PassScreen pass={pass} />}
                  {tab === "reels" && <ReelsScreen member={member} />}
                  {tab === "bank" && <BankScreen member={member} />}
                  {tab === "live" && <LiveScreen member={member} />}
                  {tab === "founders" && <FoundersScreen member={member} />}
                  {tab === "profile" && (
                    <ProfileScreen
                      pass={pass}
                      onLogout={onLogout}
                      onViewShowcase={onViewShowcase}
                      initials={initialsOf(name)}
                      noticeCount={notices.length}
                      onOpenNotices={() => setNoticesOpen(true)}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        </main>
      </div>

      {/* Floating Bottom Navigation Dock (mobile e tablet) */}
      <div
        className={cn(
          "pointer-events-none fixed inset-x-0 bottom-0 z-50 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-all duration-200 ease-out lg:hidden",
          isKeyboardOpen && "pointer-events-none translate-y-24 opacity-0"
        )}
      >
        <ObsidianDock
          items={NAV_ITEMS}
          active={tab === "profile" ? null : tab}
          onSelect={(id) => go(id)}
          className="pointer-events-auto mx-auto max-w-lg"
        />
      </div>

      <NoticesSheet
        open={noticesOpen}
        onClose={() => {
          setNoticesOpen(false);
          // Avisos do banco vistos no sino deixam de virar toast.
          bank.markRead();
        }}
        notices={notices}
        onGo={go}
      />
      <PwaInstallPrompt />
      <PushPrompt />
    </div>
  );
}
