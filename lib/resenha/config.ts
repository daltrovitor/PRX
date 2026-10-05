// Hello World

/**
 * Endereços da Resenha. O link do Insider e a página do convidado ficam no domínio
 * principal (prx.app.br), nunca no de um painel: a base sai do host da requisição
 * (insider.prx.app.br → prx.app.br; insider.localhost:3100 → localhost:3100;
 * adminprx.viraweb.online → prx.viraweb.online, como o resto do app). Em produção,
 * RESENHA_PUBLIC_URL=https://prx.app.br deixa o link igual para o admin e para os Insiders.
 */

export const DEFAULT_RESENHA_URL = "https://prx.app.br";

const stripSlash = (url: string) => url.replace(/\/+$/, "");

function httpOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? stripSlash(url.origin) : null;
  } catch {
    return null;
  }
}

/** Base pública a partir do host (e protocolo) de quem fez a requisição. */
export function resenhaBaseUrl(host?: string | null, protocol?: string | null): string {
  const fixed = httpOrigin(process.env.RESENHA_PUBLIC_URL ?? "");
  if (fixed) return fixed;
  const raw = (host ?? "").trim().toLowerCase();
  if (!raw || !/^[a-z0-9.-]+(:\d{1,5})?$/.test(raw)) return DEFAULT_RESENHA_URL;
  const local = /^(?:[a-z0-9-]+\.)*localhost(?::\d+)?$/.test(raw) || /^\d+\.\d+\.\d+\.\d+/.test(raw);
  // Portal do Insider: o domínio principal é o que vem depois de "insider.". Painéis do admin, parceiro e equipe: "prx." + domínio.
  const name = raw.replace(/^insider\./, "").replace(/^(?:adminprx|partnerprx|staffprx|adminng|partnerng)\.(.+)$/, (_, root: string) => (/^localhost|^\d/.test(root) ? root : `prx.${root}`));
  return `${protocol === "http" || local ? "http" : "https"}://${name}`;
}

export const insiderLink = (base: string, slug: string, code: string) => `${base}/resenha/${slug}?i=${code}`;
export const guestPageUrl = (base: string, token: string) => `${base}/resenha/lista/${token}`;
