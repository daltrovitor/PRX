// Hello World
import { NextRequest, NextResponse } from "next/server";
import { PORTAL_ROUTES, PRX_ZONE, portalOfHost } from "./lib/domains";

/**
 * Roteamento por subdomínio (o mapa completo está em lib/domains.ts).
 *   admin.<domínio>   → /admin        (painel administrativo)
 *   partner.<domínio> → /partner      (portal do parceiro)
 *   staff.<domínio>   → /staff        (Equipe PRX: portaria de eventos e balcão)
 *   insider.<domínio> → /insider      (portal dos Insiders da Resenha: liberam os pedidos do próprio link)
 *   show.<domínio>    → /apresentacao (apresentação do ecossistema)
 * Os rótulos antigos (adminprx., partnerprx., staffprx., adminng., partnerng.)
 * continuam aceitos enquanto o DNS é migrado.
 *
 * prx.app.br (e www.) → /em-breve (teaser de lançamento com a Lista VIP).
 * O app (cadastro, login, tudo) é o domínio principal, teste.prx.app.br: ali o app é só "/".
 * /teste (e o atalho /showcase) é a vitrine aberta da identidade Obsidian.
 * /resenha/... (link do Insider e página do convidado) é público em qualquer domínio, inclusive no teaser.
 * Outros hosts de teaser podem ser adicionados em PRX_TEASER_HOSTS (vírgula).
 */

/** Páginas públicas com rota própria no domínio principal (o app continua sendo só "/"). */
const PUBLIC_PAGES = new Set(["/termos", "/termos-qrcode", "/privacidade", "/em-breve", "/sou-pai", "/teste", "/showcase"]);
/** No domínio de teaser, só o teaser e os documentos legais. */
const TEASER_PAGES = new Set(["/termos", "/termos-qrcode", "/privacidade"]);
/** Páginas públicas com subcaminhos: a Resenha (/resenha/001 e /resenha/lista/<token>) e a Autorização de Menores (/autorizacao/<token>). */
const PUBLIC_PREFIXES = ["/resenha/", "/autorizacao/"];
const isPublicPrefix = (pathname: string) => PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));

function isTeaserHost(host: string): boolean {
  const name = host.split(":")[0];
  const extra = (process.env.PRX_TEASER_HOSTS || "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return name === PRX_ZONE || name === `www.${PRX_ZONE}` || extra.includes(name);
}

export function proxy(req: NextRequest) {
  const host = (req.headers.get("host") || "").toLowerCase();
  const { pathname } = req.nextUrl;

  // Assets estáticos, rotas internas, API e callback OAuth passam direto.
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/auth/callback") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const portal = portalOfHost(host);
  const url = req.nextUrl.clone();

  if (!portal && isTeaserHost(host)) {
    if (pathname === "/" || pathname === "") {
      url.pathname = "/em-breve";
      return NextResponse.rewrite(url);
    }
    if (TEASER_PAGES.has(pathname) || isPublicPrefix(pathname)) return NextResponse.next();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  if (portal) {
    if (pathname === "/" || pathname === "") {
      url.pathname = PORTAL_ROUTES[portal];
      return NextResponse.rewrite(url);
    }
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Domínio principal: o app é uma única rota; qualquer caminho digitado volta para "/".
  // Exceção: páginas públicas (legais, teaser, Sou Pai e a vitrine /teste).
  if (PUBLIC_PAGES.has(pathname) || isPublicPrefix(pathname)) return NextResponse.next();
  if (pathname !== "/" && pathname !== "") {
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
