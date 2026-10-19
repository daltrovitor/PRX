// Hello World
"use client";

import { useCallback, useEffect, useState } from "react";
import { detectPlatform } from "@/lib/pwa-install";

/**
 * Estado das notificações no celular neste aparelho, compartilhado entre o
 * cartão do Perfil, o banner da Home e o pop-up: ativar em um atualiza os outros.
 */

export type PushState =
  | { kind: "loading" }
  | { kind: "unsupported"; reason: string }
  | { kind: "off" }
  | { kind: "on"; endpoint: string }
  | { kind: "blocked" };

const CHANGED = "prx:push-changed";

/** Chave VAPID (base64url) no formato que o PushManager pede. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = `${base64url}${"=".repeat((4 - (base64url.length % 4)) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

async function api<T>(method: "GET" | "POST" | "DELETE", body?: unknown): Promise<T> {
  const res = await fetch("/api/push", { method, cache: "no-store", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error || "Não foi possível falar com a PRX agora.");
  return json;
}

export function usePush() {
  const [state, setState] = useState<PushState>({ kind: "loading" });
  const [publicKey, setPublicKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      const ios = detectPlatform(navigator.userAgent, navigator.maxTouchPoints) === "ios";
      setState({
        kind: "unsupported",
        reason: ios && !isStandalone() ? "No iPhone, instale o app na tela de início (Compartilhar → Adicionar à Tela de Início) e abra por lá para ativar." : "Este navegador não recebe notificações. Use o Chrome, o Edge ou o app instalado.",
      });
      return;
    }
    try {
      const info = await api<{ configured: boolean; publicKey: string }>("GET");
      if (!info.configured || !info.publicKey) return setState({ kind: "unsupported", reason: "As notificações no celular estão sendo ativadas pela PRX. Volte aqui em breve." });
      setPublicKey(info.publicKey);
      if (Notification.permission === "denied") return setState({ kind: "blocked" });
      const registration = await navigator.serviceWorker.ready;
      const current = await registration.pushManager.getSubscription();
      setState(current ? { kind: "on", endpoint: current.endpoint } : { kind: "off" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sem internet agora.");
      setState({ kind: "off" });
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
    const onChange = () => void load();
    window.addEventListener(CHANGED, onChange);
    return () => window.removeEventListener(CHANGED, onChange);
  }, [load]);

  /** Precisa vir de um toque (o iPhone e o Chrome exigem um gesto para pedir permissão). */
  const enable = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? { kind: "blocked" } : { kind: "off" });
        return false;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = (await registration.pushManager.getSubscription()) ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
      const json = subscription.toJSON();
      await api("POST", { action: "subscribe", subscription: { endpoint: subscription.endpoint, keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" } } });
      setState({ kind: "on", endpoint: subscription.endpoint });
      window.dispatchEvent(new Event(CHANGED));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível ativar.");
      return false;
    } finally {
      setBusy(false);
    }
  }, [publicKey]);

  const disable = useCallback(async () => {
    if (state.kind !== "on") return;
    setBusy(true);
    setError(null);
    try {
      const subscription = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
      await subscription?.unsubscribe();
      await api("DELETE", { endpoint: state.endpoint });
      setState({ kind: "off" });
      window.dispatchEvent(new Event(CHANGED));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível desativar.");
    } finally {
      setBusy(false);
    }
  }, [state]);

  const test = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      await api("POST", { action: "test" });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar o teste.");
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, error, enable, disable, test };
}

/* Lembrete dispensado (banner e pop-up): volta depois de alguns dias. */

export function dismissedRecently(key: string, days: number): boolean {
  try {
    const at = Number(localStorage.getItem(key) ?? 0);
    return at > 0 && Date.now() - at < days * 86_400_000;
  } catch {
    return false;
  }
}

export function rememberDismiss(key: string): void {
  try {
    localStorage.setItem(key, String(Date.now()));
  } catch {
    // Navegação privada: o lembrete volta na próxima visita.
  }
}
