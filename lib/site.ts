// Hello World
import { useSyncExternalStore } from "react";
import { appHostOf, portalHostOf } from "@/lib/domains";

/**
 * URL do app principal a partir de qualquer host da PRX (mapa em lib/domains.ts). Pode
 * ser fixada com NEXT_PUBLIC_SITE_URL. Só chamar no cliente.
 *   admin.prx.app.br / partner.prx.app.br / staff.prx.app.br / show.prx.app.br → teste.prx.app.br
 *   admin.localhost:3100 → localhost:3100
 */
export function getMainSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (typeof window === "undefined") return "/";

  const { protocol, host } = window.location;
  return `${protocol}//${appHostOf(host)}`;
}

const noopSubscribe = () => () => undefined;

/** Versão reativa e segura para SSR de getMainSiteUrl (servidor devolve "/"). */
export function useMainSiteUrl(): string {
  return useSyncExternalStore(noopSubscribe, getMainSiteUrl, () => "/");
}

export type PanelPrefix = "admin" | "partner" | "staff";

/**
 * Endereço de um painel a partir do host atual. Só chamar no cliente.
 * teste.prx.app.br → staff.prx.app.br · localhost:3000 → admin.localhost:3000.
 */
export function getPanelUrl(prefix: PanelPrefix): string {
  if (typeof window === "undefined") return "";
  const { protocol, host } = window.location;
  return `${protocol}//${portalHostOf(host, prefix)}`;
}

/** Versão reativa e segura para SSR de getPanelUrl (servidor devolve ""). */
export function usePanelUrl(prefix: PanelPrefix): string {
  return useSyncExternalStore(noopSubscribe, () => getPanelUrl(prefix), () => "");
}

/** Endereço do portal da Equipe PRX a partir do domínio atual. */
export function getStaffPortalUrl(): string {
  return getPanelUrl("staff");
}

/** Versão reativa e segura para SSR de getStaffPortalUrl. */
export function useStaffPortalUrl(): string {
  return usePanelUrl("staff");
}
