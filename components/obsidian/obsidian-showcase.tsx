// Hello World
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Tagline } from "@/components/marketing/tagline";
import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { PrxLogo } from "@/components/brand/prx-logo";
import { IconArrowRight, IconClose, IconExternal, IconPaperPlane, IconBarcode, IconPixDiamonds, IconRefresh } from "@/components/icons/prx-icons";
import { rememberAppTheme, useThemeScope } from "@/components/theme-provider";
import { cn } from "@/lib/utils";
import { usePanelUrl, type PanelPrefix } from "@/lib/site";
import { APP_WIDTH, ObsidianPhone3D, ObsidianPhoneApp } from "@/components/obsidian/obsidian-phone";
import {
  OBSIDIAN_PILLARS,
  ObsidianAvatarStack,
  ObsidianBalanceCard,
  ObsidianCrystal,
  ObsidianEventCard,
  ObsidianPillarCard,
  ObsidianSectionHeader,
  type ObsidianAction,
} from "@/components/obsidian/obsidian-ui";
import crystalImg from "@/public/brand/showcase/prx-3d-crystal.png";
import cardMetalImg from "@/public/brand/showcase/prx-card-metal.png";
import liveConcertImg from "@/public/brand/showcase/prx-live-concert.png";
import moodboardImg from "@/public/brand/showcase/prx-brand-moodboard.jpg";
import mockupImg from "@/public/brand/showcase/prx-app-mobile-mockup.jpg";
import investCopperImg from "@/public/brand/showcase/prx-invest-copper.jpg";
import meHorizonImg from "@/public/brand/showcase/prx-me-horizon.jpg";

interface Asset {
  file: string;
  image: StaticImageData;
  title: string;
  use: string;
  wide?: boolean;
}

const ASSETS: ReadonlyArray<Asset> = [
  { file: "prx-app-mobile-mockup.jpg", image: mockupImg, title: "Mockup do app", use: "Referência direta da Início Obsidian." },
  { file: "prx-3d-crystal.png", image: crystalImg, title: "Cristal PRX 3D", use: "Hero da landing e profundidade dos dashboards." },
  { file: "prx-card-metal.png", image: cardMetalImg, title: "Cartão de metal", use: "Card PRX PASS." },
  { file: "prx-live-concert.png", image: liveConcertImg, title: "Show ao vivo", use: "Card PRX LIVE e eventos sem capa." },
  { file: "prx-invest-copper.jpg", image: investCopperImg, title: "Fita de cobre", use: "Card PRX INVEST (derivada do moodboard)." },
  { file: "prx-me-horizon.jpg", image: meHorizonImg, title: "Horizonte ao anoitecer", use: "Card PRX ME (derivada do moodboard)." },
  { file: "prx-brand-moodboard.jpg", image: moodboardImg, title: "Moodboard da marca", use: "Fita de luz e horizonte central.", wide: true },
];

/** ?tema=obsidian liga o tema na origem de destino (cada subdomínio de painel guarda o seu). */
const THEME_QUERY = "/?tema=obsidian";

const DASHBOARDS: ReadonlyArray<{ panel: PanelPrefix | null; title: string; body: string }> = [
  { panel: null, title: "App do membro", body: "Início, PRX Pass, Destaques, PRX Bank e PRX Live. Contas de responsável abrem a Conta Pai." },
  { panel: "admin", title: "Painel Admin", body: "Membros, parceiros, benefícios, eventos e finanças." },
  { panel: "partner", title: "Portal do Parceiro", body: "Validação de vouchers, eventos, contratos e métricas." },
  { panel: "staff", title: "Equipe PRX", body: "Portaria dos eventos e balcão de benefícios." },
];

const ZOOM = { min: 0.6, max: 1.4, step: 0.05 } as const;

/**
 * /teste — vitrine da identidade Cyber-Luxury Obsidian: celular 3D (arrastar,
 * zoom), o app em tela cheia, os componentes, os assets originais e atalhos
 * para os dashboards já com o tema Obsidian ativado.
 */
export function ObsidianShowcase() {
  useThemeScope("app");
  const [zoom, setZoom] = useState(1);
  const [viewerKey, setViewerKey] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelUrls: Record<PanelPrefix, string> = { admin: usePanelUrl("admin"), partner: usePanelUrl("partner"), staff: usePanelUrl("staff") };
  const dashboardHref = (panel: PanelPrefix | null) => (panel ? panelUrls[panel] : "") + THEME_QUERY;

  const closeFullscreen = useCallback(() => {
    setFullscreen(false);
    trigger.current?.focus();
  }, []);

  const openApp = () => setFullscreen(true);
  const demoActions: ReadonlyArray<ObsidianAction> = [
    { key: "pix", label: "Pix", Icon: IconPixDiamonds, onClick: openApp },
    { key: "pagar", label: "Pagar", Icon: IconBarcode, onClick: openApp },
    { key: "transferir", label: "Transferir", Icon: IconPaperPlane, onClick: openApp },
  ];

  return (
    <div className="prx-obsidian prx-obsidian-page relative isolate min-h-dvh overflow-x-clip">
      <div aria-hidden className="prx-ambient" />

      <header className="sticky top-0 z-30 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-4 lg:pt-3">
        <div className="glass-bar mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 rounded-[22px] pl-4 pr-1.5 sm:pl-5">
          <Link href="/" className="flex min-h-12 cursor-pointer items-center" aria-label="PRX — página inicial">
            <PrxLogo variant="compact" title="" className="h-7 w-auto text-ink" />
          </Link>
          <Link
            href={THEME_QUERY}
            onClick={() => rememberAppTheme("dark")}
            className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-full bg-primary px-5 text-[14px] font-medium text-[#fff] transition-colors hover:bg-[#6d28d9]"
          >
            Abrir o app
            <IconArrowRight size={16} />
          </Link>
        </div>
      </header>

      <main id="conteudo" className="relative z-10 mx-auto max-w-7xl px-4 pb-24 sm:px-6">
        {/* Hero: manifesto + controles (38%) · visualizador 3D (62%) */}
        <section aria-labelledby="teste-title" className="grid items-center gap-10 pt-8 lg:min-h-[calc(100dvh-88px)] lg:grid-cols-12 lg:gap-6 lg:pt-0">
          <div className="min-w-0 lg:col-span-5">
            <h1 id="teste-title" className="ob-display text-[30px] text-ink min-[380px]:text-[34px] sm:text-[46px] lg:text-[38px] xl:text-[46px]">
              <Tagline />
            </h1>
            <p className="mt-6 max-w-md text-[15px] leading-relaxed text-muted-foreground">
              Showcase da identidade Cyber-Luxury Obsidian do PRX: o celular 3D com o app vivo na tela, a visão em tela cheia, os componentes e os assets
              originais da marca.
            </p>

            <div className="mt-8 space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  ref={trigger}
                  type="button"
                  onClick={openApp}
                  className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-full bg-primary px-4 text-[14px] font-medium text-[#fff] transition-colors hover:bg-[#6d28d9] sm:px-5"
                >
                  Ver o app em tela cheia
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setZoom(1);
                    setViewerKey((k) => k + 1);
                  }}
                  className="glass-chip inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-full px-4 text-[14px] font-medium text-ink sm:px-5"
                >
                  <IconRefresh size={16} />
                  Redefinir visão
                </button>
              </div>

              <div className="glass max-w-md rounded-[22px] p-5">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="teste-zoom" className="ob-label text-[11px] text-muted-foreground">
                    Zoom
                  </label>
                  <output htmlFor="teste-zoom" className="text-[13px] tabular-nums text-ink">
                    {Math.round(zoom * 100)}%
                  </output>
                </div>
                <input
                  id="teste-zoom"
                  type="range"
                  min={ZOOM.min}
                  max={ZOOM.max}
                  step={ZOOM.step}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="mt-3 h-11 w-full cursor-pointer accent-[#9468fa]"
                />
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                  Arraste a moldura ou o fundo para girar o aparelho; duplo clique volta ao ângulo inicial. Na tela, o app responde a toques e cliques.
                </p>
              </div>
            </div>
          </div>

          <div className="relative flex min-w-0 items-center justify-center py-4 sm:min-h-[860px] lg:col-span-7">
            <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[920px] w-[760px] -translate-x-1/2 -translate-y-1/2">
              <div className="absolute inset-0 bg-[radial-gradient(closest-side,rgba(124,58,237,0.32),transparent_72%)]" />
              <ObsidianCrystal sizes="760px" priority className="absolute inset-0 translate-x-[12%]" />
            </div>
            {/* O aparelho tem 762px de altura fixa: margens negativas devolvem o espaço que a escala tira. */}
            <div className="-my-[99px] scale-[0.74] min-[400px]:-my-[61px] min-[400px]:scale-[0.84] sm:my-0 sm:scale-100 lg:-my-[38px] lg:scale-[0.9] 2xl:my-0 2xl:scale-100">
              <ObsidianPhone3D key={viewerKey} draggable zoom={zoom} rotationX={6} rotationY={-18} rotationZ={0} />
            </div>
          </div>
        </section>

        {/* Componentes do design system */}
        <section aria-labelledby="teste-componentes" className="mt-24 space-y-8">
          <div>
            <h2 id="teste-componentes" className="ob-display text-[26px] text-ink sm:text-[34px]">
              Componentes
            </h2>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
              Os mesmos blocos da Início do membro: saldo PRX Bank, os 4 pilares do ecossistema e os próximos eventos. Toque em um atalho para abrir o app.
            </p>
          </div>
          <div className="grid gap-6 lg:grid-cols-12">
            <ObsidianBalanceCard
              className="lg:col-span-7"
              value={12430.25}
              hidden={hidden}
              onToggleHidden={() => setHidden((h) => !h)}
              onOpen={openApp}
              actions={demoActions}
            />
            <div className="space-y-3 lg:col-span-5">
              <ObsidianSectionHeader title="Próximos eventos" actionLabel="Ver todos" onAction={openApp} />
              <ObsidianEventCard
                title="Resenha"
                meta="25 out · Goiânia"
                onOpen={openApp}
                trailing={
                  <ObsidianAvatarStack
                    people={[
                      { initials: "MA", tone: "linear-gradient(135deg,#7c3aed,#2563eb)" },
                      { initials: "LU", tone: "linear-gradient(135deg,#334155,#0f172a)" },
                    ]}
                    extra={120}
                  />
                }
              />
            </div>
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {OBSIDIAN_PILLARS.map((pillar) => (
              <li key={pillar.id}>
                <ObsidianPillarCard pillar={pillar} onSelect={openApp} />
              </li>
            ))}
          </ul>
        </section>

        {/* Galeria dos assets originais */}
        <section aria-labelledby="teste-assets" className="mt-24 space-y-8">
          <div>
            <h2 id="teste-assets" className="ob-display text-[26px] text-ink sm:text-[34px]">
              Assets da marca
            </h2>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
              Arquivos em <code className="rounded-md bg-surface px-1.5 py-0.5 text-[13px] text-ink">public/brand/showcase</code>, servidos otimizados pelo Next.js.
            </p>
          </div>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {ASSETS.map((asset) => (
              <li key={asset.file} className={cn(asset.wide && "sm:col-span-2 lg:col-span-3")}>
                <figure className="glass overflow-hidden rounded-[24px]">
                  <div className={cn("relative bg-[#050508]", asset.wide ? "aspect-[3/2] sm:aspect-[2.2/1]" : "aspect-[4/5]")}>
                    <Image
                      src={asset.image}
                      alt={asset.title}
                      fill
                      placeholder="blur"
                      sizes={asset.wide ? "(min-width: 1280px) 1216px, 92vw" : "(min-width: 1024px) 400px, (min-width: 640px) 46vw, 92vw"}
                      className={cn("object-cover", asset.file === "prx-app-mobile-mockup.jpg" && "object-top")}
                    />
                  </div>
                  <figcaption className="flex items-start justify-between gap-4 p-5">
                    <span className="min-w-0">
                      <span className="block text-[15px] font-medium text-ink">{asset.title}</span>
                      <span className="mt-1 block text-[13px] leading-relaxed text-muted-foreground">{asset.use}</span>
                    </span>
                    <a
                      href={`/brand/showcase/${asset.file}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Abrir o original de ${asset.title} em outra aba`}
                      className="glass-chip inline-flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink"
                    >
                      <IconExternal size={16} />
                    </a>
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </section>

        {/* Dashboards com o tema novo */}
        <section aria-labelledby="teste-dashboards" className="mt-24 space-y-8">
          <div>
            <h2 id="teste-dashboards" className="ob-display text-[26px] text-ink sm:text-[34px]">
              Dashboards
            </h2>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
              Os atalhos abrem cada painel com o tema Obsidian ativado. Painéis restritos pedem login.
            </p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {DASHBOARDS.map((d) => (
              <li key={d.title}>
                <a
                  href={dashboardHref(d.panel)}
                  onClick={() => rememberAppTheme("dark")}
                  className="glass glass-lift flex h-full min-h-[168px] cursor-pointer flex-col justify-between gap-6 rounded-[24px] p-5"
                >
                  <span>
                    <span className="ob-label block text-[13px] text-ink">{d.title}</span>
                    <span className="mt-2 block text-[13px] leading-relaxed text-muted-foreground">{d.body}</span>
                  </span>
                  <span className="ob-label inline-flex items-center gap-1.5 text-[11px] text-primary">
                    Abrir <IconArrowRight size={13} />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <AnimatePresence>{fullscreen && <FullscreenApp onClose={closeFullscreen} />}</AnimatePresence>
    </div>
  );
}

/** O app em tela cheia: sem moldura, escalado para caber na janela. Esc fecha. */
function FullscreenApp({ onClose }: { onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  const [scale, setScale] = useState(1);
  const APP_H = 844;

  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / APP_WIDTH, (window.innerHeight - 24) / APP_H, 1.2));
    fit();
    window.addEventListener("resize", fit);
    close.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("resize", fit);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="App PRX em tela cheia"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[#020203]/95 backdrop-blur-xl"
    >
      <motion.div
        initial={{ scale: 0.96, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.97, y: 8 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        className="overflow-hidden rounded-[36px] border border-white/[0.1] shadow-[0_40px_120px_-40px_rgba(124,58,237,0.6)] max-[430px]:rounded-none max-[430px]:border-0"
        style={{ width: APP_WIDTH * scale, height: APP_H * scale }}
      >
        <div style={{ width: APP_WIDTH, height: APP_H, transform: `scale(${scale})`, transformOrigin: "top left" }}>
          <ObsidianPhoneApp height={APP_H} />
        </div>
      </motion.div>
      <button
        ref={close}
        type="button"
        onClick={onClose}
        aria-label="Fechar tela cheia"
        className="glass-chip absolute right-4 top-[max(1rem,env(safe-area-inset-top))] inline-flex h-12 w-12 cursor-pointer items-center justify-center rounded-full text-ink"
      >
        <IconClose size={18} />
      </button>
    </motion.div>
  );
}
