// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/security";
import { PartnerError } from "@/lib/partners/errors";
import { familyErrorResponse, requireUser } from "@/lib/family/http";
import { asaasActiveFor, asaasDeps } from "@/lib/bank/asaas/deps";
import { providerBalance } from "@/lib/bank/asaas/statement";

/** GET /api/bank/balance — saldo em tempo real no banco parceiro (GET /v3/finance/balance). */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    if (!asaasActiveFor(user.id)) throw new PartnerError("A ativação de contas ainda não está disponível neste ambiente.", 503);
    const rate = checkRateLimit(`bank_balance_${user.id}`, 60, 60);
    if (!rate.allowed) throw new PartnerError(`Muitas consultas. Aguarde ${rate.resetInSeconds}s.`, 429);
    const balance = await providerBalance(user.id, asaasDeps());
    return NextResponse.json({ balance, checkedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return familyErrorResponse(error, "Não foi possível consultar o saldo.");
  }
}
