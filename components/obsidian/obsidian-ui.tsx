// Hello World
"use client";

import type { ComponentType, ReactNode } from "react";
import Image, { type StaticImageData } from "next/image";
import { PrxImage } from "@/components/ui/prx-image";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { IconArrowRight, IconBell, IconEye, IconEyeOff } from "@/components/icons/prx-icons";
import crystalImg from "@/public/brand/showcase/prx-3d-crystal.png";
import cardMetalImg from "@/public/brand/showcase/prx-card-metal.png";
import liveConcertImg from "@/public/brand/showcase/prx-live-concert.png";
import investCopperImg from "@/public/brand/showcase/prx-invest-copper.jpg";
import meHorizonImg from "@/public/brand/showcase/prx-me-horizon.jpg";
import { Tagline } from "@/components/marketing/tagline";

/*
 * Cyber-Luxury Obsidian — blocos visuais compartilhados.
 * Só apresentação (dados e ações chegam por props): o mesmo componente monta a
 * Home do membro, a tela viva dentro do celular 3D da landing e o /teste.
 * Cores vêm dos tokens (--ink, --glass-*), então funcionam no tema claro; as
 * peças com fotografia (pilares e evento) são "ilhas" escuras nos dois temas.
 */

export const OBSIDIAN_IMAGES = {
  crystal: crystalImg,
  cardMetal: cardMetalImg,
  liveConcert: liveConcertImg,
  investCopper: investCopperImg,
  meHorizon: meHorizonImg,
} as const;

type IconComponent = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

/* -------------------------------------------------------------------------- */
/* Atmosfera                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Lugar do cristal: canto superior direito, atrás do cabeçalho. No plano branco a pedra
 * preta atrás de texto escuro não se lê, então nas telas cheias de conteúdo ele fica no canto.
 */
export const CRYSTAL_CORNER = "absolute right-0 top-0 z-0 h-[150px] w-[58vw] sm:h-[230px] sm:w-[44vw] lg:h-[230px] lg:w-[30vw]";
/** Telas com o lado direito livre no computador (Início, documentos, entrada): o cristal cresce no desktop. */
export const CRYSTAL_HERO = "absolute right-0 top-0 z-0 h-[150px] w-[58vw] sm:h-[240px] sm:w-[40vw] lg:h-[440px] lg:w-[34vw]";

/**
 * Escultura de cristal PRX em obsidiana preta, nos dois temas:
 * - no plano branco, a pedra preta aparece como é e as bordas se fundem ao branco pela máscara radial;
 * - no breu, o preto da foto some (mesclagem "screen") e sobra o brilho violeta e cobalto.
 */
export function ObsidianCrystal({ className, priority = false, sizes = "(min-width: 1024px) 560px, 70vw" }: { className?: string; priority?: boolean; sizes?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none select-none", className)}>
      <Image
        src={crystalImg}
        alt=""
        fill
        sizes={sizes}
        priority={priority}
        placeholder="blur"
        className="object-cover opacity-95 [mask-image:radial-gradient(60%_56%_at_66%_34%,#000_38%,transparent_100%)] dark:opacity-90 dark:mix-blend-screen dark:[mask-image:radial-gradient(68%_62%_at_62%_42%,#000_38%,transparent_100%)]"
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Manifesto                                                                  */
/* -------------------------------------------------------------------------- */

const GREETING_SIZE = {
  app: { label: "text-[12px] sm:text-[13px]", title: "text-[23px] min-[360px]:text-[25px] min-[400px]:text-[27px] sm:text-[40px] lg:text-[50px] xl:text-[56px]" },
  phone: { label: "text-[12px]", title: "text-[23px]" },
} as const;

/** "OI, NOME" em ardósia e a frase do manifesto sorteada na sessão (uma entre as 100). */
export function ObsidianGreeting({
  name,
  as: Title = "h1",
  density = "app",
  className,
}: {
  name: string;
  as?: "h1" | "h2" | "p";
  density?: keyof typeof GREETING_SIZE;
  className?: string;
}) {
  const size = GREETING_SIZE[density];
  return (
    <div className={className}>
      <p className={cn("ob-label text-muted-foreground", size.label)}>Oi, {name}</p>
      <Title className={cn("ob-display mt-3 text-ink sm:mt-4", size.title)}>
        <Tagline />
      </Title>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Botões                                                                     */
/* -------------------------------------------------------------------------- */

/** Botão circular de vidro fumê com ícone de traço fino (→, sino, atalhos). */
export function ObsidianRoundButton({
  label,
  onClick,
  children,
  className,
  size = "md",
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const box = size === "lg" ? "h-14 w-14" : "h-12 w-12";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "glass-chip inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full text-ink transition-transform duration-200 active:scale-95",
        box,
        className
      )}
    >
      {children}
    </button>
  );
}

/** Sino minimalista com ponto violeta quando há aviso. */
export function ObsidianBell({ count = 0, onClick, className }: { count?: number; onClick?: () => void; className?: string }) {
  const label = count > 0 ? `Avisos (${count > 9 ? "9+" : count} novos)` : "Avisos";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title="Avisos"
      className={cn("relative inline-flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink transition-colors hover:bg-surface", className)}
    >
      <IconBell size={21} strokeWidth={1.5} />
      {count > 0 && <span aria-hidden className="absolute right-[13px] top-[12px] h-2 w-2 rounded-full bg-[#9468fa] shadow-[0_0_10px_rgba(148,104,250,0.9)] ring-2 ring-background" />}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Saldo PRX Bank                                                             */
/* -------------------------------------------------------------------------- */

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function moneyParts(value: number): { integer: string; fraction: string; negative: boolean } {
  const parts = brl.formatToParts(value);
  return {
    integer: parts
      .filter((p) => p.type === "integer" || p.type === "group")
      .map((p) => p.value)
      .join(""),
    fraction: parts.find((p) => p.type === "fraction")?.value ?? "00",
    negative: parts.some((p) => p.type === "minusSign"),
  };
}

export interface ObsidianAction {
  key: string;
  label: string;
  Icon: IconComponent;
  onClick?: () => void;
}

const BALANCE_SIZE = {
  app: { pad: "p-5 min-[380px]:p-6 sm:p-7", value: "text-[34px] min-[380px]:text-[38px] sm:text-[46px]", chip: "h-14 w-14", gap: "mt-7" },
  phone: { pad: "px-5 py-4", value: "text-[30px]", chip: "h-11 w-11", gap: "mt-3.5" },
} as const;

/** Card principal: rótulo, valor monumental, atalho para o banco e três atalhos em círculo. */
export function ObsidianBalanceCard({
  value,
  hidden,
  onToggleHidden,
  onOpen,
  actions,
  label = "Saldo PRX Bank",
  note,
  density = "app",
  className,
}: {
  value: number;
  hidden: boolean;
  onToggleHidden?: () => void;
  onOpen?: () => void;
  actions: ReadonlyArray<ObsidianAction>;
  label?: string;
  /** Linha discreta sob o valor (ex.: "Conta em ativação"). */
  note?: string;
  density?: keyof typeof BALANCE_SIZE;
  className?: string;
}) {
  const size = BALANCE_SIZE[density];
  const money = moneyParts(value);
  return (
    <section aria-label={label} className={cn("glass relative overflow-hidden rounded-[28px]", size.pad, className)}>
      {/* Brilho interno suave no canto superior esquerdo: a luz batendo no vidro fumê. */}
      <span aria-hidden className="pointer-events-none absolute -left-16 -top-24 h-56 w-56 rounded-full bg-[radial-gradient(closest-side,rgba(148,104,250,0.16),transparent)]" />
      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <p className="ob-label text-[11px] text-muted-foreground">{label}</p>
            {onToggleHidden && (
              <button
                type="button"
                onClick={onToggleHidden}
                aria-pressed={hidden}
                aria-label={hidden ? "Mostrar saldo" : "Ocultar saldo"}
                className="-my-3 inline-flex h-12 w-12 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-ink"
              >
                {hidden ? <IconEyeOff size={15} strokeWidth={1.6} /> : <IconEye size={15} strokeWidth={1.6} />}
              </button>
            )}
          </div>
          <p className={cn("mt-2 whitespace-nowrap font-light leading-none tracking-[-0.02em] text-ink [font-feature-settings:'tnum']", size.value)}>
            <span className="mr-[0.22em]">R$</span>
            {hidden ? (
              <>
                <span aria-hidden>••••••</span>
                <span className="sr-only">saldo oculto</span>
              </>
            ) : (
              <>
                {money.negative && "−"}
                {money.integer}
                <span className="text-[0.62em]">,{money.fraction}</span>
              </>
            )}
          </p>
          {note && <p className="mt-2.5 text-[12px] text-muted-foreground">{note}</p>}
        </div>
        {onOpen && (
          <ObsidianRoundButton label="Abrir PRX Bank" onClick={onOpen}>
            <IconArrowRight size={18} strokeWidth={1.5} />
          </ObsidianRoundButton>
        )}
      </div>

      <div className={cn("relative grid grid-cols-3 gap-2", size.gap)}>
        {actions.map(({ key, label: actionLabel, Icon, onClick }) => (
          <button key={key} type="button" onClick={onClick} className="group flex min-w-0 cursor-pointer flex-col items-center gap-2.5 py-1">
            <span className={cn("glass-chip flex items-center justify-center rounded-full text-ink transition-transform duration-200 group-active:scale-95", size.chip)}>
              <Icon size={20} strokeWidth={1.5} />
            </span>
            <span className="ob-label truncate text-[10.5px] text-ink/90">{actionLabel}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Os 4 pilares                                                               */
/* -------------------------------------------------------------------------- */

export type PillarId = "pass" | "live" | "invest" | "me";

export interface ObsidianPillar {
  id: PillarId;
  name: string;
  caption: readonly [string, string];
  image: StaticImageData;
  /** Enquadramento da foto dentro do card vertical. */
  focus: string;
}

export const OBSIDIAN_PILLARS: ReadonlyArray<ObsidianPillar> = [
  { id: "pass", name: "PASS", caption: ["Benefícios", "exclusivos"], image: cardMetalImg, focus: "object-[50%_58%]" },
  { id: "live", name: "LIVE", caption: ["Eventos", "experiências"], image: liveConcertImg, focus: "object-[50%_62%]" },
  { id: "invest", name: "INVEST", caption: ["Invista", "nos seus planos"], image: investCopperImg, focus: "object-[50%_45%]" },
  { id: "me", name: "ME", caption: ["Saúde mental", "pra ir mais longe"], image: meHorizonImg, focus: "object-[60%_62%]" },
];

/** Card vertical de um pilar: foto de fundo, nome no topo, → e legenda na base. */
export function ObsidianPillarCard({
  pillar,
  onSelect,
  density = "app",
  className,
  sizes = "(min-width: 1024px) 240px, 45vw",
}: {
  pillar: ObsidianPillar;
  onSelect?: (id: PillarId) => void;
  density?: "app" | "phone";
  className?: string;
  sizes?: string;
}) {
  const phone = density === "phone";
  return (
    <button
      type="button"
      onClick={() => onSelect?.(pillar.id)}
      aria-label={`PRX ${pillar.name}: ${pillar.caption.join(" ")}`}
      className={cn(
        "group relative isolate flex w-full cursor-pointer flex-col justify-between overflow-hidden border border-white/[0.12] bg-[#07070b] text-left text-[#fff] shadow-[0_24px_48px_-28px_rgba(0,0,0,0.9)] transition-[border-color,transform] duration-300 hover:border-white/[0.24] active:scale-[0.98]",
        phone ? "aspect-[3/4.3] rounded-[16px] p-3" : "aspect-[3/4.2] rounded-[22px] p-4 sm:p-5",
        className
      )}
    >
      <Image
        src={pillar.image}
        alt=""
        fill
        sizes={sizes}
        placeholder="blur"
        className={cn("-z-10 object-cover transition-transform duration-700 ease-out group-hover:scale-[1.05]", pillar.focus)}
      />
      <span aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(5,5,8,0.62)_0%,rgba(5,5,8,0.06)_34%,rgba(5,5,8,0.1)_58%,rgba(5,5,8,0.86)_100%)]" />
      <span className="flex items-start justify-between gap-2">
        <span className={cn("ob-label leading-[1.15] tracking-[0.16em]", phone ? "text-[12.5px]" : "text-[15px] sm:text-[17px]")}>
          PRX
          <br />
          {pillar.name}
        </span>
        <span
          aria-hidden
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full border border-white/[0.28] bg-black/[0.25] backdrop-blur-md transition-colors group-hover:bg-white/[0.14]",
            phone ? "h-6 w-6" : "h-9 w-9"
          )}
        >
          <IconArrowRight size={phone ? 12 : 15} strokeWidth={1.6} />
        </span>
      </span>
      <span className={cn("ob-label leading-[1.45] text-[#e6e8ee]", phone ? "text-[7.5px] tracking-[0.14em]" : "text-[9.5px] tracking-[0.1em] sm:text-[11px] sm:tracking-[0.14em]")}>
        {pillar.caption[0]}
        <br />
        {pillar.caption[1]}
      </span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Eventos                                                                    */
/* -------------------------------------------------------------------------- */

/** Cabeçalho de seção em caixa alta com ação "VER TODOS →". */
export function ObsidianSectionHeader({
  id,
  title,
  actionLabel,
  onAction,
  className,
}: {
  id?: string;
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <h2 id={id} className="ob-label text-[11px] text-muted-foreground sm:text-[12px]">
        {title}
      </h2>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="ob-label -mr-2 inline-flex min-h-12 cursor-pointer items-center gap-1.5 rounded-full px-2 text-[11px] text-primary transition-opacity hover:opacity-80"
        >
          {actionLabel}
          <IconArrowRight size={13} strokeWidth={1.7} />
        </button>
      )}
    </div>
  );
}

/** Pilha de avatares (iniciais) com o excedente em "+N". */
export function ObsidianAvatarStack({ people, extra }: { people: ReadonlyArray<{ initials: string; tone: string }>; extra?: number }) {
  return (
    <span className="flex items-center">
      {people.map((p, i) => (
        <span
          key={p.initials + i}
          aria-hidden
          className="-ml-2 flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#0b0b10] text-[10px] font-semibold text-[#fff] first:ml-0"
          style={{ background: p.tone }}
        >
          {p.initials}
        </span>
      ))}
      {extra !== undefined && extra > 0 && (
        <span className="-ml-2 flex h-7 min-w-9 items-center justify-center rounded-full border-2 border-[#0b0b10] bg-[#1a1a22] px-1.5 text-[10px] font-semibold text-[#fff]">
          +{extra}
        </span>
      )}
    </span>
  );
}

/** Card panorâmico de evento: foto atmosférica, título monumental, data · cidade e →. */
export function ObsidianEventCard({
  title,
  meta,
  image,
  onOpen,
  trailing,
  density = "app",
  className,
}: {
  title: string;
  meta: string;
  /** Capa do evento (URL https) ou imagem estática; sem capa usa o show ao vivo da marca. */
  image?: StaticImageData | string | null;
  onOpen?: () => void;
  trailing?: ReactNode;
  density?: "app" | "phone";
  className?: string;
}) {
  const phone = density === "phone";
  const src = image || liveConcertImg;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${title}, ${meta}`}
      className={cn(
        "group relative isolate flex w-full cursor-pointer items-center justify-between gap-3 overflow-hidden border border-white/[0.12] bg-[#07070b] text-left text-[#fff] transition-[border-color] duration-300 hover:border-white/[0.24]",
        phone ? "h-[74px] rounded-[16px] px-4" : "min-h-[112px] rounded-[24px] px-5 sm:px-6",
        className
      )}
    >
      <PrxImage
        src={src}
        alt=""
        fill
        sizes={phone ? "360px" : "(min-width: 1024px) 480px, 92vw"}
        placeholder={typeof src === "string" ? "empty" : "blur"}
        className="-z-10 object-cover object-[50%_70%] transition-transform duration-700 ease-out group-hover:scale-[1.04]"
      />
      <span aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(5,5,8,0.94)_0%,rgba(5,5,8,0.72)_42%,rgba(5,5,8,0.25)_100%)]" />
      <span className="min-w-0">
        <span className={cn("ob-label block truncate tracking-[0.14em]", phone ? "text-[15px]" : "text-[18px] sm:text-[20px]")}>{title}</span>
        <span className={cn("ob-label mt-1.5 block truncate tracking-[0.16em] text-[#cbd5e1]", phone ? "text-[9px]" : "text-[11px]")}>{meta}</span>
      </span>
      <span className="flex shrink-0 items-center gap-3">
        {trailing}
        <span
          aria-hidden
          className={cn(
            "flex items-center justify-center rounded-full border border-white/[0.28] bg-black/[0.3] backdrop-blur-md transition-colors group-hover:bg-white/[0.14]",
            phone ? "h-8 w-8" : "h-11 w-11"
          )}
        >
          <IconArrowRight size={phone ? 14 : 17} strokeWidth={1.6} />
        </span>
      </span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Floating Bottom Navigation Dock                                            */
/* -------------------------------------------------------------------------- */

export interface ObsidianDockItem<T extends string> {
  id: T;
  label: string;
  Icon: IconComponent;
}

/** Dock de vidro escuro com 5 destinos; o ativo ganha o ponto violeta brilhante. */
export function ObsidianDock<T extends string>({
  items,
  active,
  onSelect,
  label = "Seções do app",
  layoutId = "ob-dock-dot",
  density = "app",
  className,
}: {
  items: ReadonlyArray<ObsidianDockItem<T>>;
  active: T | null;
  onSelect: (id: T) => void;
  label?: string;
  layoutId?: string;
  density?: "app" | "phone";
  className?: string;
}) {
  const phone = density === "phone";
  return (
    <nav aria-label={label} className={className}>
      <ul
        className={cn("glass-bar grid px-0.5", phone ? "h-[64px] rounded-[24px]" : "h-[70px] rounded-[28px]")}
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map(({ id, label: itemLabel, Icon }) => {
          const isActive = active === id;
          return (
            <li key={id} className="min-w-0">
              <button
                type="button"
                onClick={() => onSelect(id)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative flex h-full w-full cursor-pointer select-none flex-col items-center justify-center gap-1.5 transition-colors",
                  isActive ? "text-ink" : "text-muted-foreground hover:text-ink"
                )}
              >
                <motion.span className="relative" whileTap={{ scale: 0.88 }} transition={{ type: "spring", stiffness: 300, damping: 28 }}>
                  <Icon size={phone ? 19 : 21} strokeWidth={isActive ? 1.9 : 1.5} />
                  {isActive && <span aria-hidden className="absolute -right-1.5 -top-1 h-1.5 w-1.5 rounded-full bg-[#9468fa] shadow-[0_0_8px_rgba(148,104,250,0.95)]" />}
                </motion.span>
                <span className={cn("ob-label max-w-full truncate", phone ? "text-[7.5px] tracking-[0.06em]" : "text-[9px] tracking-[0.02em] max-[359px]:sr-only sm:text-[10px] sm:tracking-[0.1em]")}>{itemLabel}</span>
                {isActive && (
                  <motion.span
                    layoutId={layoutId}
                    aria-hidden
                    className="absolute bottom-1.5 h-1 w-1 rounded-full bg-[#9468fa] shadow-[0_0_10px_rgba(148,104,250,0.95)]"
                    transition={{ type: "spring", stiffness: 300, damping: 28 }}
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
