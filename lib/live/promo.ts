// Hello World
import { z } from "zod";
import type { TicketBatch } from "@/lib/live/types";

/**
 * Cupons e links de divulgação do PRX LIVE (regras puras, sem I/O).
 * O desconto é sempre calculado aqui, no servidor, a partir do preço do lote:
 * o navegador só manda o código. Há cupons (digitados) e descontos automáticos
 * do evento (sem código). Vale o maior desconto; dois só se somam quando os
 * dois foram marcados como acumuláveis (no máximo um cupom e um automático).
 */

export const PROMO_KINDS = ["percent", "fixed"] as const;
export type PromoKind = (typeof PROMO_KINDS)[number];

/** Quem pode usar o desconto (conferido no servidor). */
export const PROMO_AUDIENCES = ["all", "founders", "subscribers", "bank_active"] as const;
export type PromoAudience = (typeof PROMO_AUDIENCES)[number];
export const PROMO_AUDIENCE_LABEL: Record<PromoAudience, string> = { all: "Todos", founders: "Founders", subscribers: "Assinantes", bank_active: "Com conta PRX BANK ativa" };

/** Formas de pagamento do checkout (cartão de débito não: o provedor não permite pedir débito pela API). */
export const CHECKOUT_METHODS = ["PRX_BANK", "PIX", "CREDIT_CARD"] as const;
export type CheckoutMethod = (typeof CHECKOUT_METHODS)[number];
export const CHECKOUT_METHOD_LABEL: Record<CheckoutMethod, string> = { PRX_BANK: "Conta PRX BANK", PIX: "Pix", CREDIT_CARD: "Cartão de crédito" };

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
  /** true: desconto automático do evento, aplicado sem digitar o código. */
  automatic: boolean;
  audience: PromoAudience;
  /** null = qualquer forma de pagamento. */
  paymentMethods: CheckoutMethod[] | null;
  /** Soma com outro desconto acumulável (cupom + automático). */
  stackable: boolean;
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
    automatic: z.boolean().default(false),
    audience: z.enum(PROMO_AUDIENCES).default("all"),
    paymentMethods: z.union([z.array(z.enum(CHECKOUT_METHODS)).min(1).max(3), z.null()]).default(null),
    stackable: z.boolean().default(false),
  })
  .superRefine((p, ctx) => {
    if (p.kind === "percent" && p.value > 100) ctx.addIssue({ code: "custom", path: ["value"], message: "Percentual máximo de 100%." });
    if (p.startsAt && p.endsAt && new Date(p.endsAt) <= new Date(p.startsAt)) {
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "O fim da validade precisa ser depois do início." });
    }
  });
export type PromoInput = z.output<typeof promoInputSchema>;

/** Motivo para o cupom não valer neste evento/lote agora; null = vale. Limites de uso e público são conferidos à parte. */
export function promoIssue(
  promo: PromoCode,
  input: { eventId: string; batch: Pick<TicketBatch, "id" | "price">; now?: Date; allowInactive?: boolean; method?: CheckoutMethod | null }
): string | null {
  const now = (input.now ?? new Date()).getTime();
  if (!promo.active && !input.allowInactive) return "Este cupom não está ativo.";
  if (promo.eventId !== input.eventId) return "Este cupom não vale para este evento.";
  if (promo.startsAt && now < new Date(promo.startsAt).getTime()) return "Este cupom ainda não começou a valer.";
  if (promo.endsAt && now >= new Date(promo.endsAt).getTime()) return "Este cupom expirou.";
  if (input.batch.price <= 0) return "Cupom não se aplica a ingresso gratuito.";
  if (promo.batchIds && !promo.batchIds.includes(input.batch.id)) return "Este cupom não vale para o lote escolhido.";
  // Sem forma de pagamento escolhida ainda (reserva), desconto restrito a uma forma só entra no checkout.
  if (promo.paymentMethods && (!input.method || !promo.paymentMethods.includes(input.method))) {
    return input.method ? `Este desconto vale só para ${promo.paymentMethods.map((m) => CHECKOUT_METHOD_LABEL[m]).join(" ou ")}.` : "Escolha a forma de pagamento para ver este desconto.";
  }
  return null;
}

export interface AppliedDiscount {
  promoId: string;
  code: string;
  label: string;
  automatic: boolean;
  amount: number;
}

export interface CombinedQuote extends PriceQuote {
  applied: AppliedDiscount[];
}

/**
 * Melhor combinação para o membro: o maior desconto sozinho, ou cupom +
 * automático quando os dois são acumuláveis (o segundo incide sobre o que
 * sobrou). Nunca negativo.
 */
export function combineDiscounts(price: number, coded: PromoCode | null, automatic: ReadonlyArray<PromoCode>): CombinedQuote {
  const original = cents(Math.max(0, price));
  const one = (p: PromoCode, base: number): AppliedDiscount => ({ promoId: p.id, code: p.code, label: p.label || promoLabel(p), automatic: p.automatic, amount: applyPromo(base, p).discount });
  const options: AppliedDiscount[][] = [];
  if (coded) options.push([one(coded, original)]);
  for (const a of automatic) {
    options.push([one(a, original)]);
    if (coded && coded.stackable && a.stackable) {
      const first = one(a, original);
      options.push([first, one(coded, cents(original - first.amount))]);
    }
  }
  const total = (list: AppliedDiscount[]) => list.reduce((s, d) => s + d.amount, 0);
  // Empate: o cupom digitado vence (a pessoa escolheu usá-lo).
  const best = options.reduce<AppliedDiscount[]>((acc, cur) => (total(cur) > total(acc) || (total(cur) === total(acc) && cur.some((d) => !d.automatic) && !acc.some((d) => !d.automatic)) ? cur : acc), []);
  const discount = cents(Math.min(original, total(best)));
  return { original, discount, total: cents(original - discount), applied: best.filter((d) => d.amount > 0) };
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
