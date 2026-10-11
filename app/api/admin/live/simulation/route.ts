// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse, readJson, requireAdmin } from "@/lib/partners/http";
import { firstIssue } from "@/lib/partners/types";
import { recordAdminAction } from "@/lib/admin/audit";
import { requireLaunchSchema } from "@/lib/db-features";
import { getLiveRepository } from "@/lib/live/repository";
import { purchaseCode, ticketQrPayload } from "@/lib/live/rules";
import { ageRatingLabel } from "@/lib/live/age";
import { SERIES_LABEL, type LiveEvent, type LiveTicket } from "@/lib/live/types";
import { issueTestTicket, listTestTickets, simulateQuote } from "@/lib/live/simulation";

const NO_STORE = { "Cache-Control": "no-store" };

/** Ingresso de teste como a simulação mostra: dados do ingresso + QR real de TESTE. */
function view(ticket: LiveTicket, event: LiveEvent) {
  return {
    id: ticket.id,
    code: ticket.code,
    status: ticket.status,
    qrPayload: ticketQrPayload(ticket),
    checkedInAt: ticket.checkedInAt,
    checkedInByName: ticket.checkedInByName,
    createdAt: ticket.createdAt,
    card: {
      seriesLabel: SERIES_LABEL[event.series],
      eventTitle: event.title,
      startsAt: event.startsAt,
      venue: event.venue,
      city: event.city,
      category: ticket.batchName,
      holderName: ticket.holderName,
      purchaseCode: purchaseCode(ticket.id),
      ticketCode: ticket.code,
      organizer: event.organizerName,
      ageRating: ageRatingLabel(event.minAge),
      idCheckRequired: event.idCheckRequired,
      entryRequirements: event.entryRequirements,
      price: ticket.price,
      originalPrice: ticket.originalPrice,
      discount: ticket.discount,
    },
  };
}

/** GET /api/admin/live/simulation?eventId= — ingressos de teste do evento. */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const eventId = req.nextUrl.searchParams.get("eventId") ?? "";
    const event = eventId ? await getLiveRepository().getEvent(eventId) : null;
    if (!event) throw new PartnerError("Evento não encontrado.", 404);
    const tickets = await listTestTickets(event.id);
    return NextResponse.json({ success: true, tickets: tickets.map((t) => view(t, event)), doorTestVerifiedAt: event.doorTestVerifiedAt, doorTestVerifiedBy: event.doorTestVerifiedBy }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao carregar a simulação.");
  }
}

const schema = z.object({
  action: z.enum(["quote", "issue"]),
  eventId: z.string().min(1).max(100),
  batchId: z.string().min(1).max(40),
  promoCode: z.string().max(40).optional(),
  holderLabel: z.string().max(60).optional(),
});

/**
 * POST /api/admin/live/simulation
 *   { action: "quote", eventId, batchId, promoCode? }               resumo do pedido de teste
 *   { action: "issue", eventId, batchId, promoCode?, holderLabel? }  "pagamento simulado": emite o ingresso de TESTE
 * Nenhuma cobrança é feita e nada entra em receita, lotação ou métricas.
 */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 400);
    const body = parsed.data;
    if (body.action === "quote") return NextResponse.json({ success: true, quote: await simulateQuote(body) }, { headers: NO_STORE });

    await requireLaunchSchema();
    const actor = { id: admin.sub, email: admin.email || "admin@prx", name: admin.name || "Admin PRX" };
    const { ticket, quote } = await issueTestTicket(actor, body);
    const event = await getLiveRepository().getEvent(ticket.eventId);
    await recordAdminAction(admin, { action: "live.test_ticket", targetType: "ticket", targetId: ticket.id, summary: `Ingresso de TESTE ${ticket.code} emitido (simulação, sem cobrança)`, meta: { eventId: ticket.eventId } }, req);
    return NextResponse.json({ success: true, quote, ticket: event ? view(ticket, event) : null }, { status: 201, headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro na simulação.");
  }
}
