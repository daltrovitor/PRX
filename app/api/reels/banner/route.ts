// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse } from "@/lib/partners/http";
import { homeBanners } from "@/lib/reels/service";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * GET /api/reels/banner — banners de parceiros da Home (Destaques de imagem).
 * Visualização e clique no botão são contados pelo POST /api/reels, como nos vídeos.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) throw new PartnerError("Não autenticado.", 401);
    return NextResponse.json({ success: true, banners: await homeBanners() }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao carregar o banner.");
  }
}
