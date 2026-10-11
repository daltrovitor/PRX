// Hello World
"use client";

/**
 * Link de divulgação do PRX LIVE: https://<app>/?evento=<id>&cupom=<CÓDIGO>.
 * O link é guardado nesta aba (sobrevive ao login, inclusive com o Google) e
 * sai da barra de endereços; o app abre o evento com o cupom preenchido.
 * O desconto em si é sempre conferido e calculado no servidor.
 */

const KEY = "prx_live_link";

export interface LiveLink {
  eventId: string;
  code: string | null;
}

/** Guarda o link que veio na URL; true quando havia um link agora. */
export function captureLiveLink(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const url = new URL(window.location.href);
    const eventId = url.searchParams.get("evento")?.trim() ?? "";
    if (!eventId) return false;
    const code = url.searchParams.get("cupom")?.trim().toUpperCase().slice(0, 32) ?? "";
    if (/^[\w-]{1,100}$/.test(eventId)) {
      sessionStorage.setItem(KEY, JSON.stringify({ eventId, code: /^[A-Z0-9-]{3,32}$/.test(code) ? code : null } satisfies LiveLink));
    }
    url.searchParams.delete("evento");
    url.searchParams.delete("cupom");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    return true;
  } catch {
    // sem storage: o link só abre o app
    return false;
  }
}

export function peekLiveLink(): LiveLink | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<LiveLink>;
    return typeof value.eventId === "string" ? { eventId: value.eventId, code: typeof value.code === "string" ? value.code : null } : null;
  } catch {
    return null;
  }
}

export function clearLiveLink(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // nada a limpar
  }
}

/** Link para o admin copiar e divulgar. */
export function liveShareLink(appUrl: string, eventId: string, code?: string | null): string {
  const url = new URL(appUrl.endsWith("/") ? appUrl : `${appUrl}/`);
  url.searchParams.set("evento", eventId);
  if (code) url.searchParams.set("cupom", code);
  return url.toString();
}
