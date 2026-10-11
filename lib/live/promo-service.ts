// Hello World
import { PartnerError } from "@/lib/partners/errors";
import { getLiveRepository } from "@/lib/live/repository";
import { getPromoRepository, type PromoPatch } from "@/lib/live/promo-repository";
import { isActiveTicket } from "@/lib/live/rules";
import { applyPromo, normalizePromoCode, promoIssue, type PromoCode, type PromoInput, type PriceQuote } from "@/lib/live/promo";
import type { LiveEvent, LiveTicket, TicketBatch } from "@/lib/live/types";

/**
 * Cupons e links de divulgação: cadastro pelo admin, resolução na compra e
 * métricas de conversão. Os limites (total e por pessoa) são conferidos antes
 * e de novo depois de emitir o ingresso, como a lotação: duas compras
 * simultâneas do último uso não passam as duas.
 */

const promos = () => getPromoRepository();
const live = () => getLiveRepository();

export interface PromoStats {
  /** Ingressos ativos com o cupom (reservas + confirmados), sem testes. */
  uses: number;
  /** Pagamento confirmado ou entrada feita. */
  conversions: number;
  pending: number;
  revenue: number;
  discountTotal: number;
}

export type PromoView = PromoCode & { stats: PromoStats; eventTitle: string };

export function promoStats(tickets: ReadonlyArray<LiveTicket>): PromoStats {
  const real = tickets.filter((t) => !t.isTest);
  const active = real.filter(isActiveTicket);
  const converted = real.filter((t) => t.status === "valid" || t.status === "used");
  const sum = (list: LiveTicket[], pick: (t: LiveTicket) => number) => Math.round(list.reduce((acc, t) => acc + pick(t), 0) * 100) / 100;
  return {
    uses: active.length,
    conversions: converted.length,
    pending: real.filter((t) => t.status === "pending_payment").length,
    revenue: sum(converted, (t) => t.price),
    discountTotal: sum(converted, (t) => t.discount),
  };
}

export async function listPromos(eventId?: string): Promise<PromoView[]> {
  const list = await promos().list(eventId ? { eventId } : undefined);
  const titles = new Map<string, string>();
  const views: PromoView[] = [];
  for (const promo of list) {
    if (!titles.has(promo.eventId)) titles.set(promo.eventId, (await live().getEvent(promo.eventId))?.title ?? "Evento removido");
    const tickets = await live().listTickets({ promoCodeId: promo.id });
    views.push({ ...promo, stats: promoStats(tickets), eventTitle: titles.get(promo.eventId) ?? "" });
  }
  return views;
}

function assertBatches(event: LiveEvent, batchIds: string[] | null) {
  if (!batchIds) {
    if (!event.batches.some((b) => b.price > 0)) throw new PartnerError("Este evento não tem lote pago: cupom não se aplica.", 422);
    return;
  }
  for (const id of batchIds) {
    const batch = event.batches.find((b) => b.id === id);
    if (!batch) throw new PartnerError("Lote do cupom não existe neste evento.", 422);
    if (batch.price <= 0) throw new PartnerError(`O lote "${batch.name}" é gratuito: cupom não se aplica.`, 422);
  }
}

export async function createPromo(input: PromoInput, actor: string): Promise<PromoCode> {
  const event = await live().getEvent(input.eventId);
  if (!event) throw new PartnerError("Evento não encontrado.", 404);
  if (event.status === "cancelled") throw new PartnerError("Evento cancelado não recebe cupons.", 409);
  assertBatches(event, input.batchIds);
  if (input.kind === "fixed") {
    const cheapest = Math.min(...event.batches.filter((b) => b.price > 0 && (!input.batchIds || input.batchIds.includes(b.id))).map((b) => b.price));
    if (input.value > cheapest) throw new PartnerError("O desconto fixo é maior que o preço do lote: o ingresso sairia de graça.", 422);
  }
  return promos().insert({ ...input, createdBy: actor });
}

export async function updatePromo(id: string, patch: Pick<PromoPatch, "active" | "label" | "endsAt" | "maxUses" | "perUserLimit">): Promise<PromoCode> {
  const current = await promos().get(id);
  if (!current) throw new PartnerError("Cupom não encontrado.", 404);
  if (patch.endsAt && current.startsAt && new Date(patch.endsAt) <= new Date(current.startsAt)) throw new PartnerError("O fim da validade precisa ser depois do início.", 422);
  return promos().update(id, patch);
}

/**
 * Resolve o código digitado para uma compra: existe, vale para o evento e o
 * lote agora, e ainda tem uso (total e da pessoa). Teste aceita cupom inativo
 * (pré-visualização do link pelo admin) e não conta como uso.
 */
export async function resolvePromo(input: { code: unknown; event: LiveEvent; batch: TicketBatch; userId: string; test?: boolean }): Promise<PromoCode> {
  const code = normalizePromoCode(input.code);
  if (!code) throw new PartnerError("Cupom inválido.", 422);
  const promo = await promos().getByCode(code);
  if (!promo) throw new PartnerError("Cupom não encontrado.", 404);
  const issue = promoIssue(promo, { eventId: input.event.id, batch: input.batch, allowInactive: input.test });
  if (issue) throw new PartnerError(issue, 422);
  if (input.test) return promo;
  const tickets = (await live().listTickets({ promoCodeId: promo.id })).filter((t) => isActiveTicket(t) && !t.isTest);
  if (promo.maxUses !== null && tickets.length >= promo.maxUses) throw new PartnerError("Este cupom esgotou.", 409);
  if (tickets.filter((t) => t.userId === input.userId).length >= promo.perUserLimit) throw new PartnerError("Você já usou este cupom o máximo de vezes permitido.", 409);
  return promo;
}

/** Depois de emitir: o ingresso está dentro dos limites do cupom? */
export async function promoOverflow(promo: PromoCode, ticket: LiveTicket): Promise<string | null> {
  if (promo.maxUses !== null && !(await live().firstPromoTicketIds(promo.id, promo.maxUses)).includes(ticket.id)) return "Este cupom acabou de esgotar.";
  if (!(await live().firstPromoTicketIds(promo.id, promo.perUserLimit, ticket.userId)).includes(ticket.id)) return "Você já usou este cupom o máximo de vezes permitido.";
  return null;
}

export function quoteFor(batch: TicketBatch, promo: PromoCode | null): PriceQuote {
  return applyPromo(batch.price, promo);
}
