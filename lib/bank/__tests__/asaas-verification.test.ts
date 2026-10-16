// Hello World
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decryptSecret } from "@/lib/asaas/secrets";
import { openSubaccount, refreshSubaccountStatus } from "@/lib/bank/asaas/onboarding";
import { regenerateSubaccountKey } from "@/lib/bank/asaas/recovery";
import { requireSubaccount, SUBACCOUNT_KEY_MISSING } from "@/lib/bank/asaas/subaccount";
import { handleAsaasEvent, reprocessPendingWebhooks } from "@/lib/bank/asaas/webhooks";
import { eventInstant } from "@/lib/bank/asaas/account-status";
import { ASAAS_TEST_ENV, USER_ID, fakeAsaas, testDeps } from "./asaas-fakes";

const ACCOUNT = { id: "acc_v1", walletId: "wal_v1", accountNumber: { agency: "0001", account: "555", accountDigit: "1" } };
const ALL = (general: string, documentation = general) => ({ general, documentation, commercialInfo: "APPROVED", bankAccountInfo: "APPROVED" });

beforeEach(() => {
  for (const [key, value] of Object.entries(ASAAS_TEST_ENV)) vi.stubEnv(key, value);
});
afterEach(() => vi.unstubAllEnvs());

describe("resposta da criação da subconta (formato da referência atual)", () => {
  it("aceita a chave em accessToken.apiKey (AccountSaveResponseDTO)", async () => {
    const { client } = fakeAsaas({ "POST /accounts": { body: { ...ACCOUNT, accessToken: { id: "tok", apiKey: "$aact_hmlg_aninhada" } } } });
    const { deps, store } = testDeps(client);
    await expect(openSubaccount(USER_ID, deps)).resolves.toMatchObject({ state: "pending_activation" });
    expect(decryptSecret((await store.getSubaccount(USER_ID))!.apiKeySealed!)).toBe("$aact_hmlg_aninhada");
  });

  it("sem chave na resposta: guarda o id (nunca abre outra conta) e o admin gera a chave depois", async () => {
    const { client, calls } = fakeAsaas({
      "POST /accounts": { body: ACCOUNT },
      "POST /accounts/acc_v1/accessTokens": { body: { id: "tok2", apiKey: "$aact_hmlg_regenerada" } },
    });
    const { deps, store } = testDeps(client);
    await openSubaccount(USER_ID, deps);
    expect(await store.getSubaccount(USER_ID)).toMatchObject({ asaasAccountId: "acc_v1", apiKeySealed: null, status: "pending_activation" });
    expect(store.provisioningLog().at(-1)).toMatchObject({ outcome: "failed", asaasAccountId: "acc_v1", detail: expect.stringContaining("não devolveu a apiKey") });
    await expect(requireSubaccount(USER_ID, deps)).rejects.toMatchObject({ status: 503, message: SUBACCOUNT_KEY_MISSING });

    await openSubaccount(USER_ID, deps);
    expect(calls.filter((c) => c.method === "POST" && c.path === "/accounts")).toHaveLength(1);

    await regenerateSubaccountKey(USER_ID, deps);
    expect(decryptSecret((await store.getSubaccount(USER_ID))!.apiKeySealed!)).toBe("$aact_hmlg_regenerada");
    expect(calls.find((c) => c.path === "/accounts/acc_v1/accessTokens")?.apiKey).toBe("$aact_hmlg_master");
    await expect(regenerateSubaccountKey(USER_ID, deps)).rejects.toMatchObject({ status: 409 });
  });

  it("sem chave guardada: verificar a aprovação mostra a situação salva, sem erro ao membro, e avisa o admin", async () => {
    const { client, calls } = fakeAsaas({ "POST /accounts": { body: ACCOUNT } });
    const { deps, store } = testDeps(client);
    await openSubaccount(USER_ID, deps);
    await expect(refreshSubaccountStatus(USER_ID, deps)).resolves.toMatchObject({ state: "pending_activation" });
    expect(calls.some((c) => c.path === "/myAccount/status")).toBe(false);
    expect(store.provisioningLog().at(-1)).toMatchObject({ step: "api_key", outcome: "blocked", asaasAccountId: "acc_v1", detail: expect.stringContaining("Gerar chave da subconta") });
  });

  it("resposta perdida: a nova tentativa acha a conta pelo CPF e religa, sem criar outra", async () => {
    let created = false;
    const { client, calls } = fakeAsaas({
      "POST /accounts": () => {
        created = true;
        return { status: 504 };
      },
      "GET /accounts": () => ({ body: { data: created ? [{ ...ACCOUNT, cpfCnpj: "52998224725" }, { id: "acc_dup", walletId: "w2", cpfCnpj: "52998224725" }] : [] } }),
    });
    const { deps, store } = testDeps(client);
    await expect(openSubaccount(USER_ID, deps)).rejects.toMatchObject({ status: 503 });
    expect(store.provisioningLog().at(-1)).toMatchObject({ outcome: "uncertain" });

    // Passada a trava (2 min), a retomada procura antes de criar.
    deps.now = () => new Date(Date.now() + 3 * 60_000);
    await expect(openSubaccount(USER_ID, deps)).resolves.toMatchObject({ state: "pending_activation" });
    expect(calls.filter((c) => c.method === "POST" && c.path === "/accounts")).toHaveLength(1);
    expect(await store.getSubaccount(USER_ID)).toMatchObject({ asaasAccountId: "acc_v1", provisioningStartedAt: null });
    expect(store.provisioningLog().at(-1)).toMatchObject({ outcome: "recovered", asaasAccountId: "acc_v1", detail: expect.stringContaining("acc_dup") });
  });

  it("não religa uma subconta que já pertence a outro membro", async () => {
    const { client, calls } = fakeAsaas({
      "GET /accounts": { body: { data: [{ ...ACCOUNT, cpfCnpj: "52998224725" }] } },
      "POST /accounts": { body: { ...ACCOUNT, id: "acc_novo", apiKey: "$aact_hmlg_novo" } },
    });
    const { deps, store } = testDeps(client);
    await store.reserveSubaccount("44444444-4444-4444-8444-444444444444", "sandbox", new Date().toISOString());
    await store.saveSubaccount("44444444-4444-4444-8444-444444444444", { asaasAccountId: "acc_v1" });
    await openSubaccount(USER_ID, deps);
    expect((await store.getSubaccount(USER_ID))?.asaasAccountId).toBe("acc_novo");
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
  });
});

describe("situação cadastral pelos eventos ACCOUNT_STATUS_*", () => {
  async function opened(status: Record<string, string> = ALL("APPROVED")) {
    const fake = fakeAsaas({
      "POST /accounts": { body: { ...ACCOUNT, apiKey: "$aact_hmlg_sub" } },
      "GET /myAccount/status": { body: status },
      "GET /myAccount/documents": { body: { rejectReasons: "Selfie sem nitidez", data: [] } },
    });
    const ctx = testDeps(fake.client);
    await openSubaccount(USER_ID, ctx.deps);
    return { ...ctx, calls: fake.calls };
  }
  const event = (id: string, name: string, dateCreated: string, accountStatus?: Record<string, string>) => ({ id, event: name, dateCreated, account: { id: "acc_v1" }, accountStatus });

  it("aprovação do aviso só ativa depois de conferida no Asaas", async () => {
    const { deps, store } = await opened(ALL("AWAITING_APPROVAL", "APPROVED"));
    await expect(handleAsaasEvent(event("e1", "ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED", "2026-10-10 10:00:00", ALL("APPROVED")), deps)).resolves.toBe("processed");
    expect(await store.getSubaccount(USER_ID)).toMatchObject({ status: "pending_activation", generalStatus: "AWAITING_APPROVAL", documentationStatus: "APPROVED" });
  });

  it("guarda as quatro dimensões e ignora evento mais antigo que a situação aplicada", async () => {
    const { deps, store } = await opened();
    await handleAsaasEvent(event("e2", "ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED", "2026-10-10 10:05:00", ALL("APPROVED")), deps);
    expect(await store.getSubaccount(USER_ID)).toMatchObject({ status: "active", kycStatus: "APPROVED", generalStatus: "APPROVED", commercialInfoStatus: "APPROVED", statusUpdatedAt: "2026-10-10T13:05:00.000Z" });
    // Chegou atrasado (10:01): não derruba a aprovação.
    await expect(handleAsaasEvent(event("e3", "ACCOUNT_STATUS_GENERAL_APPROVAL_PENDING", "2026-10-10 10:01:00", ALL("PENDING")), deps)).resolves.toBe("stale");
    expect((await store.getSubaccount(USER_ID))?.status).toBe("active");
    // Um PENDING novo tira o acesso ao dinheiro até nova aprovação.
    await handleAsaasEvent(event("e4", "ACCOUNT_STATUS_GENERAL_APPROVAL_PENDING", "2026-10-10 11:00:00", ALL("PENDING")), deps);
    expect((await store.getSubaccount(USER_ID))?.status).toBe("pending_activation");
  });

  it("documento recusado pede novo envio com o motivo do Asaas e avisa de novo", async () => {
    const { deps, store } = await opened();
    await store.saveSubaccount(USER_ID, { onboardingNotifiedAt: "2026-10-10T12:00:00.000Z" });
    await handleAsaasEvent(event("e5", "ACCOUNT_STATUS_DOCUMENT_REJECTED", "2026-10-10 10:10:00", { general: "PENDING", documentation: "REJECTED", commercialInfo: "APPROVED", bankAccountInfo: "APPROVED" }), deps);
    expect(await store.getSubaccount(USER_ID)).toMatchObject({ status: "rejected", kycStatus: "PENDING", documentationStatus: "REJECTED", rejectReason: "Selfie sem nitidez", onboardingNotifiedAt: null });
    const [notice] = await store.listNotifications(USER_ID, 5);
    expect(notice.body).toContain("Selfie sem nitidez");
  });

  it("evento sem accountStatus usa a dimensão do nome; alerta anual dos dados comerciais fica guardado", async () => {
    const { deps, store } = await opened();
    await handleAsaasEvent(event("e6", "ACCOUNT_STATUS_DOCUMENT_AWAITING_APPROVAL", "2026-10-10 10:20:00"), deps);
    expect((await store.getSubaccount(USER_ID))?.documentationStatus).toBe("AWAITING_APPROVAL");
    await handleAsaasEvent(event("e7", "ACCOUNT_STATUS_COMMERCIAL_INFO_EXPIRING_SOON", "2026-10-10 10:30:00"), deps);
    expect((await store.getSubaccount(USER_ID))?.commercialInfoAlert).toBe("EXPIRING_SOON");
  });

  it("falha ao processar: responde sem travar a fila, guarda o erro e a conciliação reprocessa", async () => {
    const { deps, store } = await opened();
    const original = store.saveSubaccount.bind(store);
    store.saveSubaccount = async () => {
      throw new Error("Supabase fora do ar");
    };
    await expect(handleAsaasEvent(event("e8", "ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED", "2026-10-10 10:40:00", ALL("APPROVED")), deps)).resolves.toBe("failed");
    expect(store.webhookState("e8")).toMatchObject({ processedAt: null, attempts: 1, error: "Supabase fora do ar" });

    store.saveSubaccount = original;
    deps.now = () => new Date(Date.now() + 5 * 60_000);
    await expect(reprocessPendingWebhooks(deps)).resolves.toMatchObject({ checked: 1, processed: 1, failed: 0 });
    expect((await store.getSubaccount(USER_ID))?.status).toBe("active");
    expect(store.webhookState("e8")?.processedAt).toEqual(expect.any(String));
  });

  it("consulta manual aplica a situação atual do Asaas", async () => {
    const { deps, store } = await opened(ALL("APPROVED"));
    await expect(refreshSubaccountStatus(USER_ID, deps)).resolves.toMatchObject({ state: "active" });
    expect((await store.getSubaccount(USER_ID))?.bankAccountInfoStatus).toBe("APPROVED");
  });

  it("dateCreated do Asaas é horário de Brasília", () => {
    expect(eventInstant("2024-06-12 16:45:03")?.toISOString()).toBe("2024-06-12T19:45:03.000Z");
    expect(eventInstant("lixo")).toBeNull();
  });
});
