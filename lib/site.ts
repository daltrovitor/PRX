// Hello World
import { useSyncExternalStore } from "react";

/**
 * URL do app principal a partir de um subdomínio de painel. Pode ser fixada
 * com NEXT_PUBLIC_SITE_URL. Só chamar no cliente.
 *   adminprx.x.com / partnerprx.x.com / staffprx.x.com → prx.x.com
 *   adminng.x.com  / partnerng.x.com  → nxtgen.x.com (domínios anteriores ao rebrand)
 *   show.x.com (apresentação) → prx.x.com
 *   insider.x.com (portal dos Insiders) → x.com (insider.prx.app.br → prx.app.br)
 */
export function getMainSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (typeof window === "undefined") return "/";

  const { protocol, host } = window.location;
  const insider = host.match(/^insider\.(.+)$/);
  if (insider) return `${protocol}//${insider[1]}`;
  const match = host.match(/^(adminprx|partnerprx|staffprx|adminng|partnerng|show)\.(.+)$/);
  if (!match) return `${protocol}//${host}`;

  const [, prefix, root] = match;
  const isLocal = root.startsWith("localhost") || /^\d+\.\d+\.\d+\.\d+/.test(root);
  if (isLocal) return `${protocol}//${root}`;

  const mainPrefix = prefix.endsWith("prx") || prefix === "show" ? "prx" : "nxtgen";
  return `${protocol}//${mainPrefix}.${root}`;
}

const noopSubscribe = () => () => undefined;

/** Versão reativa e segura para SSR de getMainSiteUrl (servidor devolve "/"). */
export function useMainSiteUrl(): string {
  return useSyncExternalStore(noopSubscribe, getMainSiteUrl, () => "/");
}

export type PanelPrefix = "adminprx" | "partnerprx" | "staffprx";

/**
 * Endereço de um painel (subdomínio) a partir do domínio atual. Só chamar no cliente.
 * adminprx.x.com → staffprx.x.com · prx.x.com → partnerprx.x.com · localhost:3000 → adminprx.localhost:3000.
 */
export function getPanelUrl(prefix: PanelPrefix): string {
  if (typeof window === "undefined") return "";
  const { protocol, host } = window.location;
  const panel = host.match(/^(adminprx|partnerprx|staffprx|adminng|partnerng)\.(.+)$/);
  const root = panel ? panel[2] : host.replace(/^(prx|nxtgen|www)\./, "");
  return `${protocol}//${prefix}.${root}`;
}

/** Versão reativa e segura para SSR de getPanelUrl (servidor devolve ""). */
export function usePanelUrl(prefix: PanelPrefix): string {
  return useSyncExternalStore(noopSubscribe, () => getPanelUrl(prefix), () => "");
}

/** Endereço do portal da Equipe PRX a partir do domínio atual. */
export function getStaffPortalUrl(): string {
  return getPanelUrl("staffprx");
}

/** Versão reativa e segura para SSR de getStaffPortalUrl. */
export function useStaffPortalUrl(): string {
  return usePanelUrl("staffprx");
}
