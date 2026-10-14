// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { verifyAdminRequest } from "@/lib/auth";
import { bankStatus } from "@/lib/bank/asaas/status";
import { incidentResponse } from "@/lib/incidents";

/** GET /api/admin/bank/status — por que o PRX BANK está (ou não) ligado ao Asaas, sem segredos. */
export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAdminRequest(req);
    if (!auth.authorized) return NextResponse.json({ error: auth.error }, { status: auth.status });
    return NextResponse.json({ success: true, status: await bankStatus() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return incidentResponse(error, "Não foi possível verificar o PRX BANK.");
  }
}
