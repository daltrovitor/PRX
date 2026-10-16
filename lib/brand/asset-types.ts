// Hello World

/** Materiais oficiais da marca: chaves, lugares e o formato (sem acesso ao banco: servem também às telas). */

export const BRAND_ASSET_KEYS = ["founders_official_image"] as const;
export type BrandAssetKey = (typeof BRAND_ASSET_KEYS)[number];
export const BRAND_ASSET_LABEL: Record<BrandAssetKey, string> = { founders_official_image: "Imagem oficial do PRX Founders" };

export const PLACEMENTS = ["app_home", "founders_tab", "emails"] as const;
export type Placement = (typeof PLACEMENTS)[number];
export const PLACEMENT_LABEL: Record<Placement, string> = { app_home: "Início do app, ao lado do PRX LIVE", founders_tab: "Aba Founders", emails: "E-mails da PRX" };

export interface BrandAsset {
  key: BrandAssetKey;
  url: string | null;
  alt: string;
  enabled: boolean;
  placements: Placement[];
  updatedBy: string | null;
  updatedAt: string | null;
}
