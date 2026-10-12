// Hello World
import { PartnerError } from "@/lib/partners/errors";
import { getPartnerRepository } from "@/lib/partners/repository";
import { getBenefit } from "@/lib/partners/catalog";
import { getReelsRepository, type ReactionKind } from "@/lib/reels/repository";
import { ctaLabelOf, type HomeBanner, type MemberReel, type PartnerReel, type ReelAction, type ReelInput } from "@/lib/reels/types";

/** Quantos banners a Home mostra: o admin ordena e o resto fica de fora. */
export const MAX_HOME_BANNERS = 5;

/** Feed do membro: vídeos ativos de parceiros sem bloqueio, com as curtidas e salvos dele. Banners da Home não entram. */
export async function memberFeed(userId: string): Promise<MemberReel[]> {
  const repo = getReelsRepository();
  const [reels, reactions, partners] = await Promise.all([repo.list({ activeOnly: true }), repo.reactions(userId), getPartnerRepository().listPartners()]);
  const blocked = new Set(partners.filter((p) => p.status === "SUSPENSO" || p.status === "BLOQUEADO").map((p) => p.id));
  const liked = new Set(reactions.filter((r) => r.kind === "like").map((r) => r.reelId));
  const saved = new Set(reactions.filter((r) => r.kind === "save").map((r) => r.reelId));
  return reels
    .filter((reel) => reel.placement === "feed" && !blocked.has(reel.partnerId))
    .map((reel) => ({
      id: reel.id,
      partnerId: reel.partnerId,
      partnerName: reel.partnerName,
      partnerLogo: reel.partnerLogo,
      collection: reel.collection,
      title: reel.title,
      caption: reel.caption,
      videoUrl: reel.videoUrl,
      posterUrl: reel.posterUrl,
      ctaKind: reel.ctaKind,
      ctaLabel: ctaLabelOf(reel),
      ctaTarget: reel.ctaTarget,
      likes: reel.likes,
      saves: reel.saves,
      liked: liked.has(reel.id),
      saved: saved.has(reel.id),
    }));
}

/**
 * Banners da Home: Destaques de imagem ativos de parceiros sem bloqueio, na ordem
 * do admin. Mesmas regras e botão dos vídeos; visualização e clique entram nas
 * métricas do destaque (engage).
 */
export async function homeBanners(): Promise<HomeBanner[]> {
  const [reels, partners] = await Promise.all([getReelsRepository().list({ activeOnly: true }), getPartnerRepository().listPartners()]);
  const blocked = new Set(partners.filter((p) => p.status === "SUSPENSO" || p.status === "BLOQUEADO").map((p) => p.id));
  return reels
    .filter((reel) => reel.placement === "home" && reel.posterUrl && !blocked.has(reel.partnerId))
    .slice(0, MAX_HOME_BANNERS)
    .map((reel) => ({
      id: reel.id,
      partnerId: reel.partnerId,
      partnerName: reel.partnerName,
      partnerLogo: reel.partnerLogo,
      title: reel.title,
      caption: reel.caption,
      imageUrl: reel.posterUrl,
      ctaKind: reel.ctaKind,
      ctaLabel: ctaLabelOf(reel),
      ctaTarget: reel.ctaTarget,
    }));
}

/** Curtir, salvar, contar visualização e clique no botão. Cada membro conta uma vez por curtida/salvo. */
export async function engage(userId: string, reelId: string, action: ReelAction): Promise<{ likes: number; saves: number; liked: boolean; saved: boolean }> {
  const repo = getReelsRepository();
  const reel = await repo.get(reelId);
  if (!reel || !reel.active) throw new PartnerError("Vídeo não encontrado.", 404);

  if (action === "view") await repo.bump(reel.id, "views", 1);
  else if (action === "cta") await repo.bump(reel.id, "cta_clicks", 1);
  else {
    const kind: ReactionKind = action === "like" || action === "unlike" ? "like" : "save";
    const on = action === "like" || action === "save";
    if (await repo.setReaction(userId, reel.id, kind, on)) await repo.bump(reel.id, kind === "like" ? "likes" : "saves", on ? 1 : -1);
  }

  const [fresh, reactions] = await Promise.all([repo.get(reel.id), repo.reactions(userId)]);
  return {
    likes: fresh?.likes ?? reel.likes,
    saves: fresh?.saves ?? reel.saves,
    liked: reactions.some((r) => r.reelId === reel.id && r.kind === "like"),
    saved: reactions.some((r) => r.reelId === reel.id && r.kind === "save"),
  };
}

async function withPartner(rawInput: ReelInput) {
  // Banner da Home é só imagem: nenhum vídeo fica guardado.
  const input = rawInput.placement === "home" ? { ...rawInput, videoUrl: "" } : rawInput;
  const catalogTarget = input.ctaKind === "catalog" ? "" : input.ctaTarget;
  if (!input.partnerId) {
    // Marca sem cadastro de parceiro: o vídeo mostra o nome informado.
    return { ...input, ctaTarget: catalogTarget, partnerName: input.brandName, partnerLogo: "" };
  }
  const partner = await getPartnerRepository().getPartner(input.partnerId);
  if (!partner) throw new PartnerError("Parceiro não encontrado. Cadastre-o na aba Parceiros ou informe só o nome da marca.", 404);
  if (input.ctaKind === "benefit") {
    const benefit = await getBenefit(input.ctaTarget);
    if (!benefit) throw new PartnerError("Benefício do botão não encontrado.", 404);
    if (benefit.partnerId !== partner.id) throw new PartnerError("O benefício do botão precisa ser deste parceiro.", 422);
  }
  return { ...input, ctaTarget: catalogTarget, partnerName: partner.tradeName, partnerLogo: partner.logoUrl };
}

export async function createReel(input: ReelInput): Promise<PartnerReel> {
  return getReelsRepository().insert(await withPartner(input));
}

export async function updateReel(id: string, input: ReelInput): Promise<PartnerReel> {
  const updated = await getReelsRepository().update(id, await withPartner(input));
  if (!updated) throw new PartnerError("Vídeo não encontrado.", 404);
  return updated;
}

export async function deleteReel(id: string): Promise<void> {
  if (!(await getReelsRepository().remove(id))) throw new PartnerError("Vídeo não encontrado.", 404);
}
