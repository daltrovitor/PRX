// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse, readJson, requireAdmin } from "@/lib/partners/http";
import { firstIssue } from "@/lib/partners/types";
import { tableReady } from "@/lib/db-features";
import { LEAD_STATUSES, PARTNER_LEADS_MIGRATION, leadUpdateSchema, type LeadStatus } from "@/lib/partner-leads/types";
import { listPartnerLeads, updatePartnerLead } from "@/lib/partner-leads/repository";

const NO_STORE = { "Cache-Control": "no-store" };

/** GET /api/admin/partner-leads?status=new — pedidos "Seja um parceiro", mais recentes primeiro. */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    if (!(await tableReady("partner_leads"))) {
      return NextResponse.json({ success: true, available: false, migration: PARTNER_LEADS_MIGRATION, leads: [] }, { headers: NO_STORE });
    }
    const raw = req.nextUrl.searchParams.get("status");
    const status = (LEAD_STATUSES as readonly string[]).includes(raw ?? "") ? (raw as LeadStatus) : undefined;
    return NextResponse.json({ success: true, available: true, leads: await listPartnerLeads(status) }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao carregar os pedidos de parceria.");
  }
}

/** PUT /api/admin/partner-leads — andamento comercial (status e anotação). */
export async function PUT(req: NextRequest) {
  try {
    await requireAdmin(req);
    const parsed = leadUpdateSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 400);
    const { id, ...patch } = parsed.data;
    return NextResponse.json({ success: true, lead: await updatePartnerLead(id, patch) }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao atualizar o pedido de parceria.");
  }
}
