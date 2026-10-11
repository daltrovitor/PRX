// Hello World
import { PartnerError } from "@/lib/partners/errors";
import { getLiveRepository } from "@/lib/live/repository";
import { eventHasEnded } from "@/lib/live/rules";
import { insertWithFreshCode, priceTicket, type TicketQuote } from "@/lib/live/service";
import type { LiveTicket } from "@/lib/live/types";

/**
 * Simulação de compra e teste de portaria do PRX LIVE (só admin).
 * Gera um ingresso de TESTE: preço calculado igual a uma compra real (lote +
 * cupom), mas sem cobrança, sem pagamento confirmado (paid_at vazio), fora da
 * lotação, das métricas e da receita, e marcado na portaria como teste — ele
 * registra a leitura, mas não libera entrada real. Serve para ver o fluxo de
 * ponta a ponta e para o "teste de portaria" exigido antes de operar o evento.
 */

/** Teto de ingressos de teste por evento, para a simulação não virar lixo no banco. */
export const MAX_TEST_TICKETS_PER_EVENT = 30;

export interface TestActor {
  id: string;
  email: string;
  name: string;
}

export interface SimulationInput {
  eventId: string;
  batchId: string;
  promoCode?: string;
  /** Rótulo do titular de teste (ex.: "Insider de teste"). Sempre prefixado com TESTE. */
  holderLabel?: string;
}

async function loadEvent(eventId: string) {
  const event = await getLiveRepository().getEvent(eventId);
  if (!event) throw new PartnerError("Evento não encontrado.", 404);
  if (event.status === "cancelled") throw new PartnerError("Evento cancelado.", 409);
  if (eventHasEnded(event)) throw new PartnerError("Este evento já terminou.", 409);
  return event;
}

/** Resumo do pedido de teste: mesmo cálculo da compra real (o cupom pode estar inativo para pré-visualizar o link). */
export async function simulateQuote(input: SimulationInput): Promise<TicketQuote> {
  const event = await loadEvent(input.eventId);
  const batch = event.batches.find((b) => b.id === input.batchId);
  if (!batch) throw new PartnerError("Lote não encontrado.", 404);
  return (await priceTicket(event, batch, "simulation", input.promoCode, true)).quote;
}

export async function issueTestTicket(actor: TestActor, input: SimulationInput): Promise<{ ticket: LiveTicket; quote: TicketQuote }> {
  const event = await loadEvent(input.eventId);
  const batch = event.batches.find((b) => b.id === input.batchId);
  if (!batch) throw new PartnerError("Lote não encontrado.", 404);
  const existing = (await getLiveRepository().listTickets({ eventId: event.id })).filter((t) => t.isTest);
  if (existing.length >= MAX_TEST_TICKETS_PER_EVENT) throw new PartnerError(`Limite de ${MAX_TEST_TICKETS_PER_EVENT} ingressos de teste neste evento.`, 409);

  const { quote, promo } = await priceTicket(event, batch, actor.id, input.promoCode, true);
  const label = (input.holderLabel ?? "").replace(/\s+/g, " ").trim().slice(0, 60) || actor.name || "Admin PRX";
  const ticket = await insertWithFreshCode(event.series, {
    eventId: event.id,
    batchId: batch.id,
    batchName: batch.name,
    userId: actor.id,
    userEmail: actor.email.toLowerCase(),
    holderName: `TESTE · ${label}`,
    price: quote.total,
    originalPrice: promo ? quote.original : null,
    discount: quote.discount,
    promoCodeId: promo?.id ?? null,
    isTest: true,
    status: "valid",
    source: batch.price === 0 ? "free" : "purchase",
    runDetails: null,
    issuedBy: actor.email.toLowerCase(),
    note: "Simulação (teste): sem cobrança e sem pagamento confirmado. Não libera entrada real.",
    createdAt: new Date().toISOString(),
    // Teste nunca tem pagamento confirmado (garantido também por constraint no banco).
    paidAt: null,
    cancelledAt: null,
    checkedInAt: null,
    checkedInBy: null,
    checkedInByRole: null,
    checkedInByName: null,
  });
  return { ticket, quote };
}

export async function listTestTickets(eventId: string): Promise<LiveTicket[]> {
  return (await getLiveRepository().listTickets({ eventId })).filter((t) => t.isTest);
}
