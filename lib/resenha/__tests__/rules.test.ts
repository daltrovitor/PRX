// Hello World
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderResenhaListEmail } from "@/lib/notifications/templates/resenha-list-email";
import { guestPageUrl, insiderLink, resenhaBaseUrl } from "@/lib/resenha/config";
import { ageAt, editionHeadline, editionInputSchema, editionTitle, insiderCode, insiderInputSchema, requestInputSchema, slugPart } from "@/lib/resenha/types";

afterEach(() => vi.unstubAllEnvs());

describe("nomes da edição", () => {
  it("monta o título e a numeração com o artigo do Host", () => {
    expect(editionTitle({ hostArticle: "da", hostName: "Bia" })).toBe("Resenha da Bia");
    expect(editionTitle({ hostArticle: "do", hostName: "Gabs" })).toBe("Resenha do Gabs");
    expect(editionHeadline({ slug: "001", hostArticle: "da", hostName: "Bia" })).toBe("RESENHA 001 — DA BIA");
  });

  it("o código do link usa o primeiro nome sem acento e um sufixo aleatório", () => {
    expect(slugPart("Júlia")).toBe("julia");
    expect(slugPart("***")).toBe("insider");
    let n = 0;
    const code = insiderCode("Manu Silva", () => n++);
    expect(code).toMatch(/^manu-[a-z0-9]{4}$/);
    expect(insiderCode("João Pedro", () => 1)).toMatch(/^joao-/);
  });
});

describe("idade", () => {
  it("conta anos completos na data da festa", () => {
    const party = new Date("2026-11-14T23:00:00-03:00");
    expect(ageAt("2008-11-14", party)).toBe(18);
    expect(ageAt("2008-11-15", party)).toBe(17);
    expect(ageAt("2000-01-01", party)).toBe(26);
  });
});

describe("pedido de acesso: validação", () => {
  const base = { code: "MANU-7K2Q", name: "  Ana   Souza ", email: " ANA@Exemplo.com ", birthDate: "2000-05-10", consent: true };

  it("normaliza nome, e-mail, código, Instagram e WhatsApp", () => {
    const parsed = requestInputSchema.parse({ ...base, instagram: "@Ana.Souza", whatsapp: "+55 (11) 98888-7777" });
    expect(parsed).toMatchObject({ code: "manu-7k2q", name: "Ana Souza", email: "ana@exemplo.com", instagram: "ana.souza", whatsapp: "11988887777" });
  });

  it("tira marcação do nome (nada de HTML guardado)", () => {
    expect(requestInputSchema.parse({ ...base, name: "<b>Ana</b> Souza" }).name).toBe("bAna/b Souza");
  });

  it("recusa sem o aceite, com nascimento inválido ou futuro e com Instagram ou WhatsApp malformados", () => {
    expect(requestInputSchema.safeParse({ ...base, consent: false }).success).toBe(false);
    expect(requestInputSchema.safeParse({ ...base, birthDate: "2000-13-45" }).success).toBe(false);
    expect(requestInputSchema.safeParse({ ...base, birthDate: "2999-01-01" }).success).toBe(false);
    expect(requestInputSchema.safeParse({ ...base, instagram: "ana souza!" }).success).toBe(false);
    expect(requestInputSchema.safeParse({ ...base, whatsapp: "123" }).success).toBe(false);
    expect(requestInputSchema.safeParse({ ...base, name: "An" }).success).toBe(false);
  });
});

describe("entradas do admin", () => {
  it("edição: Host, artigo e lotação", () => {
    const parsed = editionInputSchema.parse({ hostName: "Bia", startsAt: "2026-11-14T23:00:00-03:00", venue: "Casa", city: "São Paulo, SP", capacity: "300" });
    expect(parsed).toMatchObject({ hostArticle: "da", capacity: 300, endsAt: null, address: "" });
    expect(editionInputSchema.safeParse({ hostName: "B", startsAt: "x", venue: "", city: "" }).success).toBe(false);
  });

  it("Insider: cota de 0 a 500", () => {
    const ok = insiderInputSchema.safeParse({ name: "Manu Silva", email: "MANU@exemplo.com", quota: "10", handle: "@manu" });
    expect(ok.success && ok.data).toMatchObject({ email: "manu@exemplo.com", quota: 10, kind: "insider", mode: "create", handle: "manu" });
    expect(insiderInputSchema.safeParse({ name: "Manu", email: "m@e.com", quota: -1 }).success).toBe(false);
    expect(insiderInputSchema.safeParse({ name: "Manu", email: "m@e.com", quota: 501 }).success).toBe(false);
  });
});

describe("links públicos", () => {
  it("a base é sempre o domínio principal, qualquer que seja o portal de origem", () => {
    for (const host of ["prx.app.br", "insider.prx.app.br", "teste.prx.app.br", "admin.prx.app.br", "partner.prx.app.br", "staff.prx.app.br", "show.prx.app.br"]) {
      expect(resenhaBaseUrl(host)).toBe("https://prx.app.br");
    }
    // endereços antigos (antes de prx.app.br) também caem no domínio principal
    expect(resenhaBaseUrl("adminprx.viraweb.online")).toBe("https://prx.app.br");
    expect(resenhaBaseUrl("prx.viraweb.online")).toBe("https://prx.app.br");
    expect(resenhaBaseUrl(null)).toBe("https://prx.app.br");
    expect(resenhaBaseUrl("evil host/x")).toBe("https://prx.app.br");
    expect(resenhaBaseUrl("127.0.0.1/evil")).toBe("https://prx.app.br");
  });

  it("em desenvolvimento a base é o próprio localhost, sem o rótulo do portal", () => {
    for (const host of ["localhost:3100", "insider.localhost:3100", "admin.localhost:3100", "staff.localhost:3100", "adminprx.localhost:3100"]) {
      expect(resenhaBaseUrl(host)).toBe("http://localhost:3100");
    }
    expect(resenhaBaseUrl("127.0.0.1:3100")).toBe("http://127.0.0.1:3100");
  });

  it("RESENHA_PUBLIC_URL tem prioridade", () => {
    vi.stubEnv("RESENHA_PUBLIC_URL", "https://resenha.exemplo.com/");
    expect(resenhaBaseUrl("insider.prx.app.br")).toBe("https://resenha.exemplo.com");
  });

  it("monta o link do Insider e a página do convidado", () => {
    expect(insiderLink("https://prx.app.br", "001", "manu-7k2q")).toBe("https://prx.app.br/resenha/001?i=manu-7k2q");
    expect(guestPageUrl("https://prx.app.br", "tok")).toBe("https://prx.app.br/resenha/lista/tok");
  });
});

describe("e-mail Você tá na lista", () => {
  const input = {
    name: "Ana Souza",
    headline: "RESENHA 001 — DA BIA",
    title: "Resenha da Bia",
    insiderName: "Manu",
    startsAt: "2026-11-14T23:00:00-03:00",
    venue: "Casa da Bia",
    address: "Rua A, 1",
    city: "São Paulo, SP",
    ticketUrl: "https://prx.app.br/resenha/lista/abc",
    assetsUrl: "https://prx.viraweb.online",
  };

  it("traz quando, onde e o link do ingresso, no HTML e no texto", () => {
    const email = renderResenhaListEmail(input);
    expect(email.subject).toBe("Você tá na lista. Resenha da Bia");
    expect(email.html).toContain("Casa da Bia · Rua A, 1 · São Paulo, SP");
    expect(email.html).toContain('href="https://prx.app.br/resenha/lista/abc"');
    expect(email.text).toContain("Ver meu ingresso: https://prx.app.br/resenha/lista/abc");
    expect(email.text).toContain("sábado, 14 de novembro");
  });

  it("escapa o que vem de fora", () => {
    const email = renderResenhaListEmail({ ...input, insiderName: "<script>alert(1)</script>", venue: 'Casa "X" & <i>' });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain("Casa &quot;X&quot; &amp; &lt;i&gt;");
  });
});
