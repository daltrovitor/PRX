// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse, readJson, requireAdmin } from "@/lib/partners/http";
import { firstIssue } from "@/lib/partners/types";
import { tableReady } from "@/lib/db-features";
import { SUPPORT_MIGRATION, SUPPORT_STATUSES, adminActionSchema, type SupportStatus } from "@/lib/support/types";
import { adminAct, adminTickets } from "@/lib/support/service";

const NO_STORE = { "Cache-Control": "no-store" };

/** GET /api/admin/support?status=open&page=0 — fila do SAC, mais recentes primeiro. */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    if (!(await tableReady("support_tickets"))) {
      return NextResponse.json({ success: true, available: false, migration: SUPPORT_MIGRATION, items: [], total: 0 }, { headers: NO_STORE });
    }
    const raw = req.nextUrl.searchParams.get("status");
    const status = (SUPPORT_STATUSES as readonly string[]).includes(raw ?? "") ? (raw as SupportStatus) : undefined;
    const page = Math.max(0, Math.trunc(Number(req.nextUrl.searchParams.get("page") ?? 0)) || 0);
    return NextResponse.json({ success: true, available: true, ...(await adminTickets({ status, page })) }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao carregar o atendimento.");
  }
}

/** PUT /api/admin/support — responde e/ou muda o status de uma solicitação. */
export async function PUT(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    const parsed = adminActionSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 400);
    const ticket = await adminAct({ name: admin.name ?? "", email: admin.email }, parsed.data);
    return NextResponse.json({ success: true, ticket }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao responder o atendimento.");
  }
}
