// Hello World
import { describe, expect, it } from "vitest";
import { isRegisteredMember } from "@/lib/members";

describe("quem aparece como membro no painel admin", () => {
  it("só com CPF válido: o perfil vazio criado pelo login do Google não conta", () => {
    expect(isRegisteredMember({ role: "user", cpf: null })).toBe(false);
    expect(isRegisteredMember({ role: "user" })).toBe(false);
    expect(isRegisteredMember({ role: "user", cpf: "" })).toBe(false);
    expect(isRegisteredMember({ role: "user", cpf: "52998224725" })).toBe(true);
    expect(isRegisteredMember({ role: "user", cpf: "529.982.247-25" })).toBe(true);
  });

  it("CPF inventado não conta", () => {
    expect(isRegisteredMember({ role: "user", cpf: "11111111111" })).toBe(false);
    expect(isRegisteredMember({ role: "user", cpf: "12345678900" })).toBe(false);
    expect(isRegisteredMember({ role: "user", cpf: "123" })).toBe(false);
  });

  it("Conta Pai e filhos guardam o CPF na identidade de família", () => {
    expect(isRegisteredMember({ role: "user", cpf: null }, "52998224725")).toBe(true);
    expect(isRegisteredMember({ role: "user", cpf: null }, "11111111111")).toBe(false);
    expect(isRegisteredMember({ role: "user", cpf: null }, null)).toBe(false);
  });

  it("contas de equipe aparecem sem CPF", () => {
    for (const role of ["admin", "partner", "staff"]) expect(isRegisteredMember({ role, cpf: null })).toBe(true);
  });
});
