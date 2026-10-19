// Hello World
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Notice } from "@/components/app/ui";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { detectPlatform } from "@/lib/pwa-install";

type State =
  | { kind: "loading" }
  | { kind: "unsupported"; reason: string }
  | { kind: "off" }
  | { kind: "on"; endpoint: string }
  | { kind: "blocked" };

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

/**
 * Notificações no celular: com elas, o convite da Resenha, o Pix e as
 * liberações chegam mesmo com o app fechado. No iPhone só funciona com o app
 * instalado na tela de início (iOS 16.4+).
 */
export function PushCard() {
  const { showToast } = useConfirmToast();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [publicKey, setPublicKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      const ios = detectPlatform(navigator.userAgent, navigator.maxTouchPoints) === "ios";
      setState({ kind: "unsupported", reason: ios && !isStandalone() ? "No iPhone, instale o app na tela de início (Compartilhar → Adicionar à Tela de Início) e abra por lá para ativar." : "Este navegador não recebe notificações. Use o Chrome, o Edge ou o app instalado." });
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
  }, [load]);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? { kind: "blocked" } : { kind: "off" });
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = (await registration.pushManager.getSubscription()) ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
      const json = subscription.toJSON();
      await api("POST", { action: "subscribe", subscription: { endpoint: subscription.endpoint, keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" } } });
      setState({ kind: "on", endpoint: subscription.endpoint });
      showToast("success", "Notificações ativadas neste celular.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível ativar.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (state.kind !== "on") return;
    setBusy(true);
    setError(null);
    try {
      const subscription = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
      await subscription?.unsubscribe();
      await api("DELETE", { endpoint: state.endpoint });
      setState({ kind: "off" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível desativar.");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setError(null);
    try {
      await api("POST", { action: "test" });
      showToast("success", "Enviamos um teste. Ele chega em alguns segundos.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar o teste.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="profile-push" className="space-y-4 rounded-3xl glass p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-md">
          <h2 id="profile-push" className="text-lg font-semibold tracking-[-0.02em] text-ink">
            Notificações no celular
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Convites da Resenha, Pix recebido e enviado e liberações chegam aqui mesmo com o app fechado.</p>
        </div>
        {state.kind === "off" && (
          <Button size="sm" onClick={() => void enable()} disabled={busy}>
            {busy ? "Ativando…" : "Ativar"}
          </Button>
        )}
        {state.kind === "on" && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => void test()} disabled={busy}>
              Enviar teste
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void disable()} disabled={busy}>
              Desativar
            </Button>
          </div>
        )}
      </div>
      {state.kind === "on" && <p className="text-sm font-medium text-ink">Ativas neste aparelho.</p>}
      {state.kind === "unsupported" && <Notice tone="neutral">{state.reason}</Notice>}
      {state.kind === "blocked" && <Notice tone="warning">As notificações estão bloqueadas para a PRX neste aparelho. Libere nas configurações do navegador ou do celular e volte aqui.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
    </section>
  );
}
