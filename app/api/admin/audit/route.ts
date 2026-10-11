// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, requireAdmin } from "@/lib/partners/http";
import { listAdminActions } from "@/lib/admin/audit";
import { listValidations } from "@/lib/validation/log";
import { pageParams } from "@/lib/admin/paging";

/**
 * GET /api/admin/audit?log=admin|validations&page=&pageSize=&…
 *   admin        ações críticas do painel (filtros: action, target, actor)
 *   validations  leituras da portaria e do balcão (filtros: kind, outcome, eventId)
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const q = req.nextUrl.searchParams;
    const { page, pageSize } = pageParams(q);
    if (q.get("log") === "validations") {
      const kind = q.get("kind");
      const outcome = q.get("outcome");
      const result = await listValidations({
        page,
        pageSize,
        kind: kind === "ticket" || kind === "voucher" ? kind : undefined,
        outcome: outcome === "accepted" || outcome === "refused" ? outcome : undefined,
        eventId: q.get("eventId")?.slice(0, 80) || undefined,
      });
      return NextResponse.json({ success: true, ...result }, { headers: { "Cache-Control": "no-store" } });
    }
    const result = await listAdminActions({
      page,
      pageSize,
      action: q.get("action")?.slice(0, 80) || undefined,
      targetType: q.get("target")?.slice(0, 40) || undefined,
      actor: q.get("actor")?.slice(0, 80) || undefined,
    });
    return NextResponse.json({ success: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Erro ao consultar os registros.");
  }
}
