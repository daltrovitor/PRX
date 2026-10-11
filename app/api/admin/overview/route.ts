// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, requireAdmin } from "@/lib/partners/http";
import { adminOverview } from "@/lib/admin/overview";
import { launchSchemaReady, LAUNCH_MIGRATION_HINT } from "@/lib/db-features";

/** GET /api/admin/overview — indicadores operacionais contados no banco. */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const [overview, schemaReady] = await Promise.all([adminOverview(), launchSchemaReady()]);
    return NextResponse.json({ success: true, overview, migration: schemaReady ? null : LAUNCH_MIGRATION_HINT }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Erro ao carregar a visão geral.");
  }
}
