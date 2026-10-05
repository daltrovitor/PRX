// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { verifyAdminRequest } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { bankStatus } from "@/lib/bank/asaas/status";

/** GET /api/admin/bank/status — por que o PRX BANK está (ou não) ligado ao Asaas, sem segredos. */
export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAdminRequest(req);
    if (!auth.authorized) return NextResponse.json({ error: auth.error }, { status: auth.status });
    return NextResponse.json({ success: true, status: await bankStatus() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) || "Não foi possível verificar o PRX BANK." }, { status: 500 });
  }
}
