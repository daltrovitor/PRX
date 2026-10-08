// Hello World
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decryptSecret } from "@/lib/asaas/secrets";
import { ACCOUNT_OPEN_RETRY, completeAsaasSandboxChecklist, currentSubaccount, ensureAsaasCustomerAndAccount, openSubaccount, subaccountView } from "@/lib/bank/asaas/onboarding";
import { reconcileLegacyAccount } from "@/lib/bank/asaas/legacy";
import { forwardKycDocuments, uploadSubaccountDocument } from "@/lib/bank/asaas/documents";
import { handleAsaasEvent } from "@/lib/bank/asaas/webhooks";
import { AsaasClient } from "@/lib/asaas/client";
import { ASAAS_TEST_ENV, USER_ID, approvedKyc, fakeAsaas, testDeps } from "./asaas-fakes";

const CREATED = { id: "acc_123", walletId: "wal_123", apiKey: "$aact_hmlg_subconta_secreta", accountNumber: { agency: "0001", account: "123456", accountDigit: "7" } };

beforeEach(() => {
  for (const [key, value] of Object.entries(ASAAS_TEST_ENV)) vi.stubEnv(key, value);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("abertura da subconta no Asaas", () => {
  it("envia os dados do KYC, registra o webhook PRX e guarda a apiKey só cifrada", async () => {
    const { client, calls } = fakeAsaas({ "POST /accounts": { body: CREATED } });
    const { deps, store, mirror } = testDeps(client);

    const view = await openSubaccount(USER_ID, deps);
    expect(view).toEqual({ state: "pending_activation", kycStatus: "PENDING", rejectReason: null });

    const body = calls[0].body as Record<string, unknown> & { webhooks: Array<Record<string, unknown>> };
    expect(calls[0].apiKey).toBe("$aact_hmlg_master");
    expect(body).toMatchObject({
      name: "Ana Souza",
      email: "ana@prx.dev",
      cpfCnpj: "52998224725",
      birthDate: "2000-05-10",
      mobilePhone: "11987654321",
      incomeValue: 4500,
      address: "Avenida Paulista",
      addressNumber: "1000",
      complement: "Apto 5",
      province: "Bela Vista",
      postalCode: "01310100",
    });
    expect(body.webhooks[0]).toMatchObject({ url: ASAAS_TEST_ENV.ASAAS_WEBHOOK_URL_EVENTS, authToken: ASAAS_TEST_ENV.ASAAS_WEBHOOK_AUTH_TOKEN, email: "suporte@prx.app.br", enabled: true, apiVersion: 3 });
    expect(body.webhooks[0].events).toContain("ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED");

    const sub = await store.getSubaccount(USER_ID);
    expect(sub?.apiKeySealed).not.toContain("aact");
    expect(decryptSecret(sub!.apiKeySealed!)).toBe(CREATED.apiKey);
    expect(sub).toMatchObject({ asaasAccountId: "acc_123", walletId: "wal_123", agency: "0001", accountNumber: "123456-7", provisioningStartedAt: null });
    expect(mirror.accounts.get(USER_ID)).toMatchObject({ providerAccountId: "acc_123", status: "pending_activation" });

    // Idempotente: não abre uma segunda conta.
    await openSubaccount(USER_ID, deps);
    expect(calls).toHaveLength(1);
  });

  it("sem KYC aprovado não chama o Asaas", async () => {
    const { client, calls } = fakeAsaas({ "POST /accounts": { body: CREATED } });
    const { deps } = testDeps(client, approvedKyc({ status: "pending" }));
    await expect(openSubaccount(USER_ID, deps)).rejects.toMatchObject({ status: 403 });
    const none = testDeps(client, null);
    await expect(openSubaccount(USER_ID, none.deps)).rejects.toMatchObject({ status: 403 });
    expect(calls).toHaveLength(0);
  });

  it("sem token ou URL do webhook configurados não abre conta", async () => {
    vi.stubEnv("ASAAS_WEBHOOK_AUTH_TOKEN", "");
    const { client, calls } = fakeAsaas({ "POST /accounts": { body: CREATED } });
    await expect(openSubaccount(USER_ID, testDeps(client).deps)).rejects.toMatchObject({ status: 503 });
    expect(calls).toHaveLength(0);
  });

  it("recusa do Asaas libera para tentar de novo: o membro vê mensagem genérica, o admin vê o motivo", async () => {
    let attempt = 0;
    const { client } = fakeAsaas({
      "POST /accounts": () => (++attempt === 1 ? { status: 400, body: { errors: [{ code: "invalid_email", description: "O e-mail informado já está em uso." }] } } : { body: CREATED }),
    });
    const { deps, store } = testDeps(client);
    await expect(openSubaccount(USER_ID, deps)).rejects.toMatchObject({ status: 503, message: ACCOUNT_OPEN_RETRY });
    await expect(openSubaccount(USER_ID, deps)).resolves.toMatchObject({ state: "pending_activation" });

    expect(store.provisioningLog()).toMatchObject([
      { userId: USER_ID, step: "account", outcome: "failed", asaasAccountId: null, detail: "Asaas 400 invalid_email: O e-mail informado já está em uso." },
      { userId: USER_ID, step: "account", outcome: "sent", asaasAccountId: "acc_123" },
    ]);
  });

  it("registra para o admin quando o PRX nem envia (cadastro não aprovado)", async () => {
    const { client } = fakeAsaas({ "POST /accounts": { body: CREATED } });
    const { deps, store } = testDeps(client, approvedKyc({ status: "pending" }));
    await expect(openSubaccount(USER_ID, deps)).rejects.toMatchObject({ status: 403 });
    expect(store.provisioningLog()).toMatchObject([{ step: "account", outcome: "blocked", asaasAccountId: null }]);
  });

  it("resultado incerto mantém a trava: nada de conta dupla", async () => {
    const { client, calls } = fakeAsaas({ "POST /accounts": { status: 502 } });
    const { deps, store } = testDeps(client);
    await expect(openSubaccount(USER_ID, deps)).rejects.toMatchObject({ status: 503 });
    await expect(openSubaccount(USER_ID, deps)).rejects.toMatchObject({ status: 409 });
    expect(calls).toHaveLength(1);
    expect(subaccountView(await store.getSubaccount(USER_ID)).state).toBe("provisioning");
  });
});

describe("webhook de aprovação da conta", () => {
  async function opened() {
    const fake = fakeAsaas({ "POST /accounts": { body: CREATED } });
    const ctx = testDeps(fake.client);
    await openSubaccount(USER_ID, ctx.deps);
    return ctx;
  }

  it("aprovação ativa a conta e avisa o membro uma única vez", async () => {
    const { deps, store, mirror } = await opened();
    const event = { id: "evt_1", event: "ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED", account: { id: "acc_123" } };
    await expect(handleAsaasEvent(event, deps)).resolves.toBe("processed");
    await expect(handleAsaasEvent(event, deps)).resolves.toBe("duplicate");
    await expect(handleAsaasEvent({ ...event, id: "evt_2" }, deps)).resolves.toBe("processed");

    expect(await store.getSubaccount(USER_ID)).toMatchObject({ status: "active", kycStatus: "APPROVED" });
    expect(mirror.accounts.get(USER_ID)).toMatchObject({ status: "active", activatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) });
    const notices = await store.listNotifications(USER_ID, 10);
    expect(notices).toHaveLength(1);
    expect(notices[0].title).toBe("Sua conta bancária foi aprovada! 🎉");
  });

  it("reprovação guarda o motivo e pede novo envio", async () => {
    const { deps, store } = await opened();
    await handleAsaasEvent({ id: "evt_r", event: "ACCOUNT_STATUS_GENERAL_APPROVAL_REJECTED", account: { id: "acc_123" }, accountStatus: { rejectReason: "Selfie ilegível" } }, deps);
    expect(await store.getSubaccount(USER_ID)).toMatchObject({ status: "rejected", kycStatus: "REJECTED", rejectReason: "Selfie ilegível" });
    const [notice] = await store.listNotifications(USER_ID, 10);
    expect(notice.title).toBe("Atenção aos seus documentos");
    expect(notice.body).toContain("Selfie ilegível");
  });

  it("ignora eventos de contas que o PRX não conhece", async () => {
    const { deps, store } = await opened();
    await expect(handleAsaasEvent({ id: "evt_x", event: "ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED", account: { id: "acc_outra" } }, deps)).resolves.toBe("ignored");
    expect((await store.getSubaccount(USER_ID))?.status).toBe("pending_activation");
  });
});

describe("menores de idade e emancipação", () => {
  const minorKyc = (minorPath: "linked" | "emancipated") =>
    approvedKyc({
      birthDate: "2009-10-10",
      minorPath,
      riskFlags: ["minor"],
      documents: [
        { kind: "id_front", path: `${USER_ID}/id_front-1.png`, name: "" },
        { kind: "id_back", path: `${USER_ID}/id_back-1.png`, name: "" },
        { kind: "emancipation_certificate", path: `${USER_ID}/emancipation-1.pdf`, name: "" },
      ],
    });

  it("menor sem emancipação não abre conta e nada é enviado ao banco parceiro", async () => {
    const { client, calls } = fakeAsaas({ "POST /accounts": { body: CREATED } });
    const { deps } = testDeps(client, minorKyc("linked"));
    await expect(openSubaccount(USER_ID, deps)).rejects.toMatchObject({ status: 409, message: expect.stringContaining("emancipação") });
    expect(calls).toHaveLength(0);
  });

  it("menor emancipado abre conta, manda a certidão ao banco parceiro e vira conta comum quando ele aprova", async () => {
    const groups = {
      rejectReasons: null,
      data: [
        { id: "grp-id", status: "NOT_SENT", type: "IDENTIFICATION", title: "Documento com foto", documents: [] },
        { id: "grp-emancipation", status: "NOT_SENT", type: "EMANCIPATION_OF_MINORS", title: "Emancipação", documents: [] },
      ],
    };
    const { client, calls } = fakeAsaas({ "POST /accounts": { body: CREATED }, "GET /myAccount/documents": { body: groups }, "POST /myAccount/documents/*": { body: {} } });
    const { deps } = testDeps(client, minorKyc("emancipated"));
    await openSubaccount(USER_ID, deps);
    await expect(forwardKycDocuments(USER_ID, deps)).resolves.toBe(3);
    const uploads = calls.filter((c) => c.method === "POST" && c.path.startsWith("/myAccount/documents/"));
    expect(uploads.map((c) => c.path)).toEqual(["/myAccount/documents/grp-id", "/myAccount/documents/grp-id", "/myAccount/documents/grp-emancipation"]);
    expect((uploads[2].body as FormData).get("type")).toBe("EMANCIPATION_OF_MINORS");
  });
});

describe("documentos da subconta", () => {
  const groups = {
    rejectReasons: null,
    data: [
      { id: "grp-id", status: "NOT_SENT", type: "IDENTIFICATION", title: "Documento com foto", documents: [] },
      { id: "grp-selfie", status: "NOT_SENT", type: "IDENTIFICATION_SELFIE", title: "Selfie", onboardingUrl: "https://onboarding.asaas.com/x" },
    ],
  };

  it("reaproveita frente e verso do KYC no grupo IDENTIFICATION, com a chave da subconta", async () => {
    const { client, calls } = fakeAsaas({ "POST /accounts": { body: CREATED }, "GET /myAccount/documents": { body: groups }, "POST /myAccount/documents/*": { body: {} } });
    const { deps } = testDeps(client);
    await openSubaccount(USER_ID, deps);
    await expect(forwardKycDocuments(USER_ID, deps)).resolves.toBe(2);
    const uploads = calls.filter((c) => c.method === "POST" && c.path.startsWith("/myAccount/documents/"));
    expect(uploads.map((c) => c.path)).toEqual(["/myAccount/documents/grp-id", "/myAccount/documents/grp-id"]);
    expect(uploads.every((c) => c.apiKey === CREATED.apiKey)).toBe(true);
    expect((uploads[0].body as FormData).get("type")).toBe("IDENTIFICATION");
  });

  it("envio manual usa o tipo do próprio Asaas e recusa formatos ou grupos do link seguro", async () => {
    const { client, calls } = fakeAsaas({ "POST /accounts": { body: CREATED }, "GET /myAccount/documents": { body: groups }, "POST /myAccount/documents/*": { body: {} } });
    const { deps } = testDeps(client);
    await openSubaccount(USER_ID, deps);
    const png = new File(["x"], "rg.png", { type: "image/png" });
    await uploadSubaccountDocument(USER_ID, "grp-id", png, deps);
    expect((calls.at(-1)?.body as FormData).get("type")).toBe("IDENTIFICATION");
    await expect(uploadSubaccountDocument(USER_ID, "grp-selfie", png, deps)).rejects.toMatchObject({ status: 409 });
    await expect(uploadSubaccountDocument(USER_ID, "grp-id", new File(["x"], "a.exe", { type: "application/x-msdownload" }), deps)).rejects.toMatchObject({ status: 422 });
  });
});

describe("sincronização de cliente e subconta e checklist do sandbox", () => {
  it("ensureAsaasCustomerAndAccount abre a subconta uma vez e manda os documentos ao Asaas, sem cliente na conta mãe", async () => {
    const groups = { data: [{ id: "grp-id", type: "IDENTIFICATION", status: "NOT_SENT", onboardingUrl: null }] };
    const { client, calls } = fakeAsaas({
      "POST /accounts": { body: CREATED },
      "GET /myAccount/documents": { body: groups },
      "POST /myAccount/documents/*": { body: {} },
      "GET /pix/addressKeys": { body: { data: [] } },
      "POST /pix/addressKeys": { body: { id: "key_evp_1", key: "0000-0000", type: "EVP", status: "ACTIVE" } },
    });
    const { deps, store } = testDeps(client);

    const view = await ensureAsaasCustomerAndAccount(USER_ID, deps);
    expect(view.state).toBe("active");
    expect(view.kycStatus).toBe("APPROVED");
    expect(calls.filter((c) => c.method === "POST" && c.path.startsWith("/myAccount/documents/")).length).toBe(2);

    // Visitas seguintes não abrem outra conta nem criam clientes na conta mãe.
    await ensureAsaasCustomerAndAccount(USER_ID, deps);
    expect(calls.filter((c) => c.path === "/accounts").length).toBe(1);
    expect(calls.some((c) => c.path === "/customers")).toBe(false);

    const sub = await store.getSubaccount(USER_ID);
    expect(sub?.status).toBe("active");
    expect(sub?.kycStatus).toBe("APPROVED");
  });

  it("sem abertura enviada pelo membro não existe subconta (nada de dados inventados)", async () => {
    const { client, calls } = fakeAsaas({ "POST /accounts": { body: CREATED } });
    const { deps } = testDeps(client);
    deps.latestKyc = async () => null;
    await expect(ensureAsaasCustomerAndAccount(USER_ID, deps)).rejects.toMatchObject({ status: 403 });
    expect(calls).toHaveLength(0);
  });

  it("subconta do sandbox não vale na produção: o membro abre outra e o espelho antigo é zerado", async () => {
    const { client } = fakeAsaas({ "POST /accounts": { body: CREATED } });
    const { deps, store, mirror } = testDeps(client);
    await openSubaccount(USER_ID, deps);
    await deps.store.saveSubaccount(USER_ID, { status: "active", kycStatus: "APPROVED" });

    const { client: prodClient } = fakeAsaas({ "POST /accounts": { body: { ...CREATED, id: "acc_prod", walletId: "wal_prod", apiKey: "$aact_prod_subconta" } } }, "production");
    const prod = { ...deps, client: prodClient };
    expect(await currentSubaccount(USER_ID, prod)).toBeNull();

    await mirror.setAccountStatus(USER_ID, "active", "2026-09-30T00:00:00.000Z");
    const legacy = { userId: USER_ID, status: "active" as const, balance: 1500, agency: "0001", accountNumber: "10000101", activatedAt: "2026-09-30T00:00:00.000Z", virtualCard: { last4: "4242", expiry: "12/30", locked: false }, providerAccountId: "acc_123", createdAt: "2026-09-30T00:00:00.000Z" };
    await expect(reconcileLegacyAccount(USER_ID, legacy, prod)).resolves.toBe(true);
    expect(mirror.accounts.get(USER_ID)).toMatchObject({ status: "pending_activation", balance: 0, agency: null, providerAccountId: null });

    const view = await openSubaccount(USER_ID, prod);
    expect(view.state).toBe("pending_activation");
    expect(await store.getSubaccount(USER_ID)).toMatchObject({ asaasAccountId: "acc_prod", environment: "production", status: "pending_activation" });
  });

  it("completeAsaasSandboxChecklist executa cliente, cobrança e confirmação", async () => {
    const { client, calls } = fakeAsaas({
      "POST /customers": { body: { id: "cus_sandbox_1" } },
      "POST /payments": { body: { id: "pay_123", value: 5.0, status: "PENDING" } },
      "POST /payments/pay_123/receiveInCash": { body: { id: "pay_123", status: "RECEIVED_IN_CASH" } },
    });

    const result = await completeAsaasSandboxChecklist(client);
    expect(result.customer.id).toBe("cus_sandbox_1");
    expect(result.payment.id).toBe("pay_123");
    expect(result.confirmed).toBe(true);

    expect(calls.some((c) => c.path === "/customers")).toBe(true);
    expect(calls.some((c) => c.path === "/payments")).toBe(true);
    expect(calls.some((c) => c.path === "/payments/pay_123/receiveInCash")).toBe(true);
  });

  it("completeAsaasSandboxChecklist recusa o Asaas de produção sem chamar a API", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const client = new AsaasClient({ apiKey: "$aact_prod_master", baseUrl: "https://api.asaas.com/v3", environment: "production", fetch, sleep: async () => undefined, maxRetries: 1 });
    await expect(completeAsaasSandboxChecklist(client)).rejects.toMatchObject({ status: 409 });
    expect(fetch).not.toHaveBeenCalled();
  });
});

