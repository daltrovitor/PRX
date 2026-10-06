// Hello World
import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_HOST, APP_URL, SHOW_URL, appHostOf, isLocalHost, isPrxZoneHost, portalHostOf, portalOfHost } from "@/lib/domains";
import { getMainSiteUrl, getPanelUrl } from "@/lib/site";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("mapa de domínios", () => {
  it("endereços públicos em produção", () => {
    expect(APP_HOST).toBe("teste.prx.app.br");
    expect(APP_URL).toBe("https://teste.prx.app.br");
    expect(SHOW_URL).toBe("https://show.prx.app.br");
  });

  it("cada portal é reconhecido pelo primeiro rótulo do host", () => {
    expect(portalOfHost("admin.prx.app.br")).toBe("admin");
    expect(portalOfHost("partner.prx.app.br")).toBe("partner");
    expect(portalOfHost("staff.prx.app.br")).toBe("staff");
    expect(portalOfHost("insider.prx.app.br")).toBe("insider");
    expect(portalOfHost("show.prx.app.br")).toBe("show");
    expect(portalOfHost("ADMIN.PRX.APP.BR")).toBe("admin");
    expect(portalOfHost("staff.localhost:3100")).toBe("staff");
  });

  it("os rótulos antigos continuam roteando os portais", () => {
    expect(portalOfHost("admin.prx.app.br")).toBe("admin");
    expect(portalOfHost("adminng.exemplo.com")).toBe("admin");
    expect(portalOfHost("partnerprx.localhost:3100")).toBe("partner");
    expect(portalOfHost("partnerng.exemplo.com")).toBe("partner");
    expect(portalOfHost("staff.prx.app.br")).toBe("staff");
    expect(portalOfHost("show.prx.app.br")).toBe("show");
  });

  it("o apex, o app e hosts comuns não são portais", () => {
    for (const host of ["prx.app.br", "www.prx.app.br", "teste.prx.app.br", "localhost:3100", "127.0.0.1:3100", "teste.prx.app.br", "administrador.prx.app.br", ""]) {
      expect(portalOfHost(host)).toBeNull();
    }
  });

  it("localhost e IPs são hosts locais", () => {
    for (const host of ["localhost", "localhost:3100", "admin.localhost:3100", "127.0.0.1:3100", "192.168.0.10:3000"]) expect(isLocalHost(host)).toBe(true);
    for (const host of ["prx.app.br", "admin.prx.app.br", "localhost.evil.com", "evil.com:3100"]) expect(isLocalHost(host)).toBe(false);
  });

  it("zona prx.app.br: o apex e todos os subdomínios", () => {
    for (const host of ["prx.app.br", "teste.prx.app.br", "admin.prx.app.br", "prx.app.br:443"]) expect(isPrxZoneHost(host)).toBe(true);
    for (const host of ["app.br", "evilprx.app.br", "prx.app.br.evil.com", "localhost:3100", "teste.prx.app.br"]) expect(isPrxZoneHost(host)).toBe(false);
  });

  it("o host do app: teste.prx.app.br em produção, o próprio localhost em desenvolvimento", () => {
    for (const host of ["prx.app.br", "teste.prx.app.br", "admin.prx.app.br", "show.prx.app.br", "admin.prx.app.br", "teste.prx.app.br"]) {
      expect(appHostOf(host)).toBe("teste.prx.app.br");
    }
    for (const host of ["localhost:3100", "admin.localhost:3100", "insider.localhost:3100", "teste.localhost:3100"]) expect(appHostOf(host)).toBe("localhost:3100");
    expect(appHostOf("127.0.0.1:3100")).toBe("127.0.0.1:3100");
  });

  it("o host de um portal, a partir de qualquer host da PRX", () => {
    expect(portalHostOf("teste.prx.app.br", "staff")).toBe("staff.prx.app.br");
    expect(portalHostOf("admin.prx.app.br", "partner")).toBe("partner.prx.app.br");
    expect(portalHostOf("prx.app.br", "admin")).toBe("admin.prx.app.br");
    expect(portalHostOf("admin.prx.app.br", "staff")).toBe("staff.prx.app.br");
    expect(portalHostOf("localhost:3000", "admin")).toBe("admin.localhost:3000");
    expect(portalHostOf("staff.localhost:3100", "partner")).toBe("partner.localhost:3100");
  });
});

describe("links entre o app e os painéis (lib/site.ts)", () => {
  const at = (protocol: string, host: string) => vi.stubGlobal("window", { location: { protocol, host } });

  it("em produção cada painel aponta para o domínio novo", () => {
    at("https:", "teste.prx.app.br");
    expect(getPanelUrl("admin")).toBe("https://admin.prx.app.br");
    expect(getPanelUrl("partner")).toBe("https://partner.prx.app.br");
    expect(getPanelUrl("staff")).toBe("https://staff.prx.app.br");
    expect(getMainSiteUrl()).toBe("https://teste.prx.app.br");

    for (const host of ["admin.prx.app.br", "partner.prx.app.br", "staff.prx.app.br", "show.prx.app.br"]) {
      at("https:", host);
      expect(getMainSiteUrl()).toBe("https://teste.prx.app.br");
    }
  });

  it("os endereços antigos já levam para o domínio novo", () => {
    at("https:", "admin.prx.app.br");
    expect(getMainSiteUrl()).toBe("https://teste.prx.app.br");
    expect(getPanelUrl("staff")).toBe("https://staff.prx.app.br");
  });

  it("em desenvolvimento tudo fica no localhost", () => {
    at("http:", "admin.localhost:3100");
    expect(getMainSiteUrl()).toBe("http://localhost:3100");
    expect(getPanelUrl("partner")).toBe("http://partner.localhost:3100");
    at("http:", "localhost:3100");
    expect(getPanelUrl("admin")).toBe("http://admin.localhost:3100");
  });

  it("NEXT_PUBLIC_SITE_URL tem prioridade e o servidor devolve valores neutros", () => {
    at("https:", "admin.prx.app.br");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://app.exemplo.com");
    expect(getMainSiteUrl()).toBe("https://app.exemplo.com");
    vi.unstubAllGlobals();
    expect(getPanelUrl("staff")).toBe("");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(getMainSiteUrl()).toBe("/");
  });
});
