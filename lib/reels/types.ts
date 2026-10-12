// Hello World
import { z } from "zod";

/**
 * PRX Destaques (antes "Reels"): vídeos verticais (9:16) com produtos e
 * novidades de parceiros, exibidos no feed da aba Destaques. O conteúdo é
 * curado pela PRX (admin) e cada vídeo leva a uma ação direta: benefício do
 * PASS, catálogo ou loja do parceiro. Os nomes técnicos (reels) ficam iguais.
 *
 * O mesmo cadastro também publica o BANNER DA HOME: um Destaque de imagem
 * (placement "home") que aparece abaixo dos eventos, sem rótulo de anúncio, com
 * a marca como "Parceiro PRX" e o mesmo botão de ação e métricas dos vídeos.
 */

/** Onde o destaque aparece: vídeo no feed da aba Destaques ou banner de imagem na Home. */
export const REEL_PLACEMENTS = ["feed", "home"] as const;
export type ReelPlacement = (typeof REEL_PLACEMENTS)[number];

export const REEL_PLACEMENT_LABEL: Record<ReelPlacement, string> = {
  feed: "Aba Destaques (vídeo)",
  home: "Banner da Home (imagem)",
};

export const REEL_COLLECTIONS = ["drops", "vibe", "descubra"] as const;
export type ReelCollection = (typeof REEL_COLLECTIONS)[number];

export const REEL_COLLECTION_LABEL: Record<ReelCollection, string> = {
  drops: "Drops Exclusivos",
  vibe: "Vibe dos Parceiros",
  descubra: "Descubra",
};

export const REEL_CTA_KINDS = ["benefit", "catalog", "external"] as const;
export type ReelCtaKind = (typeof REEL_CTA_KINDS)[number];

export const REEL_CTA_LABEL: Record<ReelCtaKind, string> = {
  benefit: "Aproveitar Benefício",
  catalog: "Ver no Catálogo",
  external: "Conhecer Loja",
};

export interface PartnerReel {
  id: string;
  partnerId: string;
  partnerName: string;
  partnerLogo: string;
  placement: ReelPlacement;
  collection: ReelCollection;
  title: string;
  caption: string;
  videoUrl: string;
  posterUrl: string;
  ctaKind: ReelCtaKind;
  /** Rótulo do botão; vazio usa o padrão do tipo de ação. */
  ctaLabel: string;
  /** Id do benefício (benefit) ou URL https (external). Vazio no catálogo. */
  ctaTarget: string;
  sortOrder: number;
  active: boolean;
  views: number;
  likes: number;
  saves: number;
  ctaClicks: number;
  createdAt: string;
  updatedAt: string;
}

/** O que o membro recebe: sem métricas agregadas de negócio, com o próprio estado. */
export interface MemberReel {
  id: string;
  partnerId: string;
  partnerName: string;
  partnerLogo: string;
  collection: ReelCollection;
  title: string;
  caption: string;
  videoUrl: string;
  posterUrl: string;
  ctaKind: ReelCtaKind;
  ctaLabel: string;
  ctaTarget: string;
  likes: number;
  saves: number;
  liked: boolean;
  saved: boolean;
}

/** O banner como a Home recebe: só a arte, o texto e o botão (nada de métricas). */
export interface HomeBanner {
  id: string;
  partnerId: string;
  partnerName: string;
  partnerLogo: string;
  title: string;
  caption: string;
  imageUrl: string;
  ctaKind: ReelCtaKind;
  ctaLabel: string;
  ctaTarget: string;
}

export const REEL_ACTIONS = ["view", "like", "unlike", "save", "unsave", "cta"] as const;
export type ReelAction = (typeof REEL_ACTIONS)[number];

const mediaUrl = (label: string) =>
  z
    .string()
    .trim()
    .max(2000)
    // https (Supabase Storage/CDN) ou caminho do próprio app (mídia enviada em desenvolvimento).
    .refine((v) => v === "" || /^https:\/\//i.test(v) || /^\/[\w./-]+$/.test(v), `${label}: use um endereço https.`);

export const reelInputSchema = z
  .object({
    /** Parceiro cadastrado (opcional): sem ele, o vídeo mostra a marca informada em brandName. */
    partnerId: z.string().trim().max(100).default(""),
    brandName: z.string().trim().max(80).default(""),
    placement: z.enum(REEL_PLACEMENTS).default("feed"),
    collection: z.enum(REEL_COLLECTIONS).default("descubra"),
    title: z.string().trim().min(2, "Informe o título.").max(80),
    caption: z.string().trim().max(220).default(""),
    videoUrl: mediaUrl("Vídeo").default(""),
    posterUrl: mediaUrl("Capa").default(""),
    ctaKind: z.enum(REEL_CTA_KINDS).default("catalog"),
    ctaLabel: z.string().trim().max(28).default(""),
    ctaTarget: z.string().trim().max(1000).default(""),
    sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
    active: z.boolean().default(true),
  })
  .refine((reel) => reel.placement !== "feed" || reel.videoUrl.length > 0, { message: "Envie o vídeo vertical ou informe a URL.", path: ["videoUrl"] })
  .refine((reel) => reel.placement !== "home" || reel.posterUrl.length > 0, { message: "Envie a imagem do banner ou informe a URL.", path: ["posterUrl"] })
  .refine((reel) => reel.partnerId.length > 0 || reel.brandName.length >= 2, { message: "Escolha o parceiro ou informe o nome da marca.", path: ["brandName"] })
  .refine((reel) => reel.ctaKind !== "benefit" || reel.partnerId.length > 0, { message: "O botão de benefício precisa de um parceiro cadastrado.", path: ["partnerId"] })
  .refine((reel) => reel.ctaKind !== "benefit" || reel.ctaTarget.length > 0, { message: "Escolha o benefício do botão.", path: ["ctaTarget"] })
  .refine((reel) => reel.ctaKind !== "external" || /^https:\/\//i.test(reel.ctaTarget), { message: "O link da loja precisa começar com https://.", path: ["ctaTarget"] });

export type ReelInput = z.output<typeof reelInputSchema>;

export function ctaLabelOf(reel: Pick<PartnerReel, "ctaKind" | "ctaLabel">): string {
  return reel.ctaLabel.trim() || REEL_CTA_LABEL[reel.ctaKind];
}
