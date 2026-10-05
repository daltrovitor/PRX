// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse } from "@/lib/partners/http";
import { requireInsider } from "@/lib/resenha/access";
import { insiderRequests } from "@/lib/resenha/service";

/** GET /api/insider/requests?link=<id> — pedidos que chegaram pelo link do Insider. */
export async function GET(req: NextRequest) {
  try {
    const { insider } = await requireInsider(req);
    const link = req.nextUrl.searchParams.get("link");
    if (!link) throw new PartnerError("Informe o link.", 400);
    return NextResponse.json({ success: true, requests: await insiderRequests(insider, link) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Não foi possível carregar os pedidos.");
  }
}
