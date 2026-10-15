// Hello World
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureAsaasCustomerAndAccount, openSubaccount } from "@/lib/bank/asaas/onboarding";
import { syncOnboardingDocuments } from "@/lib/bank/asaas/documents";
import { restartOpening } from "@/lib/bank/asaas/recovery";
import { getKycRepository } from "@/lib/kyc/repository";
import { KYC_RESTART_NOTE } from "@/lib/kyc/types";
import { ASAAS_TEST_ENV, USER_ID, approvedKyc, fakeAsaas, testDeps } from "./asaas-fakes";

/**
 * "Recomeçar abertura" (admin): o membro volta ao formulário sem apagar o
 * cadastro, e a subconta do Asaas (em análise ou aprovada) é reaproveitada
 * com a chave guardada. Apagar o cadastro perdia a chave.
 */

const CREATED = { id: "acc_123", walletId: "wal_123", apiKey: "$aact_hmlg_subconta_secreta", accountNumber: { agency: "0001", account: "123456", accountDigit: "7" } };
const GROUPS = { rejectReasons: null, data: [{ id: "grp-id", status: "NOT_SENT", type: "IDENTIFICATION", title: "Documento com foto", documents: [] }] };
const ROUTES = { "POST /accounts": { body: CREATED }, "GET /myAccount/documents": { body: GROUPS }, "POST /myAccount/documents/*": { body: {} }, "POST /sandbox/myAccount/approve": { body: {} } };

/** Envio do membro gravado no repositório (memória) e aprovado pelas regras do PRX. */
async function submitted(version: string) {
  const app = await getKycRepository().insert(
    approvedKyc({ documents: [{ kind: "id_front", path: `${USER_ID}/id_front-${version}.jpg`, name: "frente.jpg" }, { kind: "id_back", path: `${USER_ID}/id_back-${version}.jpg`, name: "verso.jpg" }] })
  );
  return getKycRepository().decide(app.id, "approved", "auto", "auto");
}

function setup() {
  const fake = fakeAsaas(ROUTES);
  const env = testDeps(fake.client);
  env.deps.latestKyc = (userId) => getKycRepository().latestForUser(userId);
  return { ...fake, ...env };
}

/** Depois dos 15 s que o Asaas pede entre a criação da subconta e os documentos. */
const later = (deps: { now: () => Date }) => {
  deps.now = () => new Date(Date.now() + 20_000);
};

beforeEach(() => {
  // Repositório em memória vazio (sem a conta de demonstração, que usa o mesmo CPF de teste).
  (globalThis as { __prxKyc?: unknown[] }).__prxKyc = [];
  for (const [key, value] of Object.entries(ASAAS_TEST_ENV)) vi.stubEnv(key, value);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("recomeçar a abertura sem apagar o cadastro", () => {
  it("volta ao formulário, mantém a subconta com a chave e reenvia os documentos do novo envio", async () => {
    const { deps, store, calls } = setup();
    await submitted("1");
    await openSubaccount(USER_ID, deps);
    later(deps);
    await syncOnboardingDocuments(USER_ID, deps);
    const before = await store.getSubaccount(USER_ID);

    await expect(restartOpening(USER_ID, deps, "admin@prx.dev")).resolves.toEqual({ retiredKyc: true, asaasAccountId: "acc_123" });
    expect(await getKycRepository().latestForUser(USER_ID)).toMatchObject({ status: "rejected", reviewNote: KYC_RESTART_NOTE });
    expect(await store.getSubaccount(USER_ID)).toMatchObject({ asaasAccountId: "acc_123", apiKeySealed: before?.apiKeySealed, documentsSyncedAt: null, onboardingNotifiedAt: null });

    // Novo envio: a mesma subconta (nem procura pelo CPF nem cria outra) e os documentos seguem de novo.
    await submitted("2");
    calls.length = 0;
    await ensureAsaasCustomerAndAccount(USER_ID, deps);
    expect(calls.some((c) => c.path === "/accounts")).toBe(false);
    expect(calls.filter((c) => c.method === "POST" && c.path === "/myAccount/documents/grp-id")).toHaveLength(1);
  });

  it("conta já aprovada no Asaas continua aprovada e é a mesma depois do novo envio", async () => {
    const { deps, store, calls } = setup();
    await submitted("1");
    await openSubaccount(USER_ID, deps);
    await store.saveSubaccount(USER_ID, { status: "active", kycStatus: "APPROVED" });

    await restartOpening(USER_ID, deps, "admin@prx.dev");
    expect(await store.getSubaccount(USER_ID)).toMatchObject({ asaasAccountId: "acc_123", status: "active" });

    await submitted("2");
    calls.length = 0;
    await ensureAsaasCustomerAndAccount(USER_ID, deps);
    expect(calls.some((c) => c.method === "POST" && c.path === "/accounts")).toBe(false);
  });

  it("sem subconta ainda: encerra o envio e solta a trava de abertura esquecida", async () => {
    const { deps, store } = setup();
    await submitted("1");
    await store.reserveSubaccount(USER_ID, "sandbox", new Date(0).toISOString());

    await expect(restartOpening(USER_ID, deps, "admin@prx.dev")).resolves.toEqual({ retiredKyc: true, asaasAccountId: null });
    expect((await store.getSubaccount(USER_ID))?.provisioningStartedAt).toBeNull();
  });
});
