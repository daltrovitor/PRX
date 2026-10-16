// Hello World
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decryptSecret } from "@/lib/asaas/secrets";
import { ensureAsaasCustomerAndAccount, openSubaccount } from "@/lib/bank/asaas/onboarding";
import { ASAAS_TEST_ENV, USER_ID, approvedKyc, fakeAsaas, testDeps } from "./asaas-fakes";

/**
 * Cadastro de teste excluído e refeito do zero com o mesmo CPF: a subconta do
 * Asaas continua existindo (ligada ao CPF) e a chave dela só vem uma vez. O
 * cofre guarda a chave na exclusão e o novo cadastro religa a subconta com ela,
 * sem criar outra e sem depender de gerar chave nova (impossível pela Vercel).
 */

const NEW_USER = "55555555-5555-4555-8555-555555555555";
const ACCOUNT = { id: "acc_cofre", walletId: "wal_cofre", accountNumber: { agency: "0001", account: "777", accountDigit: "2" } };

beforeEach(() => {
  for (const [key, value] of Object.entries(ASAAS_TEST_ENV)) vi.stubEnv(key, value);
});
afterEach(() => vi.unstubAllEnvs());

describe("cofre da subconta", () => {
  it("cadastro excluído e refeito: religa a mesma subconta com a chave guardada, sem criar outra", async () => {
    let exists = false;
    const { client, calls } = fakeAsaas(
      {
        "GET /accounts": () => ({ body: { data: exists ? [{ ...ACCOUNT, cpfCnpj: "52998224725" }] : [] } }),
        "POST /accounts": () => {
          exists = true;
          return { body: { ...ACCOUNT, apiKey: "$aact_prod_chave_original" } };
        },
        "GET /myAccount/status": { body: { general: "APPROVED", documentation: "APPROVED", commercialInfo: "APPROVED", bankAccountInfo: "APPROVED" } },
        "GET /myAccount/documents": { body: { data: [] } },
        "POST /pix/addressKeys": { body: { id: "key_1", key: "evp-1", type: "EVP", status: "ACTIVE" } },
        "GET /pix/addressKeys": { body: { data: [] } },
      },
      "production"
    );
    const { deps, store } = testDeps(client);
    await openSubaccount(USER_ID, deps);
    expect(decryptSecret((await store.getSubaccount(USER_ID))!.apiKeySealed!)).toBe("$aact_prod_chave_original");

    // O membro exclui o cadastro: a linha sai, a chave vai para o cofre.
    await store.removeSubaccount(USER_ID);
    expect(await store.getSubaccount(USER_ID)).toBeNull();
    expect(await store.vaultedSubaccount("acc_cofre", "production")).toMatchObject({ asaasAccountId: "acc_cofre", adoptedBy: null });

    // Novo cadastro, mesmo CPF: a subconta volta com a chave e a situação é conferida no Asaas.
    deps.latestKyc = async () => approvedKyc({ id: "kyc-2", userId: NEW_USER });
    deps.now = () => new Date(Date.now() + 60_000);
    const view = await ensureAsaasCustomerAndAccount(NEW_USER, deps);

    const sub = await store.getSubaccount(NEW_USER);
    expect(sub?.asaasAccountId).toBe("acc_cofre");
    expect(decryptSecret(sub!.apiKeySealed!)).toBe("$aact_prod_chave_original");
    expect(calls.filter((c) => c.method === "POST" && c.path === "/accounts")).toHaveLength(1);
    expect(calls.some((c) => c.path === "/myAccount/status" && c.apiKey === "$aact_prod_chave_original")).toBe(true);
    expect(view.state).toBe("active");
    expect(await store.vaultedSubaccount("acc_cofre", "production")).toMatchObject({ adoptedBy: NEW_USER });
    expect(store.provisioningLog().find((l) => l.outcome === "recovered")?.detail).toContain("chave guardada no cofre");
  });

  it("sem nada no cofre, religa sem chave e pede ao admin a chave (comportamento anterior)", async () => {
    const { client } = fakeAsaas({ "GET /accounts": { body: { data: [{ ...ACCOUNT, cpfCnpj: "52998224725" }] } } });
    const { deps, store } = testDeps(client);
    await openSubaccount(USER_ID, deps);
    expect(await store.getSubaccount(USER_ID)).toMatchObject({ asaasAccountId: "acc_cofre", apiKeySealed: null });
    expect(store.provisioningLog().at(-1)?.detail).toContain("Falta a chave da subconta");
  });
});
