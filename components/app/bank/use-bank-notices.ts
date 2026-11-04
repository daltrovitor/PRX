// Hello World
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { reloadBank } from "@/components/app/use-prx-stores";

/**
 * Avisos do PRX BANK vindos dos webhooks do banco parceiro (Pix recebido e enviado,
 * contas pagas, aprovação da conta). Consulta a cada 20 s com o app visível e
 * ao voltar para ele; aviso novo vira toast e atualiza o saldo na hora.
 */

export interface BankNoticeItem {
  id: string;
  eventType: string;
  title: string;
  body: string;
  amount: number | null;
  read: boolean;
  createdAt: string;
}

const POLL_MS = 20_000;
/** Na primeira carga, só vira toast o que acabou de chegar (não o histórico). */
const FRESH_MS = 2 * 60_000;
const FAILURE = new Set(["TRANSFER_FAILED", "TRANSFER_CANCELLED", "BILL_FAILED", "BILL_CANCELLED", "ACCOUNT_STATUS_GENERAL_APPROVAL_REJECTED", "ACCOUNT_STATUS_DOCUMENT_REJECTED"]);

async function fetchNotices(): Promise<BankNoticeItem[] | null> {
  try {
    const res = await fetch("/api/bank/notifications", { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as { notices?: BankNoticeItem[] };
    return Array.isArray(json.notices) ? json.notices : [];
  } catch {
    return null;
  }
}

export function useBankNotices(userId: string): { notices: BankNoticeItem[]; markRead: () => void } {
  const [notices, setNotices] = useState<BankNoticeItem[]>([]);
  const seen = useRef<Set<string> | null>(null);
  const { showToast } = useConfirmToast();

  useEffect(() => {
    let cancelled = false;
    seen.current = null;

    const poll = () => {
      if (document.visibilityState !== "visible") return;
      void fetchNotices().then((list) => {
        if (cancelled || !list) return;
        const first = seen.current === null;
        const known = seen.current ?? new Set<string>();
        const fresh = list.filter((n) => !n.read && !known.has(n.id) && (!first || Date.now() - new Date(n.createdAt).getTime() < FRESH_MS));
        for (const n of fresh.slice(0, 3)) showToast(FAILURE.has(n.eventType) ? "error" : "success", n.body, n.title);
        if (fresh.length > 0) reloadBank(userId);
        seen.current = new Set([...known, ...list.map((n) => n.id)]);
        setNotices(list);
      });
    };

    poll();
    const timer = window.setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [userId, showToast]);

  const markRead = useCallback(() => {
    setNotices((list) => (list.some((n) => !n.read) ? list.map((n) => ({ ...n, read: true })) : list));
    void fetch("/api/bank/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => undefined);
  }, []);

  return { notices, markRead };
}
