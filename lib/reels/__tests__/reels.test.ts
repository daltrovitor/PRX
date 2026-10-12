// Hello World
import { beforeEach, describe, expect, it } from "vitest";
import { getPartnerRepository } from "@/lib/partners/repository";
import { partnerSnapshot } from "@/lib/partners/__tests__/fixtures";
import { getReelsRepository, resetReelsMemory } from "@/lib/reels/repository";
import { MAX_HOME_BANNERS, createReel, engage, homeBanners, memberFeed, updateReel } from "@/lib/reels/service";
import { reelInputSchema } from "@/lib/reels/types";

async function partner(status: "ATIVO" | "SUSPENSO" = "ATIVO") {
  return getPartnerRepository().insertPartner({
    ...partnerSnapshot,
    categoryId: "gastronomia",
    description: "",
    logoUrl: "",
    bannerUrl: "",
    status,
    ownerUserId: null,
    ownerEmail: null,
  });
}

const base = { title: "Drop de outono", videoUrl: "https://cdn.prx.app.br/reels/drop.mp4" };
const banner = { title: "Café no inverno", placement: "home" as const, posterUrl: "https://cdn.prx.app.br/banners/cafe.jpg" };

describe("PRX Reels", () => {
  beforeEach(() => resetReelsMemory());

  it("valida o vídeo e o destino do botão", () => {
    expect(reelInputSchema.safeParse({ ...base, partnerId: "p" }).success).toBe(true);
    expect(reelInputSchema.safeParse({ ...base, partnerId: "p", videoUrl: "" }).success).toBe(false);
    expect(reelInputSchema.safeParse({ ...base, partnerId: "p", videoUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(reelInputSchema.safeParse({ ...base, partnerId: "p", ctaKind: "external", ctaTarget: "http://loja" }).success).toBe(false);
    expect(reelInputSchema.safeParse({ ...base, partnerId: "p", ctaKind: "benefit" }).success).toBe(false);
  });

  it("mostra só vídeos ativos de parceiros sem bloqueio, com o rótulo padrão do botão", async () => {
    const active = await partner();
    const suspended = await partner("SUSPENSO");
    await createReel(reelInputSchema.parse({ ...base, partnerId: active.id }));
    await createReel(reelInputSchema.parse({ ...base, partnerId: suspended.id }));
    const hidden = await createReel(reelInputSchema.parse({ ...base, partnerId: active.id, title: "Oculto" }));
    await updateReel(hidden.id, reelInputSchema.parse({ ...base, partnerId: active.id, title: "Oculto", active: false }));

    const feed = await memberFeed("usr_a");
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({ partnerName: "Café Aurora", ctaLabel: "Ver no Catálogo", liked: false });
  });

  it("conta cada curtida e salvo uma vez por membro", async () => {
    const owner = await partner();
    const reel = await createReel(reelInputSchema.parse({ ...base, partnerId: owner.id }));
    expect(await engage("usr_a", reel.id, "like")).toMatchObject({ likes: 1, liked: true });
    expect(await engage("usr_a", reel.id, "like")).toMatchObject({ likes: 1, liked: true });
    expect(await engage("usr_b", reel.id, "like")).toMatchObject({ likes: 2 });
    expect(await engage("usr_a", reel.id, "unlike")).toMatchObject({ likes: 1, liked: false });
    expect(await engage("usr_a", reel.id, "save")).toMatchObject({ saves: 1, saved: true });
    await expect(engage("usr_a", "nope", "view")).rejects.toThrow(/não encontrado/);
  });
});

describe("banner da Home (Destaque de imagem)", () => {
  beforeEach(() => resetReelsMemory());

  it("exige a imagem; o vídeo do feed segue obrigatório", () => {
    expect(reelInputSchema.safeParse({ ...banner, partnerId: "p" }).success).toBe(true);
    expect(reelInputSchema.safeParse({ ...banner, partnerId: "p", posterUrl: "" }).success).toBe(false);
    expect(reelInputSchema.safeParse({ title: "Sem vídeo", partnerId: "p", placement: "feed" }).success).toBe(false);
    expect(reelInputSchema.safeParse({ ...banner, partnerId: "p", posterUrl: "javascript:alert(1)" }).success).toBe(false);
  });

  it("a Home recebe só banners ativos de parceiros sem bloqueio, na ordem do admin, sem métricas; o feed não os mostra", async () => {
    const active = await partner();
    const suspended = await partner("SUSPENSO");
    await createReel(reelInputSchema.parse({ ...base, partnerId: active.id }));
    await createReel(reelInputSchema.parse({ ...banner, partnerId: active.id, title: "Segundo", sortOrder: 2 }));
    await createReel(reelInputSchema.parse({ ...banner, partnerId: active.id, title: "Primeiro", sortOrder: 1, ctaKind: "external", ctaTarget: "https://loja.exemplo.com/" }));
    await createReel(reelInputSchema.parse({ ...banner, partnerId: suspended.id, title: "Bloqueado" }));
    const paused = await createReel(reelInputSchema.parse({ ...banner, partnerId: active.id, title: "Pausado" }));
    await updateReel(paused.id, reelInputSchema.parse({ ...banner, partnerId: active.id, title: "Pausado", active: false }));

    const banners = await homeBanners();
    expect(banners.map((b) => b.title)).toEqual(["Primeiro", "Segundo"]);
    expect(banners[0]).toMatchObject({ partnerName: "Café Aurora", imageUrl: banner.posterUrl, ctaKind: "external", ctaLabel: "Conhecer Loja", ctaTarget: "https://loja.exemplo.com/" });
    expect(banners[1]).toMatchObject({ ctaLabel: "Ver no Catálogo" });
    expect(Object.keys(banners[0]).sort()).toEqual(["caption", "ctaKind", "ctaLabel", "ctaTarget", "id", "imageUrl", "partnerId", "partnerLogo", "partnerName", "title"]);
    // O feed de vídeos continua só com vídeo.
    expect((await memberFeed("usr_a")).map((r) => r.title)).toEqual(["Drop de outono"]);
  });

  it("não guarda vídeo e conta visualização e clique no botão como nos vídeos", async () => {
    const owner = await partner();
    const reel = await createReel(reelInputSchema.parse({ ...banner, partnerId: owner.id, videoUrl: "https://cdn.prx.app.br/reels/x.mp4" }));
    expect(reel).toMatchObject({ placement: "home", videoUrl: "" });
    await engage("usr_a", reel.id, "view");
    await engage("usr_a", reel.id, "cta");
    expect(await getReelsRepository().get(reel.id)).toMatchObject({ views: 1, ctaClicks: 1 });
  });

  it(`mostra no máximo ${MAX_HOME_BANNERS} banners`, async () => {
    const owner = await partner();
    for (let i = 0; i < MAX_HOME_BANNERS + 2; i++) await createReel(reelInputSchema.parse({ ...banner, partnerId: owner.id, title: `Banner ${i}`, sortOrder: i }));
    expect(await homeBanners()).toHaveLength(MAX_HOME_BANNERS);
  });
});
