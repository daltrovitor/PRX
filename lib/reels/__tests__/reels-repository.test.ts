// Hello World
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetLaunchSchemaCache } from "@/lib/db-features";
import { getReelsRepository } from "@/lib/reels/repository";
import { reelInputSchema } from "@/lib/reels/types";

/**
 * Destaques contra um PostgREST de mentira que RECUSA coluna inexistente: o banner
 * da Home depende da coluna partner_reels.placement (migração 20261012_prx_home_banner),
 * e o feed de vídeos não pode parar de publicar enquanto a migração não for aplicada.
 */

const db = vi.hoisted(() => ({ tables: {} as Record<string, Record<string, unknown>[]>, columns: {} as Record<string, Set<string>>, seq: 0 }));

vi.mock("@/lib/supabase/client", async () => ({ supabaseAdmin: (await import("@/lib/__tests__/fake-postgrest")).fakeSupabase(db) }));

const BASE_COLUMNS = [
  "id", "partner_id", "partner_name", "partner_logo", "collection", "title", "caption", "video_url", "poster_url", "cta_kind", "cta_label", "cta_target",
  "sort_order", "is_active", "views_count", "likes_count", "saves_count", "cta_clicks_count", "created_at", "updated_at",
];

/** Banco com a tabela dos Destaques; a coluna placement (migração do banner) é opcional. */
function schema({ banner }: { banner: boolean }) {
  db.tables = { partner_reels: [] };
  db.columns = { partner_reels: new Set([...BASE_COLUMNS, ...(banner ? ["placement"] : [])]) };
  resetLaunchSchemaCache();
}

const named = (input: ReturnType<typeof reelInputSchema.parse>) => ({ ...input, partnerName: "Marca avulsa", partnerLogo: "" });
const video = named(reelInputSchema.parse({ brandName: "Marca avulsa", title: "Drop de outono", videoUrl: "https://cdn.prx.app.br/reels/drop.mp4" }));
const banner = named(reelInputSchema.parse({ brandName: "Marca avulsa", title: "Banner de outono", placement: "home", posterUrl: "https://cdn.prx.app.br/banners/outono.jpg" }));

describe("banner da Home sem a migração 20261012", () => {
  beforeEach(() => schema({ banner: false }));

  it("o vídeo do feed segue publicando (sem mandar a coluna que não existe) e lê como feed", async () => {
    const reel = await getReelsRepository().insert(video);
    expect(reel).toMatchObject({ placement: "feed", videoUrl: "https://cdn.prx.app.br/reels/drop.mp4" });
    expect(db.tables.partner_reels[0]).not.toHaveProperty("placement");
    expect((await getReelsRepository().list({ activeOnly: true })).map((r) => r.id)).toEqual([reel.id]);
  });

  it("o banner é recusado com o aviso da migração, sem gravar nada", async () => {
    await expect(getReelsRepository().insert(banner)).rejects.toMatchObject({ status: 503, message: expect.stringContaining("20261012_prx_home_banner.sql") });
    expect(db.tables.partner_reels).toHaveLength(0);
  });
});

describe("banner da Home com a migração aplicada", () => {
  beforeEach(() => schema({ banner: true }));

  it("grava o banner como 'home', sem vídeo, e o lê de volta", async () => {
    const reel = await getReelsRepository().insert(banner);
    expect(db.tables.partner_reels[0]).toMatchObject({ placement: "home", video_url: null, poster_url: "https://cdn.prx.app.br/banners/outono.jpg" });
    expect(reel).toMatchObject({ placement: "home", videoUrl: "", posterUrl: "https://cdn.prx.app.br/banners/outono.jpg" });
  });

  it("o vídeo do feed grava 'feed' e trocar de banner para vídeo atualiza o destino", async () => {
    const repo = getReelsRepository();
    const feed = await repo.insert(video);
    expect(db.tables.partner_reels[0]).toMatchObject({ placement: "feed" });
    const made = await repo.insert(banner);
    const switched = await repo.update(made.id, { ...video, title: "Agora é vídeo" });
    expect(switched).toMatchObject({ placement: "feed", title: "Agora é vídeo", videoUrl: "https://cdn.prx.app.br/reels/drop.mp4" });
    expect((await repo.list()).map((r) => r.placement)).toEqual(["feed", "feed"]);
    expect(feed.placement).toBe("feed");
  });
});
