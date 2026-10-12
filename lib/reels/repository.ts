// Hello World
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/client";
import { PartnerError, dbError } from "@/lib/partners/errors";
import { isUuid } from "@/lib/partners/catalog";
import { HOME_BANNER_MIGRATION_HINT, homeBannerSchemaReady } from "@/lib/db-features";
import { REEL_COLLECTIONS, REEL_CTA_KINDS, REEL_PLACEMENTS, type PartnerReel, type ReelInput } from "@/lib/reels/types";

/**
 * Persistência dos Reels de parceiros: tabela partner_reels (+ reações por
 * membro em partner_reel_reactions) no Supabase; memória no desenvolvimento.
 * Contadores sobem por função atômica no banco (prx_reel_bump).
 */

export type ReelCounter = "views" | "likes" | "saves" | "cta_clicks";
export type ReactionKind = "like" | "save";

export interface ReelsRepository {
  list(filter?: { activeOnly?: boolean }): Promise<PartnerReel[]>;
  get(id: string): Promise<PartnerReel | null>;
  insert(input: ReelInput & { partnerName: string; partnerLogo: string }): Promise<PartnerReel>;
  update(id: string, input: ReelInput & { partnerName: string; partnerLogo: string }): Promise<PartnerReel | null>;
  remove(id: string): Promise<boolean>;
  bump(id: string, counter: ReelCounter, delta: number): Promise<void>;
  reactions(userId: string): Promise<Array<{ reelId: string; kind: ReactionKind }>>;
  /** true quando o estado mudou (evita contar duas vezes o mesmo like). */
  setReaction(userId: string, reelId: string, kind: ReactionKind, on: boolean): Promise<boolean>;
}

const oneOf = <T extends string>(list: readonly T[], value: unknown, fallback: T): T => (list.includes(value as T) ? (value as T) : fallback);
const count = (value: unknown) => Math.max(0, Math.trunc(Number(value ?? 0)) || 0);

interface ReelRow {
  id: string;
  partner_id: string | null;
  partner_name: string;
  partner_logo: string | null;
  /** Ausente antes da migração do banner da Home: tudo é feed. */
  placement?: string | null;
  collection: string;
  title: string;
  caption: string | null;
  /** Banner da Home não tem vídeo. */
  video_url: string | null;
  poster_url: string | null;
  cta_kind: string;
  cta_label: string | null;
  cta_target: string | null;
  sort_order: number | null;
  is_active: boolean;
  views_count: number | null;
  likes_count: number | null;
  saves_count: number | null;
  cta_clicks_count: number | null;
  created_at: string;
  updated_at: string | null;
}

function mapRow(r: ReelRow): PartnerReel {
  return {
    id: r.id,
    partnerId: r.partner_id ?? "",
    partnerName: r.partner_name,
    partnerLogo: r.partner_logo ?? "",
    placement: oneOf(REEL_PLACEMENTS, r.placement, "feed"),
    collection: oneOf(REEL_COLLECTIONS, r.collection, "descubra"),
    title: r.title,
    caption: r.caption ?? "",
    videoUrl: r.video_url ?? "",
    posterUrl: r.poster_url ?? "",
    ctaKind: oneOf(REEL_CTA_KINDS, r.cta_kind, "catalog"),
    ctaLabel: r.cta_label ?? "",
    ctaTarget: r.cta_target ?? "",
    sortOrder: count(r.sort_order),
    active: Boolean(r.is_active),
    views: count(r.views_count),
    likes: count(r.likes_count),
    saves: count(r.saves_count),
    ctaClicks: count(r.cta_clicks_count),
    createdAt: r.created_at,
    updatedAt: r.updated_at ?? r.created_at,
  };
}

function toRow(input: ReelInput & { partnerName: string; partnerLogo: string }) {
  return {
    partner_id: isUuid(input.partnerId) ? input.partnerId : null,
    partner_name: input.partnerName,
    partner_logo: input.partnerLogo || null,
    collection: input.collection,
    title: input.title,
    caption: input.caption,
    video_url: input.videoUrl || null,
    poster_url: input.posterUrl || null,
    cta_kind: input.ctaKind,
    cta_label: input.ctaLabel || null,
    cta_target: input.ctaTarget || null,
    sort_order: input.sortOrder,
    is_active: input.active,
  };
}

/**
 * Linha pronta para gravar. A coluna placement vem na migração do banner da Home:
 * sem ela o vídeo do feed segue gravando como sempre e o banner é recusado com o aviso.
 */
async function writableRow(input: ReelInput & { partnerName: string; partnerLogo: string }): Promise<Record<string, unknown>> {
  const row: Record<string, unknown> = toRow(input);
  if (await homeBannerSchemaReady()) row.placement = input.placement;
  else if (input.placement === "home") throw new PartnerError(HOME_BANNER_MIGRATION_HINT, 503);
  return row;
}

type SupabaseClient = NonNullable<typeof supabaseAdmin>;

class SupabaseReelsRepository implements ReelsRepository {
  constructor(private readonly db: SupabaseClient) {}

  async list(filter?: { activeOnly?: boolean }) {
    let query = this.db.from("partner_reels").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: false });
    if (filter?.activeOnly) query = query.eq("is_active", true);
    const { data, error } = await query.limit(200);
    if (error) throw dbError(error, "Não foi possível carregar os Reels");
    return (data as ReelRow[]).map(mapRow);
  }

  async get(id: string) {
    if (!isUuid(id)) return null;
    const { data, error } = await this.db.from("partner_reels").select("*").eq("id", id).maybeSingle();
    if (error) throw dbError(error, "Não foi possível carregar o vídeo");
    return data ? mapRow(data as ReelRow) : null;
  }

  async insert(input: ReelInput & { partnerName: string; partnerLogo: string }) {
    const { data, error } = await this.db.from("partner_reels").insert(await writableRow(input)).select("*").single();
    if (error) throw dbError(error, "Não foi possível publicar o vídeo");
    return mapRow(data as ReelRow);
  }

  async update(id: string, input: ReelInput & { partnerName: string; partnerLogo: string }) {
    if (!isUuid(id)) return null;
    const { data, error } = await this.db
      .from("partner_reels")
      .update({ ...(await writableRow(input)), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw dbError(error, "Não foi possível atualizar o vídeo");
    return data ? mapRow(data as ReelRow) : null;
  }

  async remove(id: string) {
    if (!isUuid(id)) return false;
    const { data, error } = await this.db.from("partner_reels").delete().eq("id", id).select("id");
    if (error) throw dbError(error, "Não foi possível excluir o vídeo");
    return (data as unknown[]).length > 0;
  }

  async bump(id: string, counter: ReelCounter, delta: number) {
    if (!isUuid(id)) return;
    const { error } = await this.db.rpc("prx_reel_bump", { p_reel_id: id, p_counter: counter, p_delta: delta });
    if (error) throw dbError(error, "Não foi possível registrar o engajamento");
  }

  async reactions(userId: string) {
    if (!isUuid(userId)) return [];
    const { data, error } = await this.db.from("partner_reel_reactions").select("reel_id, kind").eq("user_id", userId).limit(1000);
    if (error) throw dbError(error, "Não foi possível carregar suas curtidas");
    return (data as Array<{ reel_id: string; kind: string }>).map((r) => ({ reelId: r.reel_id, kind: r.kind === "save" ? ("save" as const) : ("like" as const) }));
  }

  async setReaction(userId: string, reelId: string, kind: ReactionKind, on: boolean) {
    if (!isUuid(userId) || !isUuid(reelId)) return false;
    if (on) {
      const { data, error } = await this.db
        .from("partner_reel_reactions")
        .upsert({ user_id: userId, reel_id: reelId, kind }, { onConflict: "user_id,reel_id,kind", ignoreDuplicates: true })
        .select("reel_id");
      if (error) throw dbError(error, "Não foi possível salvar");
      return (data as unknown[]).length > 0;
    }
    const { data, error } = await this.db.from("partner_reel_reactions").delete().eq("user_id", userId).eq("reel_id", reelId).eq("kind", kind).select("reel_id");
    if (error) throw dbError(error, "Não foi possível desfazer");
    return (data as unknown[]).length > 0;
  }
}

/* -------------------------------------------------------------------------- */
/* Memória                                                                     */
/* -------------------------------------------------------------------------- */

interface MemoryReels {
  reels: PartnerReel[];
  reactions: Set<string>;
  media: Map<string, { type: string; data: Buffer }>;
}

const globalState = globalThis as unknown as { __prxReels?: MemoryReels };
const memory = (): MemoryReels => (globalState.__prxReels ??= { reels: [], reactions: new Set(), media: new Map() });
const COUNTER_FIELD: Record<ReelCounter, "views" | "likes" | "saves" | "ctaClicks"> = { views: "views", likes: "likes", saves: "saves", cta_clicks: "ctaClicks" };

/** Campos gravados: o nome da marca avulsa já vem resolvido em partnerName. */
function stored(input: ReelInput & { partnerName: string; partnerLogo: string }) {
  const copy: Partial<typeof input> = { ...input };
  delete copy.brandName;
  return copy as Omit<typeof input, "brandName">;
}

class MemoryReelsRepository implements ReelsRepository {
  async list(filter?: { activeOnly?: boolean }) {
    const list = memory().reels.filter((r) => !filter?.activeOnly || r.active);
    return structuredClone([...list].sort((a, b) => a.sortOrder - b.sortOrder || b.createdAt.localeCompare(a.createdAt)));
  }

  async get(id: string) {
    const reel = memory().reels.find((r) => r.id === id);
    return reel ? structuredClone(reel) : null;
  }

  async insert(input: ReelInput & { partnerName: string; partnerLogo: string }) {
    const now = new Date().toISOString();
    const reel: PartnerReel = { ...stored(input), id: crypto.randomUUID(), views: 0, likes: 0, saves: 0, ctaClicks: 0, createdAt: now, updatedAt: now };
    memory().reels.push(reel);
    return structuredClone(reel);
  }

  async update(id: string, input: ReelInput & { partnerName: string; partnerLogo: string }) {
    const state = memory();
    const index = state.reels.findIndex((r) => r.id === id);
    if (index === -1) return null;
    state.reels[index] = { ...state.reels[index], ...stored(input), updatedAt: new Date().toISOString() };
    return structuredClone(state.reels[index]);
  }

  async remove(id: string) {
    const state = memory();
    const before = state.reels.length;
    state.reels = state.reels.filter((r) => r.id !== id);
    return state.reels.length < before;
  }

  async bump(id: string, counter: ReelCounter, delta: number) {
    const reel = memory().reels.find((r) => r.id === id);
    if (reel) reel[COUNTER_FIELD[counter]] = Math.max(0, reel[COUNTER_FIELD[counter]] + delta);
  }

  async reactions(userId: string) {
    const out: Array<{ reelId: string; kind: ReactionKind }> = [];
    for (const key of memory().reactions) {
      const [uid, reelId, kind] = key.split("|");
      if (uid === userId) out.push({ reelId, kind: kind === "save" ? "save" : "like" });
    }
    return out;
  }

  async setReaction(userId: string, reelId: string, kind: ReactionKind, on: boolean) {
    const key = `${userId}|${reelId}|${kind}`;
    const set = memory().reactions;
    if (on === set.has(key)) return false;
    if (on) set.add(key);
    else set.delete(key);
    return true;
  }
}

export function getReelsRepository(): ReelsRepository {
  return supabaseAdmin ? new SupabaseReelsRepository(supabaseAdmin) : new MemoryReelsRepository();
}

/* -------------------------------------------------------------------------- */
/* Mídia enviada sem Supabase Storage (desenvolvimento)                        */
/* -------------------------------------------------------------------------- */

export const MAX_MEMORY_MEDIA_BYTES = 25 * 1024 * 1024;

export function storeMemoryMedia(type: string, data: Buffer): string {
  if (data.byteLength > MAX_MEMORY_MEDIA_BYTES) throw new PartnerError("Sem o Supabase Storage configurado, o limite de envio é 25 MB.", 422);
  const id = crypto.randomUUID();
  memory().media.set(id, { type, data });
  return id;
}

export function readMemoryMedia(id: string): { type: string; data: Buffer } | null {
  return memory().media.get(id) ?? null;
}

export function resetReelsMemory() {
  delete globalState.__prxReels;
}
