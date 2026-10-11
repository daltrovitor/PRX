// Hello World
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyGeneralApproval, openSubaccount } from "@/lib/bank/asaas/onboarding";
import { executeOutgoing, preparePix } from "@/lib/bank/asaas/cash-out";
import { reconcileOutgoing } from "@/lib/bank/asaas/outgoing-reconcile";
import { reconcileAccounts } from "@/lib/bank/asaas/reconcile";
import { subaccountWebhookHealth, syncAllSubaccountWebhooks } from "@/lib/bank/asaas/webhook-sync";
import { memberDiagnostics, summarize } from "@/lib/bank/asaas/admin";
import { diagnose } from "@/lib/asaas/diagnosis";
import { newAuditRecord } from "@/lib/asaas/audit";
import { ASAAS_TEST_ENV, USER_ID, fakeAsaas, testDeps } from "./asaas-fakes";

const CREATED = { id: "acc_rc", walletId: "wal_rc", apiKey: "$aact_hmlg_rc", accountNumber: null };
const later = (deps: { now: () => Date }, ms: number) => {
  deps.now = () => new Date(Date.now() + ms);
};

beforeEach(() => {
  for (const [key, value] of Object.entries(ASAAS_TEST_ENV)) vi.stubEnv(key, value);
});
afterEach(() => vi.unstubAllEnvs());

async function active(routes: Parameters<typeof fakeAsaas>[0]) {
  const fake = fakeAsaas({ "POST /accounts": { body: CREATED }, "GET /finance/balance": { body: { balance: 1000 } }, ...routes });
  const ctx = testDeps(fake.client);
  await openSubaccount(USER_ID, ctx.deps);
  await applyGeneralApproval((await ctx.store.getSubaccount(USER_ID))!, "APPROVED", null, ctx.deps);
  return { ...ctx, calls: fake.calls };
}

async function sentPix(ctx: Awaited<ReturnType<typeof active>>) {
  const prepared = await preparePix(USER_ID, { method: "key", key: "ana@prx.dev", amount: 40, description: "" }, ctx.deps, []);
  await executeOutgoing(USER_ID, prepared.requestId, ctx.deps, []).catch(() => undefined);
  return prepared.requestId;
}

describe("conciliação das saídas (só consulta, nunca repete)", () => {
  it("sem resposta do POST: marca desconhecido, acha pelo externalReference e conclui como o webhook", async () => {
    let requestId = "";
    const ctx = await active({
      "POST /transfers": { status: 504 },
      "GET /transfers": () => ({ body: { hasMore: false, data: [{ id: "tr_9", status: "DONE", value: 40, externalReference: requestId }] } }),
    });
    requestId = await sentPix(ctx);
    expect(await ctx.store.getOutgoing(requestId)).toMatchObject({ status: "requested", outcomeUnknown: true, providerRef: null });

    later(ctx.deps, 5 * 60_000);
    await expect(reconcileOutgoing(ctx.deps)).resolves.toMatchObject({ checked: 1, settled: 1 });
    expect(await ctx.store.getOutgoing(requestId)).toMatchObject({ status: "done", providerRef: "tr_9", outcomeUnknown: false });
    expect(ctx.calls.filter((c) => c.method === "POST" && c.path === "/transfers")).toHaveLength(1);
    const notices = await ctx.store.listNotifications(USER_ID, 10);
    expect(notices.filter((n) => n.eventType === "TRANSFER_DONE")).toHaveLength(1);
  });

  it("transferência em processamento continua aberta; ausente há 30 min vira falha sem tentar de novo", async () => {
    const ctx = await active({ "POST /transfers": { status: 504 }, "GET /transfers": { body: { hasMore: false, data: [] } } });
    const requestId = await sentPix(ctx);
    later(ctx.deps, 5 * 60_000);
    await expect(reconcileOutgoing(ctx.deps)).resolves.toMatchObject({ pending: 1, absent: 0 });
    later(ctx.deps, 40 * 60_000);
    await expect(reconcileOutgoing(ctx.deps)).resolves.toMatchObject({ absent: 1 });
    expect(await ctx.store.getOutgoing(requestId)).toMatchObject({ status: "failed", outcomeUnknown: false });
    expect(ctx.calls.filter((c) => c.method === "POST" && c.path === "/transfers")).toHaveLength(1);
  });

  it("com o id do Asaas consulta a transferência e aplica FAILED", async () => {
    const ctx = await active({ "POST /transfers": { body: { id: "tr_ok", status: "PENDING", value: 40 } }, "GET /transfers/tr_ok": { body: { id: "tr_ok", status: "FAILED", value: 40, failReason: "Chave inexistente" } } });
    const requestId = await sentPix(ctx);
    later(ctx.deps, 5 * 60_000);
    await reconcileOutgoing(ctx.deps);
    expect(await ctx.store.getOutgoing(requestId)).toMatchObject({ status: "failed", failReason: "Chave inexistente" });
  });
});

describe("conciliação das subcontas e webhooks", () => {
  it("abertura travada sem conta no Asaas libera a trava; com conta, religa (sem criar)", async () => {
    const fake = fakeAsaas({ "POST /accounts": { status: 504 } });
    const { deps, store } = testDeps(fake.client);
    await openSubaccount(USER_ID, deps).catch(() => undefined);
    later(deps, 3 * 60_000);
    await expect(reconcileAccounts(deps)).resolves.toMatchObject({ released: 1, recovered: 0 });
    expect((await store.getSubaccount(USER_ID))?.provisioningStartedAt).toBeNull();
    expect(fake.calls.filter((c) => c.method === "POST")).toHaveLength(1);
  });

  it("conta em análise: consulta a situação e envia os documentos pendentes", async () => {
    const fake = fakeAsaas({
      "POST /accounts": { body: CREATED },
      "GET /myAccount/status": { body: { general: "PENDING", documentation: "PENDING", commercialInfo: "APPROVED", bankAccountInfo: "APPROVED" } },
      "GET /myAccount/documents": { body: { data: [{ id: "grp-id", type: "IDENTIFICATION", status: "NOT_SENT" }] } },
      "POST /myAccount/documents/*": { body: {} },
    });
    const { deps, store } = testDeps(fake.client);
    await openSubaccount(USER_ID, deps);
    later(deps, 60_000);
    await expect(reconcileAccounts(deps)).resolves.toMatchObject({ refreshed: 1, documentsSent: 1, activated: 0 });
    expect(await store.getSubaccount(USER_ID)).toMatchObject({ status: "pending_activation", documentationStatus: "PENDING", generalStatus: "PENDING" });
  });

  it("webhook antigo: aponta eventos faltando e fila parada; o sync grava token e eventos atuais e reativa", async () => {
    const old = { id: "wh_1", name: "PRX BANK", url: ASAAS_TEST_ENV.ASAAS_WEBHOOK_URL_EVENTS, enabled: true, interrupted: true, hasAuthToken: true, penalizedRequestsCount: 15, events: ["PAYMENT_RECEIVED"] };
    const fake = fakeAsaas({
      "POST /accounts": { body: CREATED },
      "GET /webhooks": { body: { data: [old] } },
      "PUT /webhooks/wh_1": (call) => ({ body: { ...old, ...(call.body as object), interrupted: false, penalizedRequestsCount: 0 } }),
    });
    const { deps } = testDeps(fake.client);
    await openSubaccount(USER_ID, deps);
    const before = await subaccountWebhookHealth(USER_ID, deps);
    expect(before).toMatchObject({ configured: true, interrupted: true, penalizedRequests: 15 });
    expect(before.missingEvents).toContain("ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED");

    await expect(syncAllSubaccountWebhooks(deps, true)).resolves.toMatchObject({ checked: 1, updated: 1 });
    const put = fake.calls.find((c) => c.method === "PUT")!;
    expect(put.apiKey).toBe(CREATED.apiKey);
    expect(put.body).toMatchObject({ authToken: ASAAS_TEST_ENV.ASAAS_WEBHOOK_AUTH_TOKEN, interrupted: false, enabled: true, url: ASAAS_TEST_ENV.ASAAS_WEBHOOK_URL_EVENTS });
    expect((put.body as { events: string[] }).events).toContain("ACCOUNT_STATUS_DOCUMENT_REJECTED");
  });
});

describe("painel admin: diagnóstico sem segredos", () => {
  it("resumo da subconta nunca leva a chave; diagnóstico ao vivo tolera falhas", async () => {
    const fake = fakeAsaas({ "POST /accounts": { body: CREATED }, "GET /myAccount/status": { body: { general: "AWAITING_APPROVAL" } }, "GET /webhooks": { status: 500 } });
    const { deps, store } = testDeps(fake.client);
    await openSubaccount(USER_ID, deps);
    const summary = summarize(await store.getSubaccount(USER_ID));
    expect(summary).toMatchObject({ hasApiKey: true, asaasAccountId: "acc_rc" });
    expect(JSON.stringify(summary)).not.toContain("v1:");
    const diag = await memberDiagnostics(USER_ID, deps);
    expect(diag.live.status).toMatchObject({ ok: true, value: { general: "AWAITING_APPROVAL" } });
    expect(diag.live.webhook).toMatchObject({ ok: false });
    expect(JSON.stringify(diag)).not.toContain("aact");
  });

  it("separa estado HTTP de negócio e marca hipótese x fato", () => {
    const base = newAuditRecord({ environment: "production", operation: "account.create", method: "POST", path: "/accounts", query: null, auth: "master", requestBody: null });
    const ok = diagnose({ ...base, outcome: "success", httpStatus: 200, responseReceived: true });
    expect(ok.httpState).toBe("ok");
    expect(ok.meaning).toContain("NÃO está aprovada");
    const timeout = diagnose({ ...base, outcome: "timeout" });
    expect(timeout).toMatchObject({ httpState: "sem resposta", cause: { certainty: "confirmado" } });
    expect(timeout.next).toContain("Não criar de novo");
    const cep = diagnose({ ...base, outcome: "http_error", httpStatus: 400, responseReceived: true, errorCode: "invalid_postalCode", errorDescription: "CEP inválido" });
    expect(cep.cause).toEqual({ certainty: "hipótese", text: expect.stringContaining("CEP") });
  });
});
