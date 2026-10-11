// Hello World
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse, readJson, requireAdmin } from "@/lib/partners/http";
import { recordAdminAction } from "@/lib/admin/audit";
import { firstIssue } from "@/lib/partners/types";
import { adminCancelTicket, confirmPayment, eventAttendees, issueInvite } from "@/lib/live/service";
import { checkinTicket } from "@/lib/validation/tickets";

const NO_STORE = { "Cache-Control": "no-store" };

/** GET /api/admin/live/tickets?eventId= — lista de ingressos e reservas do evento. */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const eventId = req.nextUrl.searchParams.get("eventId");
    if (!eventId) throw new PartnerError("Informe o evento.", 400);
    return NextResponse.json({ success: true, ...(await eventAttendees(eventId)) }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao carregar os ingressos.");
  }
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm_payment"), ticketId: z.string().min(1), note: z.string().max(300).default("") }),
  z.object({ action: z.literal("cancel"), ticketId: z.string().min(1), note: z.string().max(300).default("") }),
  z.object({ action: z.literal("invite"), eventId: z.string().min(1), email: z.email("E-mail inválido.").trim().toLowerCase(), note: z.string().max(300).default("") }),
  z.object({ action: z.literal("checkin"), code: z.string().min(1).max(300) }),
]);

/**
 * POST /api/admin/live/tickets
 *   confirm_payment  reserva paga fora do app (Pix/dinheiro) vira ingresso válido
 *   cancel           cancela reserva ou ingresso
 *   invite           convite/cortesia para um membro PRX pelo e-mail
 *   checkin          entrada manual pelo código
 */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 400);
    const body = parsed.data;

    switch (body.action) {
      case "confirm_payment": {
        const ticket = await confirmPayment(body.ticketId, body.note);
        await recordAdminAction(admin, { action: "live.payment_confirmed", targetType: "ticket", targetId: ticket.id, summary: `Pagamento confirmado: ${ticket.code} (R$ ${ticket.price.toFixed(2)})`, meta: { eventId: ticket.eventId } }, req);
        return NextResponse.json({ success: true, ticket }, { headers: NO_STORE });
      }
      case "cancel": {
        const ticket = await adminCancelTicket(body.ticketId, body.note);
        await recordAdminAction(admin, { action: "live.ticket_cancelled", targetType: "ticket", targetId: ticket.id, summary: `Ingresso cancelado: ${ticket.code}`, meta: { eventId: ticket.eventId, note: body.note } }, req);
        return NextResponse.json({ success: true, ticket }, { headers: NO_STORE });
      }
      case "invite": {
        const ticket = await issueInvite(body.eventId, body, admin.email || admin.sub);
        await recordAdminAction(admin, { action: "live.invite_issued", targetType: "ticket", targetId: ticket.id, summary: `Convite emitido: ${ticket.code}`, meta: { eventId: ticket.eventId } }, req);
        return NextResponse.json({ success: true, ticket }, { status: 201, headers: NO_STORE });
      }
      case "checkin": {
        const outcome = await checkinTicket({ role: "admin", userId: admin.sub, name: admin.name || "Admin PRX" }, body.code);
        if (!outcome.ok) return NextResponse.json({ success: false, error: outcome.error, ticket: outcome.ticket }, { status: outcome.status });
        return NextResponse.json({ success: true, ticket: outcome.ticket }, { headers: NO_STORE });
      }
    }
  } catch (error) {
    return errorResponse(error, "Erro ao atualizar o ingresso.");
  }
}
