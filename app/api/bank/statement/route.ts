// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/security";
import { PartnerError } from "@/lib/partners/errors";
import { familyErrorResponse, invalid, requireUser } from "@/lib/family/http";
import { asaasActiveFor, asaasDeps } from "@/lib/bank/asaas/deps";
import { providerStatement, statementQuerySchema } from "@/lib/bank/asaas/statement";

/**
 * GET /api/bank/statement?offset=0&limit=30&startDate=AAAA-MM-DD&finishDate=AAAA-MM-DD
 * Extrato oficial paginado do banco parceiro (GET /v3/financialTransactions).
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    if (!asaasActiveFor(user.id)) throw new PartnerError("A ativação de contas ainda não está disponível neste ambiente.", 503);
    const rate = checkRateLimit(`bank_statement_${user.id}`, 30, 60);
    if (!rate.allowed) throw new PartnerError(`Muitas consultas. Aguarde ${rate.resetInSeconds}s.`, 429);
    const params = Object.fromEntries(req.nextUrl.searchParams.entries());
    const query = statementQuerySchema.safeParse(params);
    if (!query.success) invalid(query.error.issues);
    return NextResponse.json(await providerStatement(user.id, query.data, asaasDeps()), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return familyErrorResponse(error, "Não foi possível carregar o extrato.");
  }
}
