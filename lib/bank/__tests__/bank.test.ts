// Hello World
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pixKeyInputSchema } from "@/lib/bank/service";
import { filterTransactions, summarize, type BankTransaction } from "@/lib/prx/bank";

describe("pré-cadastro de chave Pix", () => {
  it("normaliza CPF, e-mail e celular", () => {
    expect(pixKeyInputSchema.parse({ type: "cpf", value: "529.982.247-25" })).toEqual({ type: "cpf", value: "52998224725" });
    expect(pixKeyInputSchema.parse({ type: "email", value: " Ana@PRX.dev " })).toEqual({ type: "email", value: "ana@prx.dev" });
    expect(pixKeyInputSchema.parse({ type: "phone", value: "(11) 98765-4321" })).toEqual({ type: "phone", value: "+5511987654321" });
    expect(pixKeyInputSchema.parse({ type: "phone", value: "+55 11 98765-4321" })).toEqual({ type: "phone", value: "+5511987654321" });
  });

  it("gera a chave aleatória no servidor, ignorando o que vier do cliente", () => {
    const parsed = pixKeyInputSchema.parse({ type: "random", value: "qualquer-coisa" });
    expect(parsed.value).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("recusa CPF inválido, e-mail malformado e celular curto", () => {
    expect(pixKeyInputSchema.safeParse({ type: "cpf", value: "111.111.111-11" }).success).toBe(false);
    expect(pixKeyInputSchema.safeParse({ type: "email", value: "ana@" }).success).toBe(false);
    expect(pixKeyInputSchema.safeParse({ type: "phone", value: "98765" }).success).toBe(false);
    expect(pixKeyInputSchema.safeParse({ type: "cnpj", value: "11222333000181" }).success).toBe(false);
  });
});

describe("extrato", () => {
  const now = Date.parse("2026-09-26T12:00:00Z");
  const tx = (id: string, direction: "in" | "out", amount: number, daysAgo: number): BankTransaction => ({
    id,
    kind: direction === "in" ? "pix_in" : "pix_out",
    direction,
    amount,
    counterparty: "",
    description: "",
    createdAt: new Date(now - daysAgo * 86_400_000).toISOString(),
  });

  it("conta nova: extrato vazio soma zero", () => {
    expect(summarize(filterTransactions([], 30, "all", now))).toEqual({ income: 0, outcome: 0 });
  });

  it("filtra por período e direção e soma sem erro de arredondamento", () => {
    const list = [tx("a", "in", 0.1, 1), tx("b", "in", 0.2, 2), tx("c", "out", 10, 40)];
    expect(summarize(filterTransactions(list, 30, "all", now))).toEqual({ income: 0.3, outcome: 0 });
    expect(filterTransactions(list, 90, "out", now).map((t) => t.id)).toEqual(["c"]);
  });
});

describe("modo sandbox e saldo admin", () => {
  const testUserId = "user-sandbox-admin-test-01";
  const origBankProvider = process.env.BANK_PROVIDER;
  const origBaasMode = process.env.PRX_BAAS_MODE;

  beforeEach(() => {
    process.env.BANK_PROVIDER = "sandbox";
    process.env.PRX_BAAS_MODE = "sandbox";
  });

  afterEach(() => {
    process.env.BANK_PROVIDER = origBankProvider;
    process.env.PRX_BAAS_MODE = origBaasMode;
  });

  it("conta em sandbox nasce ativa com agência, número, cartão virtual e KYC aprovado", async () => {
    const { accountView } = await import("@/lib/bank/service");
    const view = await accountView(testUserId);
    expect(view.status).toBe("active");
    expect(view.agency).toBe("0001");
    expect(view.virtualCard).toBeTruthy();
    expect(view.virtualCard?.last4).toMatch(/^\d{4}$/);
    expect(view.kyc.status).toBe("approved");
    expect(view.provider).toBeNull();
  });

  it("ninguém cria saldo: sem dinheiro na conta o Pix do sandbox é recusado", async () => {
    const repository = await import("@/lib/bank/repository");
    const { sendPix } = await import("@/lib/bank/service");
    expect("setAdminBankBalance" in repository).toBe(false);
    await expect(sendPix(testUserId, { key: "teste@prx.dev", amount: 50, description: "Teste", recipientName: "Parceiro Teste" })).rejects.toThrow(/Saldo insuficiente/);
  });

  it("produção do banco parceiro desliga o sandbox mesmo com PRX_BAAS_MODE=sandbox esquecido", async () => {
    const origEnv = process.env.BANK_ENVIRONMENT;
    process.env.BANK_ENVIRONMENT = "production";
    try {
      const { isSandboxMode } = await import("@/lib/bank/repository");
      const { bankKycState } = await import("@/lib/kyc/guards");
      expect(isSandboxMode()).toBe(false);
      expect((await bankKycState("user-prod-no-kyc")).status).toBe("none");
    } finally {
      if (origEnv === undefined) delete process.env.BANK_ENVIRONMENT;
      else process.env.BANK_ENVIRONMENT = origEnv;
    }
  });
});
