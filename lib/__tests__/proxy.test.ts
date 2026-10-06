// Hello World
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "../../proxy";

type Outcome = { kind: "next" } | { kind: "rewrite"; to: string } | { kind: "redirect"; to: string };

function route(host: string, path = "/"): Outcome {
  const res = proxy(new NextRequest(`https://${host}${path}`, { headers: { host } }));
  const rewrite = res.headers.get("x-middleware-rewrite");
  if (rewrite) return { kind: "rewrite", to: new URL(rewrite).pathname };
  const location = res.headers.get("location");
  if (location) return { kind: "redirect", to: new URL(location).pathname };
  return { kind: "next" };
}

const rewrite = (to: string): Outcome => ({ kind: "rewrite", to });
const redirect = (to: string): Outcome => ({ kind: "redirect", to });
const next: Outcome = { kind: "next" };

afterEach(() => vi.unstubAllEnvs());

describe("roteamento por domínio", () => {
  it("prx.app.br mostra só o teaser, os documentos legais e a Resenha", () => {
    expect(route("prx.app.br")).toEqual(rewrite("/em-breve"));
    expect(route("www.prx.app.br")).toEqual(rewrite("/em-breve"));
    expect(route("prx.app.br", "/termos")).toEqual(next);
    expect(route("prx.app.br", "/privacidade")).toEqual(next);
    expect(route("prx.app.br", "/resenha/001")).toEqual(next);
    expect(route("prx.app.br", "/resenha/lista/abc")).toEqual(next);
    expect(route("prx.app.br", "/sou-pai")).toEqual(redirect("/"));
    expect(route("prx.app.br", "/login")).toEqual(redirect("/"));
  });

  it("teste.prx.app.br é o aplicativo: a raiz e as páginas públicas, o resto volta para a raiz", () => {
    expect(route("teste.prx.app.br")).toEqual(next);
    expect(route("teste.prx.app.br", "/sou-pai")).toEqual(next);
    expect(route("teste.prx.app.br", "/termos")).toEqual(next);
    expect(route("teste.prx.app.br", "/resenha/lista/abc")).toEqual(next);
    expect(route("teste.prx.app.br", "/qualquer")).toEqual(redirect("/"));
    expect(route("localhost:3100")).toEqual(next);
  });

  it("cada portal serve a sua rota na raiz e manda qualquer outro caminho de volta", () => {
    expect(route("admin.prx.app.br")).toEqual(rewrite("/admin"));
    expect(route("partner.prx.app.br")).toEqual(rewrite("/partner"));
    expect(route("staff.prx.app.br")).toEqual(rewrite("/staff"));
    expect(route("insider.prx.app.br")).toEqual(rewrite("/insider"));
    expect(route("show.prx.app.br")).toEqual(rewrite("/apresentacao"));
    expect(route("admin.prx.app.br", "/membros")).toEqual(redirect("/"));
    expect(route("show.prx.app.br", "/admin")).toEqual(redirect("/"));
    expect(route("admin.localhost:3100")).toEqual(rewrite("/admin"));
  });

  it("os endereços antigos continuam abrindo os portais", () => {
    expect(route("admin.prx.app.br")).toEqual(rewrite("/admin"));
    expect(route("adminng.exemplo.com")).toEqual(rewrite("/admin"));
    expect(route("partner.prx.app.br")).toEqual(rewrite("/partner"));
    expect(route("partnerng.exemplo.com")).toEqual(rewrite("/partner"));
    expect(route("staff.prx.app.br")).toEqual(rewrite("/staff"));
    expect(route("show.prx.app.br")).toEqual(rewrite("/apresentacao"));
  });

  it("API, assets e o callback do OAuth passam em qualquer domínio", () => {
    for (const host of ["prx.app.br", "teste.prx.app.br", "admin.prx.app.br", "show.prx.app.br"]) {
      for (const path of ["/api/waitlist", "/_next/static/chunk.js", "/auth/callback", "/brand/prx-symbol.svg"]) {
        expect(route(host, path)).toEqual(next);
      }
    }
  });

  it("PRX_TEASER_HOSTS acrescenta outros hosts de teaser", () => {
    vi.stubEnv("PRX_TEASER_HOSTS", "preview.exemplo.com, outro.exemplo.com");
    expect(route("preview.exemplo.com")).toEqual(rewrite("/em-breve"));
    expect(route("outro.exemplo.com", "/x")).toEqual(redirect("/"));
    expect(route("teste.prx.app.br")).toEqual(next);
  });
});
