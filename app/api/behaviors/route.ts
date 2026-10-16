// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse } from "@/lib/partners/http";
import { tableReady } from "@/lib/db-features";
import { memberBehaviors } from "@/lib/behaviors/service";
import { getAsaasBankStore } from "@/lib/bank/asaas/store";

/**
 * GET /api/behaviors — comportamentos ativos e o último resultado da pessoa.
 * Só ela vê os próprios resultados; sem conta PRX BANK, aparecem como "não
 * verificável" (a PRX só confere pagamentos feitos pela conta).
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) throw new PartnerError("Não autenticado.", 401);
    if (!(await tableReady("behavior_rules"))) return NextResponse.json({ success: true, behaviors: [] }, { headers: { "Cache-Control": "no-store" } });
    const sub = await getAsaasBankStore()
      .getSubaccount(user.id)
      .catch(() => null);
    const behaviors = await memberBehaviors(user.id, sub?.status === "active");
    return NextResponse.json({ success: true, behaviors }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Erro ao carregar seus comportamentos.");
  }
}
