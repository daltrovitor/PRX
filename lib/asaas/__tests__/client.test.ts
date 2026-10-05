// Hello World
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AsaasClient, retryAfterMs } from "@/lib/asaas/client";
import { hideProviderName } from "@/lib/asaas/errors";
import { asaasChecklist, cleanApiKey, readAsaasConfig, resolveBaseUrl, webhookTokenMatches, webhookUrls } from "@/lib/asaas/config";
import { AsaasError, toPartnerError } from "@/lib/asaas/errors";

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/** fetch falso que devolve as respostas em ordem e registra cada chamada. */
function fakeFetch(responses: Array<Response | Error>) {
  const calls: Call[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : init?.body,
    });
    const next = responses.shift();
    if (!next) throw new Error("sem resposta preparada");
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;
  return { impl, calls };
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

function client(responses: Array<Response | Error>, maxRetries = 3) {
  const fetch = fakeFetch(responses);
  const sleeps: number[] = [];
  const asaas = new AsaasClient({
    apiKey: "$aact_hmlg_master",
    baseUrl: "https://api-sandbox.asaas.com/v3",
    environment: "sandbox",
    fetch: fetch.impl,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 0.5,
    maxRetries,
  });
  return { asaas, calls: fetch.calls, sleeps };
}

describe("AsaasClient", () => {
  it("usa a chave da conta mãe por padrão e a da subconta quando informada, sempre no header", async () => {
    const { asaas, calls } = client([json(200, { balance: 10 }), json(200, { balance: 20 })]);
    await asaas.get("/finance/balance");
    await asaas.get("/finance/balance", { apiKey: "$aact_hmlg_sub" });
    expect(calls[0].headers.access_token).toBe("$aact_hmlg_master");
    expect(calls[1].headers.access_token).toBe("$aact_hmlg_sub");
    expect(calls.every((c) => !c.url.includes("aact"))).toBe(true);
    expect(calls[0].headers["User-Agent"]).toMatch(/PRX/);
  });

  it("monta a query ignorando valores vazios", async () => {
    const { asaas, calls } = client([json(200, { data: [] })]);
    await asaas.get("/financialTransactions", { query: { offset: 0, limit: 20, startDate: undefined, finishDate: null, order: "desc" } });
    expect(calls[0].url).toBe("https://api-sandbox.asaas.com/v3/financialTransactions?offset=0&limit=20&order=desc");
  });

  it("recusa caminhos que tentam sair da API", async () => {
    const { asaas } = client([]);
    await expect(asaas.get("//evil.com/x")).rejects.toThrow(/caminho inválido/);
    await expect(asaas.get("/../x")).rejects.toThrow(/caminho inválido/);
    await expect(asaas.get("https://evil.com")).rejects.toThrow(/caminho inválido/);
  });

  it("normaliza o array errors do Asaas", async () => {
    const { asaas } = client([json(400, { errors: [{ code: "invalid_value", description: "Saldo insuficiente." }] })]);
    const error = await asaas.post("/transfers", { value: 10 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AsaasError);
    expect((error as AsaasError).status).toBe(400);
    expect((error as AsaasError).code).toBe("invalid_value");
    expect((error as AsaasError).message).toBe("Saldo insuficiente.");
    expect((error as AsaasError).ambiguous).toBe(false);
  });

  it("repete 429 respeitando Retry-After, inclusive em POST", async () => {
    const { asaas, calls, sleeps } = client([json(429, {}, { "Retry-After": "2" }), json(429, {}), json(200, { id: "tra_1" })]);
    await expect(asaas.post("/transfers", { value: 10 })).resolves.toEqual({ id: "tra_1" });
    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([2000, 600]);
  });

  it("desiste depois do limite de tentativas em 429", async () => {
    const { asaas, calls } = client([json(429, {}), json(429, {}), json(429, { errors: [{ code: "rate", description: "Limite." }] })], 2);
    await expect(asaas.get("/finance/balance")).rejects.toMatchObject({ status: 429 });
    expect(calls).toHaveLength(3);
  });

  it("repete GET em 5xx e queda de rede", async () => {
    const { asaas, calls } = client([json(503, {}), new Error("ECONNRESET"), json(200, { balance: 1 })]);
    await expect(asaas.get("/finance/balance")).resolves.toEqual({ balance: 1 });
    expect(calls).toHaveLength(3);
  });

  it("nunca repete POST em 5xx ou queda de rede: o erro sai como ambíguo", async () => {
    const server = client([json(502, {}), json(200, {})]);
    await expect(server.asaas.post("/transfers", { value: 10 })).rejects.toMatchObject({ status: 502, ambiguous: true });
    expect(server.calls).toHaveLength(1);

    const network = client([new Error("timeout"), json(200, {})]);
    await expect(network.asaas.post("/bill", { value: 10 })).rejects.toMatchObject({ status: 0, ambiguous: true });
    expect(network.calls).toHaveLength(1);
  });

  it("valida a resposta com o schema informado", async () => {
    const schema = z.object({ balance: z.number() });
    const ok = client([json(200, { balance: 12.5, extra: true })]);
    await expect(ok.asaas.get("/finance/balance", {}, schema)).resolves.toEqual({ balance: 12.5 });
    const bad = client([json(200, { balance: "x" })]);
    await expect(bad.asaas.get("/finance/balance", {}, schema)).rejects.toMatchObject({ status: 502 });
  });
});

describe("retryAfterMs", () => {
  it("aceita segundos e data HTTP, com teto", () => {
    expect(retryAfterMs("3")).toBe(3000);
    expect(retryAfterMs("999")).toBe(30_000);
    expect(retryAfterMs(new Date(10_000).toUTCString(), 4_000)).toBe(6_000);
    expect(retryAfterMs(null)).toBeNull();
    expect(retryAfterMs("amanhã")).toBeNull();
  });
});

describe("configuração do Asaas", () => {
  const base = { BANK_PROVIDER: "asaas", ASAAS_API_KEY: "$aact_hmlg_abc", ASAAS_ENVIRONMENT: "sandbox" };

  it("só liga com BANK_PROVIDER=asaas e chave preenchida", () => {
    expect(readAsaasConfig({ ...base, BANK_PROVIDER: "" })).toBeNull();
    expect(readAsaasConfig({ ...base, ASAAS_API_KEY: "your_asaas_api_key_here" })).toBeNull();
    expect(readAsaasConfig({ ...base, ASAAS_API_KEY: "coloque_sua_chave_aqui" })).toBeNull();
    expect(readAsaasConfig(base)).toEqual({ apiKey: "$aact_hmlg_abc", baseUrl: "https://api-sandbox.asaas.com/v3", environment: "sandbox" });
  });

  it("desliga quando a chave é de outro ambiente", () => {
    expect(readAsaasConfig({ ...base, ASAAS_ENVIRONMENT: "production" })).toBeNull();
    expect(readAsaasConfig({ ...base, ASAAS_API_KEY: "$aact_prod_abc", ASAAS_ENVIRONMENT: "production" })?.baseUrl).toBe("https://api.asaas.com/v3");
  });

  it("aceita só hosts oficiais do ambiente, em https e terminando em /v3", () => {
    expect(resolveBaseUrl("https://sandbox.asaas.com/api/v3/", "sandbox")).toBe("https://sandbox.asaas.com/api/v3");
    expect(resolveBaseUrl("https://api.asaas.com/v3", "sandbox")).toBeNull();
    expect(resolveBaseUrl("http://api-sandbox.asaas.com/v3", "sandbox")).toBeNull();
    expect(resolveBaseUrl("https://asaas.com.evil.dev/v3", "sandbox")).toBeNull();
    expect(resolveBaseUrl("https://api-sandbox.asaas.com/v2", "sandbox")).toBeNull();
  });

  it("compara o token do webhook e exige 32+ caracteres", () => {
    const token = "a".repeat(48);
    expect(webhookTokenMatches(token, token)).toBe(true);
    expect(webhookTokenMatches(`${token}b`, token)).toBe(false);
    expect(webhookTokenMatches(null, token)).toBe(false);
    expect(webhookTokenMatches(token, null)).toBe(false);
  });

  it("monta as URLs dos webhooks a partir do domínio público", () => {
    expect(webhookUrls({ NEXT_PUBLIC_APP_URL: "https://prx.app.br/" })).toEqual({
      events: "https://prx.app.br/api/bank/webhooks/asaas",
      validateWithdraw: "https://prx.app.br/api/bank/webhooks/validate-withdraw",
    });
    expect(webhookUrls({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" })).toBeNull();
  });
});

describe("toPartnerError", () => {
  it("expõe recusas de negócio e esconde falhas de credencial", () => {
    expect(toPartnerError(new AsaasError(400, [{ code: "x", description: "Chave Pix não encontrada." }]))).toMatchObject({ status: 422, message: "Chave Pix não encontrada." });
    expect(toPartnerError(new AsaasError(401, [{ code: "invalid_access_token", description: "A chave de API é inválida" }])).status).toBe(503);
    expect(toPartnerError(new AsaasError(0, [], true)).message).toMatch(/Confira o extrato/);
  });
});

describe("configuração colada com erros comuns", () => {
  const prod = { BANK_PROVIDER: "asaas", ASAAS_ENVIRONMENT: "production", ASAAS_API_KEY: "$aact_prod_abc" };

  it("aceita a chave com a barra do .env ou entre aspas", () => {
    expect(cleanApiKey("\$aact_prod_abc")).toBe("$aact_prod_abc");
    expect(cleanApiKey(' "$aact_prod_abc" ')).toBe("$aact_prod_abc");
    expect(readAsaasConfig({ ...prod, ASAAS_API_KEY: "\$aact_prod_abc" })?.apiKey).toBe("$aact_prod_abc");
  });

  it("URL do sandbox esquecida na produção vira a URL oficial da produção, nunca a do sandbox", () => {
    expect(readAsaasConfig({ ...prod, ASAAS_API_URL: "https://sandbox.asaas.com/api/v3" })?.baseUrl).toBe("https://api.asaas.com/v3");
    expect(readAsaasConfig({ ...prod, ASAAS_API_URL: "https://evil.example.com/v3" })).toBeNull();
  });

  it("o diagnóstico aponta o que falta sem mostrar a chave", () => {
    const checks = asaasChecklist({ ...prod, ASAAS_API_KEY: "$aact_hmlg_segredo123" });
    const key = checks.find((c) => c.label.startsWith("ASAAS_API_KEY"));
    expect(key).toMatchObject({ ok: false, hint: expect.stringContaining("sandbox") });
    expect(JSON.stringify(checks)).not.toContain("segredo123");
    expect(checks.find((c) => c.label.startsWith("BANK_ENCRYPTION_KEY"))?.ok).toBe(false);
  });
});

describe("nome do parceiro escondido do membro", () => {
  it("troca o nome do provedor por banco parceiro nos textos que vêm dele", () => {
    expect(hideProviderName("Saldo insuficiente na sua conta Asaas.")).toBe("Saldo insuficiente na sua conta banco parceiro.");
    expect(hideProviderName("Taxa do ASAAS Gestão Financeira Instituição de Pagamento S.A.")).toBe("Taxa do banco parceiro");
    expect(hideProviderName("Pix recebido")).toBe("Pix recebido");
  });
});
