// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse } from "@/lib/partners/http";
import { foundersHub } from "@/lib/founders/service";
import { founderIsCurrent, founderOf, publicFounders } from "@/lib/founders/members";
import { brandAssetFor } from "@/lib/brand/assets";

/** GET /api/founders — conteúdo publicado do PRX Founders, os Founders ativos e o status de quem pede. */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) throw new PartnerError("Não autenticado.", 401);
    // Founders ativos (só nome e chamada), o status de quem pede e a imagem oficial quando ativada para a aba.
    const [hub, founders, me, officialImage] = await Promise.all([foundersHub(), publicFounders().catch(() => []), founderOf(user.id).catch(() => null), brandAssetFor("founders_official_image", "founders_tab")]);
    const mine = me && founderIsCurrent(me) ? { displayName: me.displayName, headline: me.headline, benefits: me.benefits, endsAt: me.endsAt } : null;
    return NextResponse.json({ success: true, ...hub, founders, me: mine, officialImage }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Erro ao carregar o PRX Founders.");
  }
}
