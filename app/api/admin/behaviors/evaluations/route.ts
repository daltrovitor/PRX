// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, requireAdmin } from "@/lib/partners/http";
import { pageParams } from "@/lib/admin/paging";
import { memberContacts } from "@/lib/admin/members";
import { getBehaviorsRepository } from "@/lib/behaviors/repository";
import { EVALUATION_STATUSES } from "@/lib/behaviors/types";

/** GET /api/admin/behaviors/evaluations?ruleId=&status=&userId=&page= — resultados com evidências, período e fonte. */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const params = req.nextUrl.searchParams;
    const { page, pageSize } = pageParams(params, 25);
    const status = params.get("status") ?? "";
    const result = await getBehaviorsRepository().listEvaluations({
      ruleId: (params.get("ruleId") ?? "").slice(0, 80) || undefined,
      userId: (params.get("userId") ?? "").slice(0, 80) || undefined,
      status: (EVALUATION_STATUSES as readonly string[]).includes(status) ? status : undefined,
      offset: (page - 1) * pageSize,
      limit: pageSize,
    });
    const contacts = await memberContacts(result.items.map((e) => e.userId));
    const items = result.items.map((e) => ({ ...e, memberName: contacts.get(e.userId)?.name ?? "Conta excluída", memberEmail: contacts.get(e.userId)?.email ?? "" }));
    return NextResponse.json({ success: true, items, total: result.total, page, pageSize }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    return errorResponse(error, "Erro ao carregar as avaliações.");
  }
}
