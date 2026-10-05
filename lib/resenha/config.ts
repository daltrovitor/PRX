// Hello World
import { PRX_ZONE, appHostOf, isLocalHost } from "@/lib/domains";

/**
 * Endereços da Resenha. O link do Insider e a página do convidado ficam sempre no domínio
 * principal (prx.app.br), nunca no de um painel nem no do app: o teaser deixa /resenha/...
 * passar. Só em desenvolvimento a base sai do host da requisição (insider.localhost:3100 →
 * localhost:3100). RESENHA_PUBLIC_URL=https://prx.app.br fixa o endereço de vez.
 */

export const DEFAULT_RESENHA_URL = `https://${PRX_ZONE}`;

const stripSlash = (url: string) => url.replace(/\/+$/, "");

function httpOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? stripSlash(url.origin) : null;
  } catch {
    return null;
  }
}

/** Base pública: o domínio principal; em desenvolvimento, o localhost de quem fez a requisição (sem o rótulo do portal). */
export function resenhaBaseUrl(host?: string | null): string {
  const fixed = httpOrigin(process.env.RESENHA_PUBLIC_URL ?? "");
  if (fixed) return fixed;
  const raw = (host ?? "").trim().toLowerCase();
  return /^[a-z0-9.-]+(:\d{1,5})?$/.test(raw) && isLocalHost(raw) ? `http://${appHostOf(raw)}` : DEFAULT_RESENHA_URL;
}

export const insiderLink = (base: string, slug: string, code: string) => `${base}/resenha/${slug}?i=${code}`;
export const guestPageUrl = (base: string, token: string) => `${base}/resenha/lista/${token}`;
