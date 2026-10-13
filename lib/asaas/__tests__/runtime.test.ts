// Hello World
import { describe, expect, it } from "vitest";
import { asaasRuntime, probeWebhookUrl } from "@/lib/asaas/runtime";
import { asaasChecklist, readAsaasConfig } from "@/lib/asaas/config";
import { bankLogLine, deployTag } from "@/lib/asaas/log";

const PROD_KEY = "$aact_prod_000MzkwODA2MWY2OGM3MWRlMDU2NWM3MzJlNzZmNGZhZGY6OmQ1ZGVjZmM1";
const SANDBOX_KEY = "$aact_hmlg_000MzkwODA2MWY2OGM3MWRlMDU2NWM3MzJlNzZmNGZhZGY6OmQ1ZGVjZmM1";
const prod = {
  BANK_PROVIDER: "asaas",
  ASAAS_ENVIRONMENT: "production",
  ASAAS_API_KEY: PROD_KEY,
  ASAAS_WEBHOOK_URL_EVENTS: "https://www.prx.app.br/api/bank/webhooks/asaas",
  ASAAS_WEBHOOK_URL_VALIDATE_WITHDRAW: "https://www.prx.app.br/api/bank/webhooks/validate-withdraw",
  VERCEL_ENV: "production",
  VERCEL_GIT_COMMIT_SHA: "abcdef1234567890",
};

describe("o que o deploy lê de fato", () => {
  it("produção coerente: chave de produção, endpoint oficial de produção, URLs no www", () => {
    expect(readAsaasConfig(prod)).toMatchObject({ environment: "production", baseUrl: "https://api.asaas.com/v3" });
    expect(asaasRuntime(prod)).toEqual({
      vercelEnv: "production",
      commit: "abcdef1",
      deploymentId: null,
      environment: "production",
      keyKind: "production",
      keyTail: PROD_KEY.slice(-4),
      apiBaseUrl: "https://api.asaas.com/v3",
      webhookEvents: "https://www.prx.app.br/api/bank/webhooks/asaas",
      webhookValidateWithdraw: "https://www.prx.app.br/api/bank/webhooks/validate-withdraw",
    });
  });

  it("chave de sandbox com ASAAS_ENVIRONMENT=production: integração desligada, nada vai ao Asaas", () => {
    const env = { ...prod, ASAAS_API_KEY: SANDBOX_KEY };
    expect(readAsaasConfig(env)).toBeNull();
    expect(asaasRuntime(env)).toMatchObject({ keyKind: "sandbox", environment: "production", apiBaseUrl: null });
    expect(asaasChecklist(env).find((c) => c.label.startsWith("ASAAS_API_KEY"))).toMatchObject({ ok: false, hint: expect.stringContaining("sandbox") });
  });

  it("nunca devolve a chave, só o tipo e os 4 últimos caracteres", () => {
    const text = JSON.stringify([asaasRuntime(prod), asaasRuntime({ ...prod, ASAAS_API_KEY: SANDBOX_KEY }), asaasChecklist(prod)]);
    expect(text).not.toContain(PROD_KEY.slice(0, 30));
    expect(text).not.toContain(SANDBOX_KEY.slice(0, 30));
    expect(asaasRuntime({ ...prod, ASAAS_API_KEY: "" })).toMatchObject({ keyKind: "missing", keyTail: null, apiBaseUrl: null });
    expect(asaasRuntime({ ...prod, ASAAS_API_KEY: "sk_live_x" })).toMatchObject({ keyKind: "invalid" });
    expect(asaasRuntime({ ...prod, ASAAS_API_KEY: "$aact_YTU5YTE0M2M2N2I4MTliNzk0YTI5N2U5MzdjNWZmNDQ6OjAwMDAw" })).toMatchObject({ keyKind: "legacy", apiBaseUrl: "https://api.asaas.com/v3" });
  });
});

describe("URL do webhook chamada como o Asaas chamaria", () => {
  const reply = (status: number, headers: Record<string, string> = {}) => async () => new Response(null, { status, headers });

  it("401 sem token = chegou direto ao PRX", async () => {
    await expect(probeWebhookUrl("eventos", "https://www.prx.app.br/api/bank/webhooks/asaas", reply(401))).resolves.toEqual({ label: "eventos", ok: true, hint: null });
  });

  it("308 do domínio sem www: aponta o destino, porque o Asaas só aceita 200", async () => {
    const check = await probeWebhookUrl("eventos", "https://prx.app.br/api/bank/webhooks/asaas", reply(308, { location: "https://www.prx.app.br/api/bank/webhooks/asaas" }));
    expect(check.ok).toBe(false);
    expect(check.hint).toContain("redireciona (308) para https://www.prx.app.br/api/bank/webhooks/asaas");
  });

  it("não segue redirecionamento e explica 503, 405 e falta de resposta", async () => {
    let init: RequestInit | undefined;
    await probeWebhookUrl("x", "https://www.prx.app.br/api/bank/webhooks/asaas", async (_url, given) => {
      init = given;
      return new Response(null, { status: 401 });
    });
    expect(init).toMatchObject({ method: "POST", redirect: "manual" });
    expect(new Headers(init?.headers).get("asaas-access-token")).toBeNull();
    expect((await probeWebhookUrl("x", "https://a.dev/x", reply(503))).hint).toContain("ASAAS_WEBHOOK_AUTH_TOKEN");
    expect((await probeWebhookUrl("x", "https://a.dev/x", reply(405))).hint).toContain("405");
    const down = await probeWebhookUrl("x", "https://a.dev/x", async () => {
      throw new Error("ENOTFOUND");
    });
    expect(down).toMatchObject({ ok: false, hint: expect.stringContaining("não respondeu") });
  });
});

describe("linha de log estruturada", () => {
  it("JSON com o deploy, sem campos vazios e com CPF, e-mail e chave mascarados", () => {
    const line = bankLogLine(
      "error",
      "bank.provisioning",
      { userId: "u-1", error: `CPF 529.982.247-25 de ana@prx.dev recusado com ${PROD_KEY}`, asaasId: null, detail: "" },
      new Date("2026-10-13T12:00:00Z")
    );
    const entry = JSON.parse(line) as Record<string, unknown>;
    expect(entry).toMatchObject({ ts: "2026-10-13T12:00:00.000Z", level: "error", scope: "prx-bank", event: "bank.provisioning", userId: "u-1" });
    expect(entry).not.toHaveProperty("asaasId");
    expect(entry).not.toHaveProperty("detail");
    expect(line).not.toContain("529.982.247-25");
    expect(line).not.toContain("ana@prx.dev");
    expect(line).not.toContain(PROD_KEY);
  });

  it("identifica o deploy que escreveu a linha", () => {
    expect(deployTag({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_SHA: "abcdef123" })).toBe("production@abcdef1");
    expect(deployTag({})).toBe("local");
  });
});
