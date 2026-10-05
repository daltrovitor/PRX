// Hello World
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { relyingParty } from "@/lib/passkeys/service";

vi.mock("@/lib/passkeys/repository", () => ({ getPasskeyRepository: vi.fn() }));
vi.mock("@/lib/server-secrets", () => ({ getSessionSecret: () => "segredo-de-teste" }));

const at = (host: string, headers: Record<string, string> = {}) => relyingParty(new NextRequest(`https://${host}/api/auth/passkeys/login/options`, { headers: { host, ...headers } }));

afterEach(() => vi.unstubAllEnvs());

describe("RP ID da biometria", () => {
  it("em prx.app.br o RP ID é o domínio, para a biometria sobreviver à troca de subdomínio", () => {
    for (const host of ["teste.prx.app.br", "prx.app.br", "admin.prx.app.br"]) {
      expect(at(host).rpID).toBe("prx.app.br");
    }
    // a origem esperada continua sendo a do host que fez a requisição
    expect(at("teste.prx.app.br").origins).toEqual(["https://teste.prx.app.br"]);
    expect(at("prx.app.br").origins).toEqual(["https://prx.app.br"]);
  });

  it("fora de prx.app.br o RP ID é o próprio host, sem a porta", () => {
    expect(at("localhost:3100", { "x-forwarded-proto": "http" })).toEqual({ rpID: "localhost", origins: ["http://localhost:3100"] });
    expect(at("evil.com").rpID).toBe("evil.com");
    expect(at("prx.app.br.evil.com").rpID).toBe("prx.app.br.evil.com");
  });

  it("o host encaminhado pelo proxy da hospedagem tem prioridade", () => {
    expect(at("interno.vercel.app", { "x-forwarded-host": "teste.prx.app.br", "x-forwarded-proto": "https" })).toEqual({
      rpID: "prx.app.br",
      origins: ["https://teste.prx.app.br"],
    });
  });

  it("PRX_WEBAUTHN_RP_ID e PRX_WEBAUTHN_ORIGINS fixam os valores", () => {
    vi.stubEnv("PRX_WEBAUTHN_RP_ID", "exemplo.com");
    vi.stubEnv("PRX_WEBAUTHN_ORIGINS", "https://a.exemplo.com, https://b.exemplo.com");
    expect(at("teste.prx.app.br")).toEqual({ rpID: "exemplo.com", origins: ["https://a.exemplo.com", "https://b.exemplo.com"] });
  });
});
