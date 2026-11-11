// Hello World
"use client";

import { fetchWithTimeout } from "@/lib/client-fetch";

import { useCallback, useEffect, useState } from "react";
import type { MemberResenhaView } from "@/lib/resenha/invites";
import type { MemberResenhaCatalog } from "@/lib/resenha/invite-requests";

const EMPTY_CATALOG: MemberResenhaCatalog = { entries: [], minor: false };

/**
 * Resenhas para as quais o membro foi convidado e o catálogo de Insiders das
 * Resenhas abertas em que ele ainda pode pedir convite.
 */
export function useResenhas(userId: string): { resenhas: MemberResenhaView[]; catalog: MemberResenhaCatalog; loaded: boolean; reload: () => Promise<void> } {
  const [resenhas, setResenhas] = useState<MemberResenhaView[]>([]);
  const [catalog, setCatalog] = useState<MemberResenhaCatalog>(EMPTY_CATALOG);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await fetchWithTimeout("/api/live/resenha", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { resenhas?: MemberResenhaView[]; catalog?: MemberResenhaCatalog };
      if (res.ok && Array.isArray(json.resenhas)) setResenhas(json.resenhas);
      if (res.ok && json.catalog && Array.isArray(json.catalog.entries)) setCatalog(json.catalog);
    } catch {
      // Sem rede: a Resenha some até a próxima tentativa (nunca mostra convite que não existe).
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    void (async () => {
      await reload();
    })();
  }, [userId, reload]);

  return { resenhas, catalog, loaded, reload };
}
