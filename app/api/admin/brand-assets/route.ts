// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse, readJson, requireAdmin } from "@/lib/partners/http";
import { firstIssue } from "@/lib/partners/types";
import { recordAdminAction } from "@/lib/admin/audit";
import { BRAND_ASSET_KEYS, BRAND_ASSET_LABEL, getBrandAsset, saveBrandAsset } from "@/lib/brand/assets";

const NO_STORE = { "Cache-Control": "no-store, private" };

/** GET /api/admin/brand-assets — materiais oficiais da marca e onde aparecem. */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    return NextResponse.json({ success: true, assets: await Promise.all(BRAND_ASSET_KEYS.map((k) => getBrandAsset(k))) }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao carregar os materiais da marca.");
  }
}

const schema = z.object({ key: z.enum(BRAND_ASSET_KEYS), data: z.unknown() });

/** POST /api/admin/brand-assets — troca a imagem, o texto alternativo, os lugares e liga/desliga a exibição. */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 400);
    const asset = await saveBrandAsset(parsed.data.key, parsed.data.data, admin.email || admin.sub);
    await recordAdminAction(
      admin,
      { action: "brand.asset_saved", targetType: "brand_asset", targetId: asset.key, summary: `${BRAND_ASSET_LABEL[asset.key]}: ${asset.enabled ? `ligada em ${asset.placements.join(", ") || "nenhum lugar"}` : "desligada"}` },
      req
    );
    return NextResponse.json({ success: true, asset }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao salvar o material da marca.");
  }
}
