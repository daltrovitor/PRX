// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/security";
import { PartnerError } from "@/lib/partners/errors";
import { clientIp, errorResponse } from "@/lib/partners/http";
import { publicEdition } from "@/lib/resenha/service";

/** GET /api/resenha/001?i=manu-7k2q — a edição e o Insider do link (nada do endereço da festa). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ edition: string }> }) {
  try {
    const limit = checkRateLimit(`resenha-edition:${clientIp(req) ?? "anon"}`, 60, 60);
    if (!limit.allowed) throw new PartnerError(`Muitas tentativas. Aguarde ${limit.resetInSeconds}s.`, 429);
    const { edition } = await params;
    const view = await publicEdition(edition, req.nextUrl.searchParams.get("i"));
    return NextResponse.json({ success: true, ...view }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Não foi possível abrir esta Resenha.");
  }
}
