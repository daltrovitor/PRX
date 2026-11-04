// Hello World
import { describe, expect, it } from "vitest";
import { REMEMBER_SESSION_SECONDS, createSessionToken, issuedBeforeRevocation, verifySessionToken, type StoredUser } from "@/lib/auth";

const USER: StoredUser = {
  id: "3b1c1e0e-0000-4000-8000-000000000001",
  email: "pessoa@exemplo.com",
  fullName: "Pessoa Teste",
  passwordHash: "",
  salt: "",
  role: "user",
  prxScore: 250,
  prxLevel: 1,
  avatarUrl: "",
  walletBalance: 0,
  emailConfirmed: true,
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("sessão: vida do cookie (pentest H5)", () => {
  it("'lembrar de mim' dura 14 dias, não 365", () => {
    expect(REMEMBER_SESSION_SECONDS).toBe(14 * 24 * 60 * 60);
    const { valid, payload } = verifySessionToken(createSessionToken(USER, REMEMBER_SESSION_SECONDS));
    expect(valid).toBe(true);
    expect(payload!.exp! - payload!.iat!).toBe(REMEMBER_SESSION_SECONDS);
  });
});

describe("sessão: revogação central (pentest H5)", () => {
  const cutoff = "2026-11-05T12:00:10.500Z";
  const cutoffSeconds = Math.floor(new Date(cutoff).getTime() / 1000);

  it("sem carimbo no perfil, nada é revogado", () => {
    expect(issuedBeforeRevocation(cutoffSeconds - 1000, null)).toBe(false);
    expect(issuedBeforeRevocation(cutoffSeconds - 1000, undefined)).toBe(false);
  });

  it("token emitido antes do carimbo é revogado", () => {
    expect(issuedBeforeRevocation(cutoffSeconds - 1, cutoff)).toBe(true);
    expect(issuedBeforeRevocation(undefined, cutoff)).toBe(true);
  });

  it("login novo logo depois de revogar vale (mesmo segundo ou depois)", () => {
    expect(issuedBeforeRevocation(cutoffSeconds, cutoff)).toBe(false);
    expect(issuedBeforeRevocation(cutoffSeconds + 60, cutoff)).toBe(false);
  });

  it("carimbo ilegível não derruba ninguém", () => {
    expect(issuedBeforeRevocation(cutoffSeconds - 1000, "lixo")).toBe(false);
  });
});

describe("verifySessionToken", () => {
  it("assinatura de tamanho diferente é recusada sem lançar exceção", () => {
    const [header, payload] = createSessionToken(USER).split(".");
    expect(verifySessionToken(`${header}.${payload}.curta`)).toEqual({ valid: false });
    expect(verifySessionToken(`${header}.${payload}.${"a".repeat(200)}`)).toEqual({ valid: false });
  });

  it("payload adulterado é recusado", () => {
    const [header, , signature] = createSessionToken(USER).split(".");
    const forged = Buffer.from(JSON.stringify({ sub: USER.id, email: USER.email, role: "admin", exp: 9999999999 })).toString("base64url");
    expect(verifySessionToken(`${header}.${forged}.${signature}`).valid).toBe(false);
  });
});
