// Hello World
"use client";

import { useEffect, useState } from "react";

/**
 * QR dinâmico do voucher no app do membro: pede um código novo ao servidor a
 * cada janela de 60 s (e ao voltar para a tela ou à rede). Sem conexão, o
 * código atual continua até expirar; depois disso a tela mostra
 * "indisponível" em vez de um QR vencido que pareceria válido.
 */

export type DynamicQrState = "loading" | "valid" | "expired" | "offline" | "used" | "voucher_expired" | "error";

export interface DynamicQr {
  state: DynamicQrState;
  payload: string | null;
  momentCode: string | null;
  secondsLeft: number;
  period: number;
  error: string | null;
  refresh: () => void;
}

interface Token {
  payload: string;
  momentCode: string;
  validUntil: number;
  period: number;
}

type FetchResult =
  | { kind: "token"; token: Token; skew: number }
  | { kind: "used" }
  | { kind: "expired" }
  | { kind: "error"; message: string }
  | { kind: "offline" };

async function fetchQr(code: string): Promise<FetchResult> {
  try {
    const res = await fetch("/api/pass/qr", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }), cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as {
      state?: string;
      payload?: string;
      momentCode?: string;
      validUntil?: string;
      period?: number;
      serverTime?: string;
      error?: string;
    };
    if (res.ok && data.payload && data.momentCode && data.validUntil) {
      const skew = data.serverTime ? new Date(data.serverTime).getTime() - Date.now() : 0;
      return { kind: "token", skew, token: { payload: data.payload, momentCode: data.momentCode, validUntil: new Date(data.validUntil).getTime(), period: data.period ?? 60 } };
    }
    if (data.state === "used") return { kind: "used" };
    if (data.state === "expired") return { kind: "expired" };
    return { kind: "error", message: data.error || "Não foi possível gerar o QR Code." };
  } catch {
    return { kind: "offline" };
  }
}

interface Snapshot {
  code: string | null;
  token: Token | null;
  state: DynamicQrState;
  error: string | null;
  skew: number;
}

const EMPTY: Snapshot = { code: null, token: null, state: "loading", error: null, skew: 0 };

export function useDynamicPassQr(code: string | null, enabled: boolean): DynamicQr {
  const [snap, setSnap] = useState<Snapshot>(EMPTY);
  const [now, setNow] = useState(() => Date.now());
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!enabled || !code) return;
    let cancelled = false;
    let timer: number | undefined;
    const again = (ms: number) => {
      timer = window.setTimeout(() => setVersion((v) => v + 1), ms);
    };
    fetchQr(code).then((result) => {
      if (cancelled) return;
      setNow(Date.now());
      if (result.kind === "token") {
        setSnap({ code, token: result.token, state: "valid", error: null, skew: result.skew });
        // Renova pouco antes de a janela virar.
        again(Math.max(1000, result.token.validUntil - (Date.now() + result.skew) - 1500));
      } else if (result.kind === "offline") {
        setSnap((s) => (s.code === code ? s : { ...EMPTY, code, state: "offline" }));
        again(5000);
      } else {
        setSnap({ code, token: null, state: result.kind === "used" ? "used" : result.kind === "expired" ? "voucher_expired" : "error", error: result.kind === "error" ? result.message : null, skew: 0 });
      }
    });
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [enabled, code, version]);

  useEffect(() => {
    if (!enabled || !code) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const wake = () => {
      if (document.visibilityState === "visible") setVersion((v) => v + 1);
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    return () => {
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
    };
  }, [enabled, code]);

  const current = snap.code === code ? snap : EMPTY;
  const token = current.token;
  const secondsLeft = token ? Math.max(0, Math.ceil((token.validUntil - (now + current.skew)) / 1000)) : 0;
  const lapsed = current.state === "valid" && token !== null && secondsLeft === 0;
  const state: DynamicQrState = lapsed ? (typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "expired") : current.state;
  const show = state === "valid" && token !== null;

  return {
    state,
    payload: show ? token.payload : null,
    momentCode: show ? token.momentCode : null,
    secondsLeft,
    period: token?.period ?? 60,
    error: current.error,
    refresh: () => setVersion((v) => v + 1),
  };
}
