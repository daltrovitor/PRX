// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse, readJson, requireAdmin } from "@/lib/partners/http";
import { firstIssue } from "@/lib/partners/types";
import { recordAdminAction } from "@/lib/admin/audit";
import { pageParams } from "@/lib/admin/paging";
import { memberContacts } from "@/lib/admin/members";
import { getPaymentGateway } from "@/lib/billing/gateway";
import { ORDER_STATUSES, getOrdersRepository } from "@/lib/checkout/repository";
import { confirmReviewedOrder, refundOrder, syncOrder } from "@/lib/checkout/payments";
import { getLiveRepository } from "@/lib/live/repository";

const NO_STORE = { "Cache-Control": "no-store, private" };

/** GET /api/admin/live/orders?status=&eventId=&page= — pedidos do checkout com quem comprou e o evento. */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const params = req.nextUrl.searchParams;
    const { page, pageSize } = pageParams(params, 25);
    const status = params.get("status") ?? "";
    const result = await getOrdersRepository().list({
      status: (ORDER_STATUSES as readonly string[]).includes(status) ? status : undefined,
      eventId: (params.get("eventId") ?? "").slice(0, 80) || undefined,
      offset: (page - 1) * pageSize,
      limit: pageSize,
    });
    const contacts = await memberContacts(result.items.map((o) => o.userId));
    const titles = new Map<string, string>();
    for (const o of result.items) if (!titles.has(o.eventId)) titles.set(o.eventId, (await getLiveRepository().getEvent(o.eventId))?.title ?? "Evento removido");
    const items = result.items.map((o) => ({ ...o, memberName: contacts.get(o.userId)?.name ?? "Conta excluída", memberEmail: contacts.get(o.userId)?.email ?? "", eventTitle: titles.get(o.eventId) ?? "" }));
    return NextResponse.json({ success: true, items, total: result.total, page, pageSize, paymentsOnline: getPaymentGateway() !== null }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao carregar os pedidos.");
  }
}

const id = z.string().trim().min(1).max(80);
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("sync"), id }),
  z.object({ action: z.literal("confirm"), id, note: z.string().trim().min(5, "Explique por que o ingresso pode ser liberado.").max(300) }),
  z.object({ action: z.literal("refund"), id, reason: z.string().trim().max(500) }),
]);

/**
 * POST /api/admin/live/orders
 *   sync     relê a cobrança no provedor de pagamentos (aviso perdido)
 *   confirm  libera o ingresso de um pedido pago em revisão (ex.: a vaga ainda existe)
 *   refund   estorna no provedor de pagamentos (o webhook cancela o ingresso)
 */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 400);
    const body = parsed.data;
    const gateway = getPaymentGateway();
    let summary: string;
    let order;
    if (body.action === "confirm") {
      order = await confirmReviewedOrder(body.id, body.note);
      summary = `Pedido em revisão liberado: ${body.note}`;
    } else {
      if (!gateway) throw new PartnerError("Pagamentos indisponíveis neste ambiente.", 503);
      if (body.action === "sync") {
        order = await syncOrder(body.id, gateway);
        summary = `Pedido conferido no provedor de pagamentos: ${order?.status ?? "—"}`;
      } else {
        order = await refundOrder(body.id, body.reason, gateway);
        summary = `Estorno pedido: ${body.reason}`;
      }
    }
    await recordAdminAction(admin, { action: `live.order_${body.action}`, targetType: "live_order", targetId: body.id, summary }, req);
    return NextResponse.json({ success: true, order }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Não foi possível atualizar o pedido.");
  }
}
