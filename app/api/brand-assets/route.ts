// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/partners/http";
import { BRAND_ASSET_KEYS, PLACEMENTS, brandAssetFor, type BrandAssetKey, type Placement } from "@/lib/brand/assets";

/**
 * GET /api/brand-assets?key=founders_official_image&placement=app_home —
 * material oficial para um lugar do app. Devolve null enquanto o admin não
 * enviar e ativar a imagem (nada de imagem de mentira no lugar).
 */
export async function GET(req: NextRequest) {
  try {
    const key = req.nextUrl.searchParams.get("key") ?? "";
    const placement = req.nextUrl.searchParams.get("placement") ?? "";
    if (!(BRAND_ASSET_KEYS as readonly string[]).includes(key) || !(PLACEMENTS as readonly string[]).includes(placement)) return NextResponse.json({ asset: null });
    const asset = await brandAssetFor(key as BrandAssetKey, placement as Placement);
    return NextResponse.json({ asset }, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
  } catch (error) {
    return errorResponse(error, "Erro ao carregar o material.");
  }
}
