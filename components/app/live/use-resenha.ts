// Hello World
"use client";

import { useCallback, useEffect, useState } from "react";
import type { MemberResenhaView } from "@/lib/resenha/invites";

/**
 * Resenhas para as quais o membro foi convidado. Vazio para quem não tem
 * convite: aí a Resenha simplesmente não aparece no app.
 */
export function useResenhas(userId: string): { resenhas: MemberResenhaView[]; loaded: boolean; reload: () => Promise<void> } {
  const [resenhas, setResenhas] = useState<MemberResenhaView[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/live/resenha", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { resenhas?: MemberResenhaView[] };
      if (res.ok && Array.isArray(json.resenhas)) setResenhas(json.resenhas);
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

  return { resenhas, loaded, reload };
}
