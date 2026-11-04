// Hello World
import { describe, expect, it } from "vitest";
import { bankActivation, type ActivationInput } from "@/lib/bank/activation";

const base: ActivationInput = { kyc: "approved", bankOnline: true, sandbox: false, provider: "none", accountStatus: "pending_activation" };

describe("etapa da abertura (máquina de estados do servidor)", () => {
  it("formulário só sem abertura ou com a abertura recusada pela PRX", () => {
    expect(bankActivation({ ...base, kyc: "none", provider: null })).toBe("form");
    expect(bankActivation({ ...base, kyc: "rejected", provider: null })).toBe("form");
  });

  it("abertura enviada nunca volta ao formulário vazio", () => {
    // Pendente (responsável, emancipação ou banco desligado) aguarda, sem pedir reenvio.
    expect(bankActivation({ ...base, kyc: "pending", bankOnline: false, provider: null })).toBe("waiting");
    // Aprovada pela PRX com o banco desligado neste deploy: dados salvos, nada a reenviar.
    expect(bankActivation({ ...base, bankOnline: false, provider: null })).toBe("unavailable");
    // Banco ligado mas sem resposta agora: idem.
    expect(bankActivation({ ...base, provider: null })).toBe("unavailable");
    // Criação no banco falhou ou ainda não aconteceu: abre com os dados salvos.
    expect(bankActivation(base)).toBe("ready");
  });

  it("segue a conta no banco parceiro; só a aprovação dele libera a conta", () => {
    expect(bankActivation({ ...base, provider: "provisioning" })).toBe("opening");
    expect(bankActivation({ ...base, provider: "pending_activation" })).toBe("review");
    expect(bankActivation({ ...base, provider: "rejected" })).toBe("rejected");
    expect(bankActivation({ ...base, provider: "blocked" })).toBe("blocked");
    expect(bankActivation({ ...base, provider: "active", accountStatus: "active" })).toBe("active");
    // Conta já liberada continua liberada se o banco não respondeu agora.
    expect(bankActivation({ ...base, provider: null, accountStatus: "active" })).toBe("active");
  });

  it("sandbox não pede abertura", () => {
    expect(bankActivation({ ...base, sandbox: true, kyc: "none", provider: null })).toBe("active");
  });
});
