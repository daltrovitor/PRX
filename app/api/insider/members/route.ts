// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/security";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse } from "@/lib/partners/http";
import { requireInsider } from "@/lib/resenha/access";
import { searchCandidates } from "@/lib/resenha/invites";

/** GET /api/insider/members?link=<id>&q=<nome ou ID PRX> — membros que o Insider pode convidar (maiores de 18). */
export async function GET(req: NextRequest) {
  try {
    const { insider } = await requireInsider(req);
    const limit = checkRateLimit(`insider-search:${insider.id}`, 40, 60);
    if (!limit.allowed) throw new PartnerError(`Muitas buscas seguidas. Aguarde ${limit.resetInSeconds}s.`, 429);
    const link = req.nextUrl.searchParams.get("link");
    const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 80);
    if (!link) throw new PartnerError("Informe a Resenha.", 400);
    return NextResponse.json({ success: true, members: await searchCandidates(insider, link, q) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Não foi possível buscar membros.");
  }
}
