// Hello World
import { z } from "zod";
import type { TicketBatch } from "@/lib/live/types";

/**
 * Cupons e links de divulgação do PRX LIVE (regras puras, sem I/O).
 * O desconto é sempre calculado aqui, no servidor, a partir do preço do lote:
 * o navegador só manda o código. Um cupom por ingresso (não acumula).
 */

export const PROMO_KINDS = ["percent", "fixed"] as const;
export type PromoKind = (typeof PROMO_KINDS)[number];

export interface PromoCode {
  id: string;
  eventId: string;
  code: string;
  label: string;
  kind: PromoKind;
  value: number;
  /** null = todos os lotes pagos do evento. */
  batchIds: string[] | null;
  startsAt: string | null;
  endsAt: string | null;
  /** null = sem limite total. */
  maxUses: number | null;
  perUserLimit: number;
  active: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

const CODE_RE = /^[A-Z0-9][A-Z0-9-]{2,31}$/;

/** Código como o membro digita ("amigos 10" → "AMIGOS10"); null se não for um código possível. */
export function normalizePromoCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "").toUpperCase();
  return CODE_RE.test(code) ? code : null;
}

const isoOrNull = z.union([z.string().trim().refine((v) => !Number.isNaN(new Date(v).getTime()), "Data inválida."), z.null()]).default(null);

export const promoInputSchema = z
  .object({
    eventId: z.string().trim().min(1, "Escolha o evento."),
    code: z
      .string()
      .transform((v) => normalizePromoCode(v) ?? "")
      .refine((v) => v !== "", "Use de 3 a 32 letras, números ou hífen, começando por letra ou número."),
    label: z.string().trim().max(80).default(""),
    kind: z.enum(PROMO_KINDS),
    value: z.coerce.number().positive("O desconto precisa ser maior que zero.").max(100_000),
    batchIds: z.union([z.array(z.string().trim().min(1).max(40)).min(1).max(20), z.null()]).default(null),
    startsAt: isoOrNull,
    endsAt: isoOrNull,
    maxUses: z.union([z.coerce.number().int().min(1).max(100_000), z.null()]).default(null),
    perUserLimit: z.coerce.number().int().min(1).max(20).default(1),
    active: z.boolean().default(false),
  })
  .superRefine((p, ctx) => {
    if (p.kind === "percent" && p.value > 100) ctx.addIssue({ code: "custom", path: ["value"], message: "Percentual máximo de 100%." });
    if (p.startsAt && p.endsAt && new Date(p.endsAt) <= new Date(p.startsAt)) {
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "O fim da validade precisa ser depois do início." });
    }
  });
export type PromoInput = z.output<typeof promoInputSchema>;

/** Motivo para o cupom não valer neste evento/lote agora; null = vale. Limites de uso são conferidos à parte. */
export function promoIssue(promo: PromoCode, input: { eventId: string; batch: Pick<TicketBatch, "id" | "price">; now?: Date; allowInactive?: boolean }): string | null {
  const now = (input.now ?? new Date()).getTime();
  if (!promo.active && !input.allowInactive) return "Este cupom não está ativo.";
  if (promo.eventId !== input.eventId) return "Este cupom não vale para este evento.";
  if (promo.startsAt && now < new Date(promo.startsAt).getTime()) return "Este cupom ainda não começou a valer.";
  if (promo.endsAt && now >= new Date(promo.endsAt).getTime()) return "Este cupom expirou.";
  if (input.batch.price <= 0) return "Cupom não se aplica a ingresso gratuito.";
  if (promo.batchIds && !promo.batchIds.includes(input.batch.id)) return "Este cupom não vale para o lote escolhido.";
  return null;
}

export interface PriceQuote {
  original: number;
  discount: number;
  total: number;
}

const cents = (value: number) => Math.round(value * 100) / 100;

/** Preço final com o cupom: nunca negativo e o desconto nunca passa do preço. */
export function applyPromo(price: number, promo: Pick<PromoCode, "kind" | "value"> | null): PriceQuote {
  const original = cents(Math.max(0, price));
  if (!promo) return { original, discount: 0, total: original };
  const raw = promo.kind === "percent" ? (original * Math.min(100, Math.max(0, promo.value))) / 100 : Math.max(0, promo.value);
  const discount = cents(Math.min(original, raw));
  return { original, discount, total: cents(original - discount) };
}

export function promoLabel(promo: Pick<PromoCode, "kind" | "value">): string {
  return promo.kind === "percent" ? `${promo.value.toLocaleString("pt-BR")}% off` : `${promo.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} off`;
}
