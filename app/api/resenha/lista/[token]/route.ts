// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/security";
import { PartnerError } from "@/lib/partners/errors";
import { clientIp, errorResponse } from "@/lib/partners/http";
import { guestView } from "@/lib/resenha/service";

/** GET /api/resenha/lista/<token> — situação do pedido; o endereço e o QR só vêm com o pedido liberado. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const limit = checkRateLimit(`resenha-guest:${clientIp(req) ?? "anon"}`, 120, 60);
    if (!limit.allowed) throw new PartnerError(`Muitas tentativas. Aguarde ${limit.resetInSeconds}s.`, 429);
    const { token } = await params;
    return NextResponse.json({ success: true, view: await guestView(token) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Não foi possível abrir o seu pedido.");
  }
}
