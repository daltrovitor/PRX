// Hello World
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse, readJson, requireAdmin } from "@/lib/partners/http";
import { recordAdminAction } from "@/lib/admin/audit";
import { firstIssue } from "@/lib/partners/types";
import { getPartnerRepository } from "@/lib/partners/repository";
import { EVENT_STATUSES, eventInputSchema } from "@/lib/live/types";
import { createEvent, deleteEvent, listAdminEvents, setEventStatus, setRunResults, updateEvent } from "@/lib/live/service";

const NO_STORE = { "Cache-Control": "no-store" };

/** GET /api/admin/live/events — todos os eventos com números, e os parceiros que podem ser ligados. */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const [events, partners] = await Promise.all([listAdminEvents(), getPartnerRepository().listPartners()]);
    return NextResponse.json(
      {
        success: true,
        events,
        partners: partners
          .filter((p) => p.status !== "BLOQUEADO")
          .map((p) => ({ id: p.id, name: p.tradeName, status: p.status, hasLogin: Boolean(p.ownerUserId) })),
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    return errorResponse(error, "Erro ao carregar os eventos.");
  }
}

/** POST /api/admin/live/events — cria o evento (rascunho ou já publicado). */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    const parsed = eventInputSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 400);
    const event = await createEvent(parsed.data, admin.email || admin.sub);
    await recordAdminAction(admin, { action: "live.event_created", targetType: "event", targetId: event.id, summary: `Evento criado: ${event.title} (${event.status})` }, req);
    return NextResponse.json({ success: true, event }, { status: 201, headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao criar o evento.");
  }
}

const putSchema = z.union([
  z.object({ id: z.string().min(1), action: z.literal("status"), status: z.enum(EVENT_STATUSES) }),
  z.object({ id: z.string().min(1), action: z.literal("results"), text: z.string().max(200_000) }),
  z.object({ id: z.string().min(1), action: z.literal("update"), event: z.unknown() }),
]);

/**
 * PUT /api/admin/live/events
 *   { id, action: "update", event }   edita os dados
 *   { id, action: "status", status }  publica, volta a rascunho ou cancela
 *   { id, action: "results", text }   resultados da PRX RUN (uma linha por atleta)
 */
export async function PUT(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    const parsed = putSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 400);
    const body = parsed.data;

    if (body.action === "status") {
      const event = await setEventStatus(body.id, body.status);
      await recordAdminAction(admin, { action: "live.event_status", targetType: "event", targetId: event.id, summary: `${event.title}: ${body.status}` }, req);
      return NextResponse.json({ success: true, event }, { headers: NO_STORE });
    }
    if (body.action === "results") {
      const { event, errors } = await setRunResults(body.id, body.text);
      if (errors.length > 0) return NextResponse.json({ success: false, error: errors.slice(0, 5).join(" "), errors }, { status: 422 });
      return NextResponse.json({ success: true, event, count: event.run?.results.length ?? 0 }, { headers: NO_STORE });
    }
    const input = eventInputSchema.safeParse(body.event);
    if (!input.success) throw new PartnerError(firstIssue(input.error), 400);
    const event = await updateEvent(body.id, input.data);
    await recordAdminAction(
      admin,
      { action: "live.event_updated", targetType: "event", targetId: event.id, summary: `Evento editado: ${event.title}`, meta: { minAge: event.minAge, capacity: event.capacity, batches: event.batches.map((b) => ({ id: b.id, price: b.price })) } },
      req
    );
    return NextResponse.json({ success: true, event }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao atualizar o evento.");
  }
}

/** DELETE /api/admin/live/events?id= — só eventos sem nenhum ingresso. */
export async function DELETE(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new PartnerError("Informe o evento.", 400);
    await deleteEvent(id);
    await recordAdminAction(admin, { action: "live.event_deleted", targetType: "event", targetId: id, summary: "Evento excluído (sem ingressos)" }, req);
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, "Erro ao excluir o evento.");
  }
}
