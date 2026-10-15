// Hello World
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { openSubaccount } from "@/lib/bank/asaas/onboarding";
import { syncOnboardingDocuments } from "@/lib/bank/asaas/documents";
import { ASAAS_TEST_ENV, USER_ID, approvedKyc, fakeAsaas, testDeps } from "./asaas-fakes";

/**
 * Foto do rosto (selfie) tirada na câmera do cadastro: o Asaas exige do titular
 * pessoa física. Sem link seguro, o PRX manda a foto pela API (IDENTIFICATION_SELFIE);
 * com link, é prova de vida no link do Asaas e nunca vai pela API.
 */

const CREATED = { id: "acc_123", walletId: "wal_123", apiKey: "$aact_hmlg_subconta_secreta", accountNumber: { agency: "0001", account: "123456", accountDigit: "7" } };
const SELFIE_KYC = approvedKyc({
  documents: [
    { kind: "id_front", path: `${USER_ID}/id_front-1.jpg`, name: "frente.jpg" },
    { kind: "id_back", path: `${USER_ID}/id_back-1.jpg`, name: "verso.jpg" },
    { kind: "selfie", path: `${USER_ID}/selfie-1.jpg`, name: "selfie.jpg" },
  ],
});

function groups(selfieLink: string | null) {
  return {
    rejectReasons: null,
    data: [
      { id: "grp-id", status: "NOT_SENT", type: "IDENTIFICATION", title: "Documento com foto", documents: [] },
      { id: "grp-selfie", status: "NOT_SENT", type: "IDENTIFICATION_SELFIE", title: "Selfie", onboardingUrl: selfieLink },
    ],
  };
}

async function opened(selfieLink: string | null) {
  const fake = fakeAsaas({ "POST /accounts": { body: CREATED }, "GET /myAccount/documents": { body: groups(selfieLink) }, "POST /myAccount/documents/*": { body: {} } });
  const env = testDeps(fake.client, SELFIE_KYC);
  await openSubaccount(USER_ID, env.deps);
  env.deps.now = () => new Date(Date.now() + 20_000);
  return { ...fake, ...env };
}

beforeEach(() => {
  for (const [key, value] of Object.entries(ASAAS_TEST_ENV)) vi.stubEnv(key, value);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("foto do rosto do cadastro", () => {
  it("sem link seguro: o PRX manda a selfie ao Asaas como foto JPEG, no grupo dela", async () => {
    const { deps, calls } = await opened(null);
    await expect(syncOnboardingDocuments(USER_ID, deps)).resolves.toEqual({ state: "done", sent: 2, viaLink: 0, memberUpload: 0, refusals: [] });
    const upload = calls.find((c) => c.method === "POST" && c.path === "/myAccount/documents/grp-selfie");
    const form = upload?.body as FormData;
    expect(form.get("type")).toBe("IDENTIFICATION_SELFIE");
    const file = form.get("documentFile") as File;
    expect((await sharp(new Uint8Array(await file.arrayBuffer())).metadata()).format).toBe("jpeg");
  });

  it("com link seguro: a selfie fica para a prova de vida no link, nunca pela API", async () => {
    const { deps, calls } = await opened("https://onboarding.asaas.com/selfie");
    await expect(syncOnboardingDocuments(USER_ID, deps)).resolves.toEqual({ state: "done", sent: 1, viaLink: 1, memberUpload: 0, refusals: [] });
    expect(calls.some((c) => c.path === "/myAccount/documents/grp-selfie")).toBe(false);
  });
});
