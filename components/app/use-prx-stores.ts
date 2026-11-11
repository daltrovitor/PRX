// Hello World
"use client";

import { fetchWithTimeout } from "@/lib/client-fetch";

import { useBootTask } from "@/components/brand/boot-boundary";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { BankAccountView } from "@/lib/prx/bank";
import type { MemberWallet, PublicEvent, TicketQuote } from "@/lib/live/service";
import type { PointsWallet } from "@/lib/points/types";
import type { HomeBanner } from "@/lib/reels/types";

/**
 * Dados do PRX BANK e do PRX LIVE vindos do servidor (/api/bank e /api/live),
 * compartilhados entre as telas por um cache em memória por membro.
 * Nada fica no aparelho: saldo, ingressos e pedidos existem só no banco de dados.
 */

interface ResourceState<T> {
  owner: string | null;
  data: T | null;
  error: string | null;
  loading: boolean;
  settled: boolean;
}

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Recompensa de uma compra em parceiro detectada no Pix. */
export interface PartnerReward {
  partnerName: string;
  categoryName: string;
  coins: number;
  xp: number;
  balanceCoins: number;
  level: number;
}

function createResource<T>(url: string, pick: (json: Record<string, unknown>) => T | null) {
  let state: ResourceState<T> = { owner: null, data: null, error: null, loading: false, settled: false };
  let inflight: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const emit = (next: Partial<ResourceState<T>>) => {
    state = { ...state, ...next };
    listeners.forEach((listener) => listener());
  };

  /** force: busca de novo mesmo com dados em cache (mantém os atuais na tela enquanto carrega). */
  function load(owner: string, force = false): Promise<void> {
    if (state.owner !== owner) {
      state = { owner, data: null, error: null, loading: false, settled: false };
      inflight = null;
    }
    if (inflight && !force) return inflight;
    emit({ loading: true, error: null });
    inflight = fetchWithTimeout(url, { cache: "no-store" })
      .then(async (res) => {
        const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (state.owner !== owner) return;
        if (!res.ok) {
          emit({ loading: false, settled: true, error: typeof json.error === "string" ? json.error : "Não foi possível carregar agora." });
          return;
        }
        emit({ loading: false, settled: true, data: pick(json) });
      })
      .catch(() => {
        if (state.owner === owner) emit({ loading: false, settled: true, error: "Sem internet agora. Confira sua conexão e tente de novo." });
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get: () => state,
    load,
    set(owner: string, data: T) {
      if (state.owner === owner) emit({ data, error: null, settled: true });
    },
  };
}

const SERVER_SNAPSHOT: ResourceState<never> = { owner: null, data: null, error: null, loading: true, settled: false };
const serverSnapshot = () => SERVER_SNAPSHOT;

/** Remove carteiras locais de versões antigas (dados de demonstração guardados no aparelho). */
function dropLegacyStorage(userId: string) {
  try {
    window.localStorage.removeItem(`prx:bank:${userId}`);
    window.localStorage.removeItem(`prx:live:${userId}`);
  } catch {
    // sem storage: nada a limpar
  }
}

function useResource<T>(resource: ReturnType<typeof createResource<T>>, userId: string) {
  const state = useSyncExternalStore(resource.subscribe, resource.get, serverSnapshot) as ResourceState<T>;
  const mine = state.owner === userId;
  const needsLoad = !mine || (!state.settled && !state.loading && !state.error);

  useEffect(() => {
    if (needsLoad) {
      dropLegacyStorage(userId);
      void resource.load(userId);
    }
  }, [needsLoad, resource, userId]);

  const reload = useCallback(() => resource.load(userId), [resource, userId]);
  return { data: mine ? state.data : null, loading: !mine || state.loading || !state.settled, error: mine ? state.error : null, reload };
}

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; json: Record<string, unknown> }> {
  try {
    const res = await fetchWithTimeout(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: res.ok, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  } catch {
    return { ok: false, json: { error: "Sem internet agora. Confira sua conexão e tente de novo." } };
  }
}

const failure = (json: Record<string, unknown>, fallback: string): ActionResult => ({ ok: false, error: typeof json.error === "string" ? json.error : fallback });

/* -------------------------------------------------------------------------- */
/* PRX BANK                                                                    */
/* -------------------------------------------------------------------------- */

const bankResource = createResource<BankAccountView>("/api/bank", (json) => (json.account as BankAccountView) ?? null);

export function useBankAccount(userId: string) {
  const { data, loading, error, reload } = useResource(bankResource, userId);

  const run = useCallback(
    async (body: { action: string } & Record<string, unknown>): Promise<ActionResult & { reward?: PartnerReward | null }> => {
      const { ok, json } = await postJson("/api/bank", body);
      if (!ok) return failure(json, "Não foi possível concluir a operação.");
      if (json.account) bankResource.set(userId, json.account as BankAccountView);
      const reward = (json.reward as PartnerReward | null | undefined) ?? null;
      // Compra em parceiro mexe em coins e XP: a carteira de pontos recarrega.
      if (reward) void pointsResource.load(userId, true);
      return { ok: true, reward };
    },
    [userId]
  );

  return { account: data, loading, error, reload, run };
}

/** Recarrega a conta depois de um aviso do banco parceiro (Pix recebido, conta paga): o saldo muda. */
export function reloadBank(userId: string): void {
  void bankResource.load(userId, true);
}

/* -------------------------------------------------------------------------- */
/* PRX COINS & XP                                                              */
/* -------------------------------------------------------------------------- */

const pointsResource = createResource<PointsWallet>("/api/points", (json) => (json.wallet as PointsWallet) ?? null);

/** Carteira de pontos: coins, XP, nível, extrato, check-ins e compras em parceiros. */
export function usePointsWallet(userId: string) {
  const { data, loading, error, reload } = useResource(pointsResource, userId);

  /** Envia um bom comportamento para análise (nada é creditado até a aprovação). */
  const checkin = useCallback(
    async (ruleId: string, evidence: string): Promise<ActionResult> => {
      const { ok, json } = await postJson("/api/points", { action: "checkin", ruleId, evidence });
      if (!ok) return failure(json, "Não foi possível enviar para análise.");
      if (json.wallet) pointsResource.set(userId, json.wallet as PointsWallet);
      return { ok: true };
    },
    [userId]
  );

  const refresh = useCallback(() => pointsResource.load(userId, true), [userId]);

  return { wallet: data, loading, error, reload, refresh, checkin };
}

/** Recarrega a carteira de pontos depois de algo que gasta ou credita coins (resgate, validação). */
export function reloadPoints(userId: string): void {
  void pointsResource.load(userId, true);
}

/* -------------------------------------------------------------------------- */
/* PRX LIVE                                                                    */
/* -------------------------------------------------------------------------- */

export interface LiveData {
  events: PublicEvent[];
  wallet: MemberWallet;
}

const liveResource = createResource<LiveData>("/api/live", (json) =>
  Array.isArray(json.events) && json.wallet ? { events: json.events as PublicEvent[], wallet: json.wallet as MemberWallet } : null
);

export function useLiveData(userId: string) {
  const { data, loading, error, reload } = useResource(liveResource, userId);

  const applyWallet = useCallback(
    (wallet: MemberWallet) => {
      const current = liveResource.get();
      if (current.owner === userId && current.data) liveResource.set(userId, { ...current.data, wallet });
    },
    [userId]
  );

  /** Reserva/garante o ingresso; depois recarrega a vitrine (lugares restantes mudaram). */
  const reserve = useCallback(
    async (input: { eventId: string; batchId: string; run?: unknown; promoCode?: string; birthDate?: string; parentEmail?: string }): Promise<ActionResult> => {
      const { ok, json } = await postJson("/api/live", { action: "reserve", ...input });
      if (!ok) return failure(json, "Não foi possível garantir o ingresso.");
      if (json.wallet) applyWallet(json.wallet as MemberWallet);
      void liveResource.load(userId);
      return { ok: true };
    },
    [applyWallet, userId]
  );

  const cancel = useCallback(
    async (ticketId: string): Promise<ActionResult> => {
      const { ok, json } = await postJson("/api/live", { action: "cancel", ticketId });
      if (!ok) return failure(json, "Não foi possível cancelar.");
      if (json.wallet) applyWallet(json.wallet as MemberWallet);
      void liveResource.load(userId);
      return { ok: true };
    },
    [applyWallet, userId]
  );

  /** Reenvia ao responsável o e-mail com o link da liberação (comprador menor de 18 anos). */
  const resendGuardian = useCallback(async (ticketId: string): Promise<ActionResult> => {
    const { ok, json } = await postJson("/api/live", { action: "resend_parent_email", ticketId });
    if (!ok) return failure(json, "Não foi possível reenviar o e-mail.");
    return { ok: true };
  }, []);

  const submitFounders = useCallback(
    async (form: FormData): Promise<ActionResult> => {
      try {
        const res = await fetch("/api/live/founders", { method: "POST", body: form });
        const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok) return failure(json, "Não foi possível enviar sua startup.");
        if (json.wallet) applyWallet(json.wallet as MemberWallet);
        return { ok: true };
      } catch {
        return { ok: false, error: "Sem internet agora. Confira sua conexão e tente de novo." };
      }
    },
    [applyWallet]
  );

  /** Resumo do pedido calculado no servidor (preço, cupom e regra de idade). */
  const quote = useCallback(async (input: { eventId: string; batchId: string; promoCode?: string }): Promise<QuoteResult> => {
    const { ok, json } = await postJson("/api/live", { action: "quote", ...input });
    if (!ok || !json.quote) return { ok: false, error: typeof json.error === "string" ? json.error : "Não foi possível calcular o valor." };
    return { ok: true, quote: json.quote as TicketQuote };
  }, []);

  return { data, loading, error, reload, reserve, cancel, resendGuardian, submitFounders, quote };
}

export type QuoteResult = { ok: true; quote: TicketQuote } | { ok: false; error: string };

/* -------------------------------------------------------------------------- */
/* Banners da Home (Destaques de imagem)                                       */
/* -------------------------------------------------------------------------- */

const bannerResource = createResource<HomeBanner[]>("/api/reels/banner", (json) => (Array.isArray(json.banners) ? (json.banners as HomeBanner[]) : null));
const NO_BANNERS: HomeBanner[] = [];

/** Banners de parceiros da Home; vazio enquanto carrega ou se não houver nenhum ativo. */
export function useHomeBanners(userId: string): ReadonlyArray<HomeBanner> {
  const resource = useResource(bannerResource, userId);
  useBootTask("banners", !resource.loading && !resource.error, resource.error);
  return resource.data ?? NO_BANNERS;
}

/* Preferência de "ocultar saldo" — conveniência por aparelho. */
const HIDE_KEY = "prx:hide-balance";
const hideListeners = new Set<() => void>();
let memoryHidden = false;

function readHidden(): boolean {
  try {
    const stored = window.localStorage.getItem(HIDE_KEY);
    return stored === null ? memoryHidden : stored === "1";
  } catch {
    return memoryHidden;
  }
}

export function useHiddenBalance(): [boolean, () => void] {
  const hidden = useSyncExternalStore(
    (listener) => {
      hideListeners.add(listener);
      return () => hideListeners.delete(listener);
    },
    readHidden,
    () => false
  );
  const toggle = useCallback(() => {
    memoryHidden = !readHidden();
    try {
      window.localStorage.setItem(HIDE_KEY, memoryHidden ? "1" : "0");
    } catch {
      // sem storage: a preferência vale só nesta sessão
    }
    hideListeners.forEach((listener) => listener());
  }, []);
  return [hidden, toggle];
}
