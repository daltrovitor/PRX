// Hello World
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Peças visuais comuns ao ingresso PRX LIVE e ao voucher PRX PASS: fundo
 * obsidiana com geometria fina e luz azul/violeta suave, picote entre as
 * partes e a faixa que marca documentos de TESTE ou MODELO ILUSTRATIVO.
 */

export type TicketVariant = "live" | "test" | "illustrative";

export function TicketBackdrop({ accent = "live" }: { accent?: "live" | "pass" }) {
  const glowA = accent === "live" ? "rgba(47,107,255,0.30)" : "rgba(124,58,237,0.32)";
  const glowB = accent === "live" ? "rgba(124,58,237,0.26)" : "rgba(47,107,255,0.22)";
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full blur-3xl" style={{ background: glowA }} />
      <div className="absolute -bottom-28 -right-20 h-72 w-72 rounded-full blur-3xl" style={{ background: glowB }} />
      <svg className="absolute inset-0 h-full w-full opacity-[0.22]" viewBox="0 0 400 640" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="ticket-line" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#6d8dff" />
            <stop offset="1" stopColor="#a78bfa" />
          </linearGradient>
        </defs>
        <g fill="none" stroke="url(#ticket-line)" strokeWidth="0.8">
          <path d="M-20 120 L200 10 L420 120" />
          <path d="M-20 170 L200 60 L420 170" />
          <path d="M40 640 L200 300 L360 640" />
          <path d="M120 640 L200 420 L280 640" />
          <polygon points="300,40 360,75 360,145 300,180 240,145 240,75" />
          <circle cx="70" cy="520" r="46" />
        </g>
      </svg>
    </div>
  );
}

/** Picote: linha tracejada com os recortes laterais do ingresso. */
export function Perforation() {
  return (
    <div aria-hidden className="relative my-1 h-6">
      <span className="absolute -left-3 top-0 h-6 w-6 rounded-full bg-background" />
      <span className="absolute -right-3 top-0 h-6 w-6 rounded-full bg-background" />
      <span className="absolute inset-x-5 top-1/2 border-t border-dashed border-white/25" />
    </div>
  );
}

/** Faixa diagonal sobre o QR: deixa impossível confundir teste/modelo com documento válido. */
export function VariantStamp({ variant }: { variant: TicketVariant }) {
  if (variant === "live") return null;
  const text = variant === "test" ? "TESTE · NÃO LIBERA ENTRADA" : "MODELO ILUSTRATIVO · SEM VALIDADE";
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden rounded-[14px]">
      <span className="ob-label -rotate-[28deg] whitespace-nowrap bg-[#e11d48] px-10 py-1.5 text-[11px] tracking-[0.18em] text-white shadow-[0_6px_20px_-8px_rgba(0,0,0,0.6)]">
        {text}
      </span>
    </div>
  );
}

export function VariantBanner({ variant }: { variant: TicketVariant }) {
  if (variant === "live") return null;
  return (
    <p role="note" className="relative rounded-[10px] bg-[#e11d48] px-3 py-2 text-center text-[12px] font-semibold uppercase tracking-[0.08em] text-white">
      {variant === "test" ? "Ingresso de teste: não é venda e não libera entrada real" : "Modelo ilustrativo com dados fictícios: sem validade para acesso ou resgate"}
    </p>
  );
}

export function TicketField({ label, children, className, mono }: { label: string; children: ReactNode; className?: string; mono?: boolean }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="ob-label text-[10px] tracking-[0.16em] text-white/55">{label}</dt>
      <dd className={cn("mt-1 break-words text-[14px] leading-snug text-white", mono && "font-mono tracking-[0.08em]")}>{children}</dd>
    </div>
  );
}
