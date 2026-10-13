// Hello World
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bankActivation, type ActivationInput } from "@/lib/bank/activation";
import { withAsaasAudit } from "@/lib/asaas/audit";
import { setBankLogSink } from "@/lib/asaas/log";
import { openSubaccount } from "@/lib/bank/asaas/onboarding";
import { deferAsaasEvent, handleAsaasEvent, reprocessPendingWebhooks } from "@/lib/bank/asaas/webhooks";
import { validateWithdraw } from "@/lib/bank/asaas/withdraw-validation";
import { MemoryAsaasBankStore } from "@/lib/bank/asaas/store-memory";
import { ASAAS_TEST_ENV, USER_ID, fakeAsaas, testDeps } from "./asaas-fakes";

beforeEach(() => {
  for (const [key, value] of Object.entries(ASAAS_TEST_ENV)) vi.stubEnv(key, value);
});
afterEach(() => {
  vi.unstubAllEnvs();
  setBankLogSink(null);
});

const base: ActivationInput = { kyc: "approved", bankOnline: true, sandbox: false, provider: "none", accountStatus: "pending_activation" };

describe("etapa da abertura (máquina de estados do servidor)", () => {
  it("formulário só sem abertura ou com a abertura recusada pelo PRX", () => {
    expect(bankActivation({ ...base, kyc: "none", provider: null })).toBe("form");
    expect(bankActivation({ ...base, kyc: "rejected", provider: null })).toBe("form");
  });

  it("abertura enviada nunca volta ao formulário vazio", () => {
    // Pendente (responsável, emancipação ou banco desligado) aguarda, sem pedir reenvio.
    expect(bankActivation({ ...base, kyc: "pending", bankOnline: false, provider: null })).toBe("waiting");
    // Aprovada pelo PRX com o banco desligado neste deploy: dados salvos, nada a reenviar.
    expect(bankActivation({ ...base, bankOnline: false, provider: null })).toBe("unavailable");
    // Banco ligado mas sem resposta agora: idem.
    expect(bankActivation({ ...base, provider: null })).toBe("unavailable");
    // Criação no banco falhou ou ainda não aconteceu: abre com os dados salvos.
    expect(bankActivation(base)).toBe("ready");
  });

  it("segue a subconta do banco parceiro; só a aprovação dele libera a conta", () => {
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

describe("webhook com o Asaas desligado no deploy", () => {
  const event = { id: "evt_def", event: "ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED", account: { id: "acc_def" } };

  it("grava o evento (sem efeito) e processa quando a chave volta, sem repetir", async () => {
    const { client } = fakeAsaas({
      "POST /accounts": { body: { id: "acc_def", walletId: "wal_def", apiKey: "$aact_hmlg_sub", accountNumber: { agency: "0001", account: "777", accountDigit: "1" } } },
      "GET /myAccount/status": { body: { general: "APPROVED", documentation: "APPROVED", commercialInfo: "APPROVED", bankAccountInfo: "APPROVED" } },
      "GET /pix/addressKeys": { body: { data: [] } },
      "POST /pix/addressKeys": { body: { id: "k1", key: "evp", type: "EVP", status: "ACTIVE" } },
    });
    const { deps, store } = testDeps(client);
    await openSubaccount(USER_ID, deps);

    await expect(deferAsaasEvent(event, store)).resolves.toBe("deferred");
    // O Asaas reenvia (at least once): continua gravado uma vez só.
    await expect(deferAsaasEvent(event, store)).resolves.toBe("deferred");
    expect((await store.getSubaccount(USER_ID))?.status).toBe("pending_activation");

    // Chave de volta: a conciliação processa o evento guardado e a conta é aprovada (conferida no Asaas).
    const report = await reprocessPendingWebhooks({ ...deps, now: () => new Date(Date.now() + 120_000) });
    expect(report).toMatchObject({ checked: 1, processed: 1, failed: 0 });
    expect((await store.getSubaccount(USER_ID))?.status).toBe("active");
    await expect(handleAsaasEvent(event, deps)).resolves.toBe("duplicate");
  });

  it("validação de saque só lê os pedidos do PRX: funciona sem o cliente do Asaas", async () => {
    const store = new MemoryAsaasBankStore();
    await expect(validateWithdraw({ type: "TRANSFER", transfer: { id: "tra_x", value: 10 } }, { store, now: () => new Date() }, async () => undefined)).resolves.toEqual({
      status: "REFUSED",
      refuseReason: "Operação não encontrada no PRX.",
    });
  });
});

describe("logs estruturados das chamadas ao Asaas", () => {
  it("uma linha JSON por chamada, com correlação, endpoint, status e tempo, sem a chave", async () => {
    const lines: string[] = [];
    setBankLogSink((_level, line) => lines.push(line));
    const { client } = fakeAsaas({ "GET /myAccount/status": { status: 401, body: { errors: [{ code: "invalid_access_token", description: "Chave $aact_hmlg_master inválida" }] } } });

    await withAsaasAudit({ userId: USER_ID, correlationId: "corr-123" }, () => client.get("/myAccount/status").catch(() => null));

    const entry = JSON.parse(lines.at(-1)!) as Record<string, unknown>;
    expect(entry).toMatchObject({
      scope: "prx-bank",
      event: "asaas.request",
      level: "error",
      correlationId: "corr-123",
      step: "account.status",
      method: "GET",
      endpoint: "/v3/myAccount/status",
      httpStatus: 401,
      outcome: "http_error",
      errorCode: "invalid_access_token",
      userId: USER_ID,
      environment: "sandbox",
    });
    expect(typeof entry.durationMs).toBe("number");
    expect(lines.join("\n")).not.toContain("$aact_hmlg_master");
  });
});
