// Hello World
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/client";
import { PartnerError, dbError, isMissingTable } from "@/lib/partners/errors";
import { requireTable } from "@/lib/db-features";
import { BRAND_ASSET_KEYS, BRAND_ASSET_LABEL, PLACEMENTS, PLACEMENT_LABEL, type BrandAsset, type BrandAssetKey, type Placement } from "@/lib/brand/asset-types";

export { BRAND_ASSET_KEYS, BRAND_ASSET_LABEL, PLACEMENTS, PLACEMENT_LABEL, type BrandAsset, type BrandAssetKey, type Placement };

/**
 * Materiais oficiais da marca configuráveis pelo admin (tabela brand_assets,
 * migração 20261016_prx_founders_members.sql). O primeiro é a imagem oficial
 * do PRX Founders: os lugares de exibição (início do app ao lado do PRX LIVE,
 * aba Founders e e-mails) já estão prontos, mas nada aparece enquanto a
 * imagem não for enviada e ativada. Trocar a imagem depois é só enviar outra.
 */

export const assetInputSchema = z
  .object({
    url: z.union([z.null(), z.string().trim().max(2000).refine((v) => /^https:\/\//.test(v) || v.startsWith("data:image/"), "Envie a imagem pelo botão.")]),
    alt: z.string().trim().max(200).default(""),
    enabled: z.boolean().default(false),
    placements: z.array(z.enum(PLACEMENTS)).default([]),
  })
  .refine((a) => !a.enabled || a.url, { path: ["enabled"], message: "Envie a imagem oficial antes de ativar." })
  .refine((a) => !a.enabled || a.alt.length >= 3, { path: ["alt"], message: "Descreva a imagem (texto alternativo) antes de ativar." });

const EMPTY = (key: BrandAssetKey): BrandAsset => ({ key, url: null, alt: "", enabled: false, placements: [], updatedBy: null, updatedAt: null });
const memory = () => ((globalThis as unknown as { __prxBrandAssets?: Map<string, BrandAsset> }).__prxBrandAssets ??= new Map());

export async function getBrandAsset(key: BrandAssetKey): Promise<BrandAsset> {
  if (!supabaseAdmin) return structuredClone(memory().get(key) ?? EMPTY(key));
  const { data, error } = await supabaseAdmin.from("brand_assets").select("*").eq("key", key).maybeSingle();
  if (isMissingTable(error)) return EMPTY(key);
  if (error) throw dbError(error, "Não foi possível ler o material da marca");
  if (!data) return EMPTY(key);
  const r = data as Record<string, unknown>;
  return { key, url: (r.url as string | null) ?? null, alt: String(r.alt ?? ""), enabled: r.enabled === true, placements: ((r.placements as Placement[]) ?? []).filter((p) => PLACEMENTS.includes(p)), updatedBy: (r.updated_by as string | null) ?? null, updatedAt: (r.updated_at as string | null) ?? null };
}

export async function saveBrandAsset(key: BrandAssetKey, raw: unknown, actor: string): Promise<BrandAsset> {
  const parsed = assetInputSchema.safeParse(raw);
  if (!parsed.success) throw new PartnerError(parsed.error.issues[0]?.message ?? "Confira o material.", 422);
  const value: BrandAsset = { key, ...parsed.data, updatedBy: actor, updatedAt: new Date().toISOString() };
  if (!supabaseAdmin) {
    memory().set(key, value);
    return structuredClone(value);
  }
  await requireTable("brand_assets", "20261016_prx_founders_members.sql");
  if (value.url?.startsWith("data:")) throw new PartnerError("Envie a imagem pelo botão (o armazenamento devolve um link https).", 422);
  const { error } = await supabaseAdmin
    .from("brand_assets")
    .upsert({ key, url: value.url, alt: value.alt, enabled: value.enabled, placements: value.placements, updated_by: actor, updated_at: value.updatedAt }, { onConflict: "key" });
  if (error) throw dbError(error, "Não foi possível salvar o material da marca");
  return value;
}

/** Material para um lugar do app ou dos e-mails: só se enviado, ativado e marcado para esse lugar. */
export async function brandAssetFor(key: BrandAssetKey, placement: Placement): Promise<{ url: string; alt: string } | null> {
  const asset = await getBrandAsset(key).catch(() => null);
  if (!asset?.enabled || !asset.url || !asset.placements.includes(placement)) return null;
  return { url: asset.url, alt: asset.alt };
}
