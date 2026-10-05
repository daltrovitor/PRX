// Hello World
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openSubaccount, applyGeneralApproval } from "@/lib/bank/asaas/onboarding";
import { createProviderCharge, createProviderPixKey, providerPixKeys, removeProviderPixKey } from "@/lib/bank/asaas/cash-in";
import { handleAsaasEvent } from "@/lib/bank/asaas/webhooks";
import { ASAAS_TEST_ENV, USER_ID, fakeAsaas, testDeps } from "./asaas-fakes";

const CREATED = { id: "acc_9", walletId: "wal_9", apiKey: "$aact_hmlg_sub9", accountNumber: { agency: "0001", account: "999", accountDigit: "1" } };

beforeEach(() => {
  for (const [key, value] of Object.entries(ASAAS_TEST_ENV)) vi.stubEnv(key, value);
});
afterEach(() => vi.unstubAllEnvs());

async function activeAccount(routes: Parameters<typeof fakeAsaas>[0]) {
  const fake = fakeAsaas({ "POST /accounts": { body: CREATED }, ...routes });
  const ctx = testDeps(fake.client);
  await openSubaccount(USER_ID, ctx.deps);
  const sub = await ctx.store.getSubaccount(USER_ID);
  await applyGeneralApproval(sub!, "APPROVED", null, ctx.deps);
  return { ...ctx, calls: fake.calls };
}

describe("chaves Pix da subconta", () => {
  it("lista só as chaves válidas do DICT e cria apenas chave aleatória", async () => {
    const keys = { data: [{ id: "k1", key: "a1b2-c3", type: "EVP", status: "ACTIVE" }, { id: "k2", key: "x", type: "CPF", status: "DELETED" }] };
    const { deps, calls } = await activeAccount({ "GET /pix/addressKeys": { body: keys }, "POST /pix/addressKeys": { body: { id: "k3", key: "novo-evp", type: "EVP", status: "AWAITING_ACTIVATION" } } });

    expect(await providerPixKeys(USER_ID, deps)).toEqual([{ id: "k1", type: "random", value: "a1b2-c3", status: "active", createdAt: expect.any(String) }]);
    await expect(createProviderPixKey(USER_ID, "cpf", deps)).rejects.toMatchObject({ status: 422 });
    await expect(createProviderPixKey(USER_ID, "random", deps)).resolves.toMatchObject({ value: "novo-evp", status: "pending_activation" });

    const create = calls.find((c) => c.method === "POST" && c.path === "/pix/addressKeys");
    expect(create?.body).toEqual({ type: "EVP" });
    expect(create?.apiKey).toBe(CREATED.apiKey);
  });

  it("exclui no Pix só a chave que é da própria subconta", async () => {
    const keys = { data: [{ id: "4f1c2a9e-0000-4000-8000-000000000001", key: "a1b2-c3", type: "EVP", status: "ACTIVE" }] };
    const { deps, calls } = await activeAccount({ "GET /pix/addressKeys": { body: keys }, "DELETE /pix/addressKeys/*": { body: { id: keys.data[0].id, status: "AWAITING_DELETION" } } });

    await expect(removeProviderPixKey(USER_ID, "4f1c2a9e-0000-4000-8000-0000000000ff", deps)).rejects.toMatchObject({ status: 404 });
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);

    await removeProviderPixKey(USER_ID, keys.data[0].id, deps);
    const removed = calls.find((c) => c.method === "DELETE");
    expect(removed?.path).toBe(`/pix/addressKeys/${keys.data[0].id}`);
    expect(removed?.apiKey).toBe(CREATED.apiKey);
  });

  it("conta ainda em análise não registra chave no parceiro", async () => {
    const fake = fakeAsaas({ "POST /accounts": { body: CREATED } });
    const { deps } = testDeps(fake.client);
    await openSubaccount(USER_ID, deps);
    await expect(createProviderPixKey(USER_ID, "random", deps)).rejects.toMatchObject({ status: 409 });
  });

  it("aprovação pelo webhook já cria a primeira chave aleatória", async () => {
    const fake = fakeAsaas({ "POST /accounts": { body: CREATED }, "GET /pix/addressKeys": { body: { data: [] } }, "POST /pix/addressKeys": { body: { id: "k1", key: "evp", type: "EVP", status: "ACTIVE" } } });
    const { deps } = testDeps(fake.client);
    await openSubaccount(USER_ID, deps);
    await handleAsaasEvent({ id: "evt_ok", event: "ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED", account: { id: "acc_9" } }, deps);
    expect(fake.calls.some((c) => c.method === "POST" && c.path === "/pix/addressKeys")).toBe(true);
  });
});

describe("cobrança Pix", () => {
  it("cria o cliente titular uma vez, gera a cobrança e guarda o Copia e Cola", async () => {
    const { deps, store, mirror, calls } = await activeAccount({
      "POST /customers": { body: { id: "cus_1" } },
      "POST /payments": (call) => ({ body: { id: `pay_${calls.filter((c) => c.path === "/payments").length}`, status: "PENDING", value: (call.body as { value: number }).value } }),
      "GET /payments/*/pixQrCode": { body: { encodedImage: "iVBOR", payload: "00020126580014br.gov.bcb.pix0136abc", expirationDate: "2026-10-02 23:59:59" } },
    });

    const charge = await createProviderCharge(USER_ID, { amount: 25.5, description: "Rateio" }, deps);
    expect(charge).toMatchObject({ id: "pay_1", amount: 25.5, payload: "00020126580014br.gov.bcb.pix0136abc", paid: false });
    await createProviderCharge(USER_ID, { amount: 10, description: "" }, deps);

    expect(calls.filter((c) => c.path === "/customers")).toHaveLength(1);
    expect(calls.find((c) => c.path === "/customers")?.body).toMatchObject({ name: "Ana Souza", cpfCnpj: "52998224725", notificationDisabled: true });
    const payment = calls.find((c) => c.path === "/payments")?.body as Record<string, unknown>;
    expect(payment).toMatchObject({ customer: "cus_1", billingType: "PIX", value: 25.5, description: "Rateio" });
    expect(payment.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(payment.externalReference).toMatch(/^[0-9a-f-]{36}$/);
    expect((await store.getSubaccount(USER_ID))?.customerId).toBe("cus_1");
    expect(mirror.charges.map((c) => c.providerRef)).toEqual(["pay_2", "pay_1"]);
  });

  it("exige valor", async () => {
    const { deps } = await activeAccount({});
    await expect(createProviderCharge(USER_ID, { amount: null, description: "" }, deps)).rejects.toMatchObject({ status: 422 });
  });
});

describe("Pix recebido (PAYMENT_RECEIVED)", () => {
  it("credita o extrato, marca a cobrança paga e avisa uma vez com o nome do pagador", async () => {
    const { deps, store, mirror } = await activeAccount({ "GET /customers/*": { body: { name: "Bruno Lima" } } });
    await mirror.saveCharge(USER_ID, { amount: 50, description: "Rateio", payload: "000201", providerRef: "pay_77" });
    const event = { id: "evt_pay", event: "PAYMENT_RECEIVED", account: { id: "acc_9" }, payment: { id: "pay_77", value: 50, netValue: 50, billingType: "PIX", customer: "cus_55", description: "Rateio" } };

    await expect(handleAsaasEvent(event, deps)).resolves.toBe("processed");
    await expect(handleAsaasEvent(event, deps)).resolves.toBe("duplicate");

    expect(mirror.transactions).toHaveLength(1);
    expect(mirror.transactions[0]).toMatchObject({ kind: "pix_in", direction: "in", amount: 50, counterparty: "Bruno Lima", providerRef: "pay_77" });
    expect(mirror.charges[0].paidAt).not.toBeNull();
    const notices = (await store.listNotifications(USER_ID, 10)).filter((n) => n.eventType === "PAYMENT_RECEIVED");
    expect(notices).toHaveLength(1);
    expect(notices[0].title).toMatch(/^Pix recebido! R\$\s50,00 de Bruno Lima\.$/);
  });

  it("cobrança paga: o cliente é o próprio titular, então o extrato não mostra o nome dele como pagador", async () => {
    const { deps, store, mirror, calls } = await activeAccount({ "GET /customers/*": { body: { name: "Ana Souza" } } });
    await store.saveSubaccount(USER_ID, { customerId: "cus_holder" });
    const event = { id: "evt_own", event: "PAYMENT_RECEIVED", account: { id: "acc_9" }, payment: { id: "pay_own", value: 30, netValue: 29.01, billingType: "PIX", customer: "cus_holder" } };

    await expect(handleAsaasEvent(event, deps)).resolves.toBe("processed");
    expect(mirror.transactions[0]).toMatchObject({ amount: 29.01, counterparty: "Pix recebido" });
    expect(calls.some((c) => c.path.startsWith("/customers/"))).toBe(false);
  });

  it("ignora cobranças que não são Pix e estorna no PAYMENT_REFUNDED", async () => {
    const { deps, mirror } = await activeAccount({});
    await handleAsaasEvent({ id: "evt_b", event: "PAYMENT_RECEIVED", account: { id: "acc_9" }, payment: { id: "pay_b", value: 10, billingType: "BOLETO" } }, deps);
    expect(mirror.transactions).toHaveLength(0);

    await handleAsaasEvent({ id: "evt_p", event: "PAYMENT_RECEIVED", account: { id: "acc_9" }, payment: { id: "pay_p", value: 10, billingType: "PIX" } }, deps);
    await handleAsaasEvent({ id: "evt_r", event: "PAYMENT_REFUNDED", account: { id: "acc_9" }, payment: { id: "pay_p", value: 10, billingType: "PIX" } }, deps);
    expect(mirror.transactions[0]).toMatchObject({ providerRef: "pay_p", status: "reversed", counterparty: "Pix recebido" });
  });
});
