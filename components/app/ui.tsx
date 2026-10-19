// Hello World
"use client";

import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { IconClose } from "@/components/icons/prx-icons";

/*
 * Kit de interface dos dashboards PRX (membro, admin, parceiro e equipe).
 * Liquid Glass sobre fundo branco puro: cartões, menus e barras em vidro fosco
 * translúcido (classes .glass* em app/globals.css), reflexo de luz na borda de
 * cima, sombra macia de levitação, botões em pílula e uma única cor de destaque.
 */

/* -------------------------------------------------------------------------- */
/* Botões                                                                     */
/* -------------------------------------------------------------------------- */

type ButtonVariant = "primary" | "ink" | "secondary" | "ghost" | "danger";
type ButtonSize = "md" | "sm";

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium tracking-[-0.01em] cursor-pointer select-none " +
  "transition-[background-color,color,opacity,transform] duration-150 active:scale-[0.98] " +
  "disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100";

const buttonVariants: Record<ButtonVariant, string> = {
  // Reflexo no topo e sombra na cor da marca: o botão parece levitar sobre o vidro.
  primary:
    "bg-primary text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_8px_20px_-10px_rgba(108,12,240,0.65)] hover:bg-[#5708c9] dark:hover:bg-[#7c4df0]",
  ink: "bg-ink text-background shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_8px_20px_-12px_rgba(11,11,16,0.55)] hover:opacity-90",
  secondary: "glass-chip text-ink",
  ghost: "text-ink hover:bg-surface",
  danger: "bg-destructive/[0.08] text-destructive hover:bg-destructive/[0.14]",
};

const buttonSizes: Record<ButtonSize, string> = {
  md: "min-h-12 px-6 text-[15px]",
  sm: "min-h-12 px-4 text-sm",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", block, className, type = "button", ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonBase, buttonVariants[variant], buttonSizes[size], block && "w-full", className)}
      {...rest}
    />
  );
});

/** Botão redondo só com ícone (QR, sino, fechar). Nome acessível obrigatório; badge opcional. */
export function IconButton({
  label,
  children,
  className,
  tone = "surface",
  badge,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; tone?: "surface" | "plain"; badge?: number }) {
  const count = badge && badge > 0 ? (badge > 9 ? "9+" : String(badge)) : null;
  return (
    <button
      type="button"
      aria-label={count ? `${label} (${count})` : label}
      title={label}
      className={cn(
        "relative inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-ink cursor-pointer transition-colors",
        tone === "surface" ? "glass-chip" : "hover:bg-surface",
        className
      )}
      {...rest}
    >
      {children}
      {count && (
        <span
          aria-hidden
          className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-background"
        >
          {count}
        </span>
      )}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Identidade                                                                 */
/* -------------------------------------------------------------------------- */

export function initialsOf(name: string): string {
  const parts = (name || "PRX").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "P") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Avatar redondo: foto da conta (Google) ou iniciais. Fotos de banco de imagem padrão são ignoradas. */
export function Avatar({ name, src, size = 44, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  // Foto enviada pelo membro (https do armazenamento, ou data URL no desenvolvimento). A foto padrão de banco de imagens não conta.
  const photo = src && (/^https:\/\//.test(src) || /^data:image\/(webp|jpeg|png);base64,/.test(src)) && !src.includes("unsplash.com") ? src : null;
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/[0.1] font-semibold text-primary", className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      aria-hidden
    >
      {photo ? <Image src={photo} alt="" fill sizes={`${size}px`} className="object-cover" unoptimized={photo.startsWith("data:")} /> : initialsOf(name)}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Blocos                                                                     */
/* -------------------------------------------------------------------------- */

/** Bloco de conteúdo: vidro fosco (glass) ou leve tom translúcido para blocos aninhados (tint). */
export function Panel({
  children,
  tone = "glass",
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  tone?: "glass" | "tint";
  className?: string;
  as?: "div" | "section" | "article" | "li";
}) {
  return <Tag className={cn("rounded-3xl p-5 sm:p-6", tone === "glass" ? "glass" : "bg-surface", className)}>{children}</Tag>;
}

/** Ação rápida: bloco cinza arredondado com ícone e rótulo embaixo (Enviar, Receber, Área Pix…). */
export function ActionTile({ label, icon, onClick, badge }: { label: string; icon: ReactNode; onClick: () => void; badge?: string }) {
  return (
    <button type="button" onClick={onClick} className="group flex min-w-0 cursor-pointer flex-col items-center gap-2 text-center">
      <span className="glass-chip glass-lift relative flex h-14 w-full items-center justify-center rounded-[20px] text-ink group-active:scale-95">
        {icon}
        {badge && (
          <span className="absolute right-2 top-2 rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-white">{badge}</span>
        )}
      </span>
      <span className="w-full truncate text-[13px] text-ink">{label}</span>
    </button>
  );
}

const brlFormat = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Saldo em destaque: rótulo em caixa alta e valor grande em peso leve, com
 * "R$" em peso normal e separadores de milhar/decimal em cinza, como na referência.
 */
export function BalanceFigure({
  label,
  value,
  hidden = false,
  size = "lg",
  action,
  className,
}: {
  label: string;
  value: number;
  hidden?: boolean;
  size?: "lg" | "md";
  action?: ReactNode;
  className?: string;
}) {
  const parts = brlFormat.formatToParts(value);
  const big = size === "lg" ? "text-[44px] min-[380px]:text-[52px] sm:text-6xl" : "text-[34px] sm:text-[40px]";
  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink">{label}</p>
        {action}
      </div>
      <p className={cn("mt-1.5 font-light leading-[1.05] tracking-[-0.035em] text-ink [font-feature-settings:'pnum']", big)}>
        {hidden ? (
          <>
            <span className="font-normal">R$</span> ••••
          </>
        ) : (
          parts.map((part, index) => {
            if (part.type === "currency") return <span key={index} className="font-normal">{part.value}</span>;
            if (part.type === "literal") return null;
            if (part.type === "group" || part.type === "decimal")
              return (
                <span key={index} className="text-muted-foreground/60">
                  {part.value}
                </span>
              );
            return <span key={index}>{part.value}</span>;
          })
        )}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Formulários                                                                */
/* -------------------------------------------------------------------------- */

/* Campo preenchido em cinza; dentro de um bloco cinza (bg-surface) ele fica branco para não sumir. */
const controlBase =
  "w-full min-w-0 max-w-full box-border rounded-2xl border border-transparent bg-surface in-[.bg-surface]:bg-card px-4 text-[15px] text-ink placeholder:text-[#8a8a96] " +
  "transition-[background-color,border-color,box-shadow] hover:border-input focus:border-primary focus:bg-card focus:outline-none focus-visible:outline-none " +
  "focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-60";

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  children: (id: string, describedBy: string | undefined) => ReactNode;
  className?: string;
}

export function Field({ label, hint, error, children, className }: FieldProps) {
  const id = useId();
  const hintId = hint || error ? `${id}-hint` : undefined;
  return (
    <div className={cn("min-w-0 max-w-full space-y-1.5", className)}>
      <label htmlFor={id} className="block text-[13px] font-medium text-ink">
        {label}
      </label>
      {children(id, hintId)}
      {(hint || error) && (
        <p id={hintId} className={cn("text-[13px]", error ? "text-destructive" : "text-muted-foreground")}>
          {error || hint}
        </p>
      )}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, type, ...rest },
  ref
) {
  return (
    <input
      ref={ref}
      type={type}
      suppressHydrationWarning
      className={cn(
        controlBase,
        "h-12",
        type === "date" && "appearance-none [-webkit-appearance:none] max-w-full min-w-0 text-left cursor-pointer",
        className
      )}
      {...rest}
    />
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, ...rest },
  ref
) {
  return <select ref={ref} suppressHydrationWarning className={cn(controlBase, "h-12 cursor-pointer pr-9", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} suppressHydrationWarning className={cn(controlBase, "min-h-24 py-3 resize-y", className)} {...rest} />;
  }
);

/* -------------------------------------------------------------------------- */
/* Painéis modais (bottom sheet no mobile, diálogo centralizado no desktop)   */
/* -------------------------------------------------------------------------- */

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg";
}

const subscribeNoop = () => () => {};
/*
 * O painel é montado na raiz do app (`.prx-app`, ou `body` fora dela) e não onde o
 * <Sheet> é usado: o conteúdo das telas vive num stacking context (z-10), então um
 * z-index alto lá dentro nunca passaria do dock de navegação (z-50) e a barra
 * cobria botões e cards do painel. No servidor não há DOM, então o host é null.
 */
const getSheetHost = () => document.querySelector<HTMLElement>(".prx-app") ?? document.body;

export function Sheet({ open, onClose, title, description, children, footer, size = "md" }: SheetProps) {
  const host = useSyncExternalStore(subscribeNoop, getSheetHost, () => null);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => {
      if (!panelRef.current?.contains(document.activeElement)) {
        panelRef.current?.focus();
      }
    });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!host) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6" data-lenis-prevent>
          <motion.button
            type="button"
            aria-label="Fechar"
            className="absolute inset-0 cursor-pointer bg-[rgba(12,8,28,0.32)] backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className={cn(
              "glass-strong flex max-h-[92dvh] w-full flex-col text-card-foreground outline-none",
              "rounded-t-[28px] border-b-0 sm:rounded-[28px] sm:border-b",
              size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg"
            )}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 32 }}
          >
            <span aria-hidden className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-line sm:hidden" />
            <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-3 sm:px-7 sm:pt-6">
              <div className="min-w-0 pr-2">
                <h2 id={titleId} className="text-lg font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-xl">
                  {title}
                </h2>
                {description && <p className="mt-1 text-[13px] text-muted-foreground sm:text-sm">{description}</p>}
              </div>
              <IconButton label="Fechar" onClick={onClose} className="-mr-1">
                <IconClose size={18} />
              </IconButton>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-y-contain px-5 py-4 sm:px-7 sm:py-5">{children}</div>
            {footer && (
              <div className="border-t border-line px-5 py-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-7 sm:py-4">{footer}</div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    host
  );
}

/* -------------------------------------------------------------------------- */
/* Controle segmentado: trilho cinza com pílula branca que desliza (layoutId) */
/* -------------------------------------------------------------------------- */

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: string; count?: number }>;
  label: string;
  className?: string;
  /** Poucas opções ocupando toda a largura, sem rolagem (ex.: períodos). */
  equal?: boolean;
}

export function Segmented<T extends string>({ value, onChange, options, label, className, equal = false }: SegmentedProps<T>) {
  const groupId = useId();
  const railRef = useRef<HTMLDivElement>(null);
  // Aba aberta por link ou notificação (#live/resenha): o trilho rola até ela, sem mexer na rolagem da página.
  useEffect(() => {
    const rail = railRef.current;
    const tab = rail?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!rail || !tab || equal || rail.scrollWidth <= rail.clientWidth) return;
    const offset = tab.getBoundingClientRect().left - rail.getBoundingClientRect().left;
    rail.scrollTo({ left: rail.scrollLeft + offset - (rail.clientWidth - tab.offsetWidth) / 2, behavior: "smooth" });
  }, [value, equal]);
  return (
    <div
      ref={railRef}
      role="tablist"
      aria-label={label}
      className={cn(
        "glass-chip w-full max-w-full gap-1 rounded-full p-1",
        equal ? "flex" : "flex overflow-x-auto scrollbar-none overscroll-x-contain touch-pan-x sm:w-fit",
        className
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={(e) => {
              onChange(option.value);
              if (!equal) (e.currentTarget as HTMLElement).scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
            }}
            className={cn(
              "relative min-h-12 cursor-pointer select-none whitespace-nowrap rounded-full text-[13px] font-medium transition-colors sm:text-sm",
              equal ? "flex-auto px-2.5" : "shrink-0 px-4",
              active ? "font-semibold text-ink" : "text-muted-foreground hover:text-ink"
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${groupId}`}
                className="absolute inset-0 rounded-full bg-card shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(22,12,52,0.08),0_4px_12px_-6px_rgba(22,12,52,0.2)] dark:bg-white/[0.12] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]"
                transition={{ type: "spring", stiffness: 300, damping: 28 }}
              />
            )}
            <span className="relative">
              {option.label}
              {typeof option.count === "number" && <span className="ml-1.5 text-xs font-medium text-muted-foreground">{option.count}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Pequenos blocos                                                            */
/* -------------------------------------------------------------------------- */

export function SectionHeader({
  title,
  action,
  as: Heading = "h2",
  id,
  className,
}: {
  title: string;
  action?: ReactNode;
  as?: "h2" | "h3";
  id?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      <Heading id={id} className="text-lg font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-xl">
        {title}
      </Heading>
      {action}
    </div>
  );
}

export function Tag({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "accent" | "success" | "warning" | "ink"; className?: string }) {
  const tones = {
    neutral: "bg-surface text-muted-foreground in-[.bg-surface]:bg-card",
    accent: "bg-primary/[0.09] text-primary",
    success: "bg-success/[0.1] text-success",
    warning: "bg-warning/[0.1] text-warning",
    ink: "bg-ink text-background",
  } as const;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-medium leading-5", tones[tone], className)}>
      {children}
    </span>
  );
}

export function ProgressBar({ value, max = 100, label, tone = "accent" }: { value: number; max?: number; label: string; tone?: "accent" | "ink" | "success" }) {
  const pct = Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0));
  const tones = { accent: "bg-primary", ink: "bg-ink", success: "bg-success" } as const;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      className="h-2 w-full overflow-hidden rounded-full bg-line"
    >
      <motion.div
        className={cn("h-full origin-left rounded-full", tones[tone])}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: pct / 100 }}
        transition={{ type: "spring", stiffness: 120, damping: 24 }}
      />
    </div>
  );
}

export function Notice({ tone = "neutral", children, className }: { tone?: "neutral" | "success" | "error" | "warning"; children: ReactNode; className?: string }) {
  const tones = {
    neutral: "bg-surface text-ink",
    success: "bg-success/[0.08] text-success",
    error: "bg-destructive/[0.07] text-destructive",
    warning: "bg-warning/[0.08] text-warning",
  } as const;
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("rounded-2xl px-4 py-3 text-sm leading-relaxed", tones[tone], className)}>
      {children}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="glass rounded-3xl px-6 py-10 text-center">
      <p className="text-lg font-semibold tracking-[-0.02em] text-ink">{title}</p>
      {body && <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">{body}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

/** Caixa de seleção com rótulo clicável e área de toque de 48px. */
export function Checkbox({
  label,
  hint,
  checked,
  onChange,
  disabled,
  className,
}: {
  label: ReactNode;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("flex min-h-12 items-start gap-3 py-1", className)}>
      {/* Área de toque de 48px em volta da caixa de 20px (as margens negativas não mudam o layout). */}
      <label className={cn("-mx-3.5 -my-3 flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center", disabled && "cursor-not-allowed")}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          aria-describedby={hint ? `${id}-hint` : undefined}
          suppressHydrationWarning
          className="h-5 w-5 shrink-0 cursor-pointer rounded-md border-input accent-primary disabled:cursor-not-allowed"
        />
      </label>
      <div className="min-w-0">
        <label htmlFor={id} className={cn("block cursor-pointer text-[15px] leading-snug text-ink", disabled && "cursor-not-allowed text-muted-foreground")}>
          {label}
        </label>
        {hint && (
          <p id={`${id}-hint`} className="mt-0.5 text-[13px] text-muted-foreground">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}

/** Grupo de opções exclusivas em cartões (role radiogroup). */
export function RadioCards<T extends string>({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; title: string; meta?: string; body?: string }>;
  className?: string;
}) {
  const name = useId();
  return (
    <fieldset className={cn("space-y-1.5", className)}>
      <legend className="mb-1.5 block text-[13px] font-medium text-ink">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const active = option.value === value;
          const id = `${name}-${option.value}`;
          return (
            <label
              key={option.value}
              className={cn(
                "flex min-h-12 cursor-pointer flex-col gap-0.5 rounded-2xl border p-4 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
                active ? "border-primary bg-primary/[0.05]" : "border-transparent bg-surface hover:border-input"
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={active}
                onChange={() => onChange(option.value)}
                aria-labelledby={`${id}-title`}
                aria-describedby={option.meta || option.body ? `${id}-desc` : undefined}
                className="sr-only"
              />
              <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span id={`${id}-title`} className="text-[15px] font-semibold text-ink">
                  {option.title}
                </span>
                {option.meta && <span className="text-[13px] font-medium text-ink">{option.meta}</span>}
              </span>
              {option.body && (
                <span aria-hidden className="text-[13px] leading-snug text-muted-foreground">
                  {option.body}
                </span>
              )}
              {(option.meta || option.body) && (
                <span id={`${id}-desc`} className="sr-only">
                  {[option.meta, option.body].filter(Boolean).join(". ")}
                </span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Formatação monetária em reais com números tabulares. */
export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
