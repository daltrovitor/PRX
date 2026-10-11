// Hello World
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AsaasClient } from "@/lib/asaas/client";
import { recordNotSent, withAsaasAudit } from "@/lib/asaas/audit";
import { findOperation, operationName } from "@/lib/asaas/operations";
import { maskDocumentNumber, sanitizePayload, scrubText } from "@/lib/asaas/sanitize";
import { MemoryAuditStore } from "@/lib/bank/asaas/audit-store";

const USER = "33333333-3333-4333-8333-333333333333";

function client(handler: (url: URL, init: RequestInit) => Response | Promise<Response>, audit = new MemoryAuditStore()) {
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => handler(new URL(String(input)), init ?? {})) as typeof globalThis.fetch;
  const asaas = new AsaasClient({ apiKey: "$aact_prod_master_secreta", baseUrl: "https://api.asaas.com/v3", environment: "production", fetch, sleep: async () => undefined, maxRetries: 1, audit });
  return { asaas, audit };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

describe("sanitização do registro", () => {
  it("remove chaves e tokens e mascara dados pessoais", () => {
    const clean = sanitizePayload({
      name: "Ana Souza Lima",
      email: "ana@prx.dev",
      cpfCnpj: "52998224725",
      birthDate: "2000-05-10",
      mobilePhone: "11987654321",
      address: "Avenida Paulista",
      addressNumber: "1000",
      postalCode: "01310100",
      incomeValue: 4500,
      apiKey: "$aact_prod_abc",
      accessToken: { id: "tok_1", apiKey: "$aact_prod_def" },
      webhooks: [{ authToken: "t".repeat(40), email: "suporte@prx.app.br", url: "https://prx.app.br/api/bank/webhooks/asaas" }],
    }) as Record<string, unknown>;
    const text = JSON.stringify(clean);
    expect(text).not.toContain("aact");
    expect(text).not.toContain("t".repeat(40));
    expect(text).not.toContain("52998224725");
    expect(text).not.toContain("ana@prx.dev");
    expect(text).not.toContain("987654321");
    expect(clean).toMatchObject({ name: "Ana S. L.", cpfCnpj: "***.982.247-**", birthDate: "2000-**-**", postalCode: "01310100", incomeValue: 4500, addressNumber: "***", address: "Ave***" });
    expect((clean.accessToken as Record<string, unknown>).id).toBe("tok_1");
  });

  it("limpa textos livres e descreve arquivos sem o conteúdo", () => {
    expect(scrubText("O CPF 529.982.247-25 e o e-mail ana@prx.dev já existem")).toBe("O CPF ***.982.247-** e o e-mail a***@prx.dev já existem");
    expect(maskDocumentNumber("11.222.333/0001-81")).toBe("**.222.333/0001-**");
    const form = new FormData();
    form.append("type", "IDENTIFICATION");
    form.append("documentFile", new Blob(["conteudo-secreto"], { type: "application/pdf" }), "rg.pdf");
    expect(sanitizePayload(form)).toEqual({ type: "IDENTIFICATION", documentFile: { arquivo: "rg.pdf", tipo: "application/pdf", bytes: 16 } });
  });

  it("dá nome lógico às operações, inclusive com ids no caminho", () => {
    expect(operationName("POST", "/accounts")).toBe("account.create");
    expect(operationName("GET", "/accounts")).toBe("account.find");
    expect(operationName("POST", "/myAccount/documents/8d257732-2220-11ec")).toBe("documents.upload");
    expect(findOperation("GET", "/transfers/abc-123")?.name).toBe("transfers.get");
    expect(operationName("GET", "/coisa/nova")).toBe("GET /coisa/nova");
  });
});

describe("registro de cada chamada ao Asaas", () => {
  it("sucesso: guarda operação, contexto, tempo, recurso e corpos limpos (nunca a chave)", async () => {
    const { asaas, audit } = client(() => json({ id: "acc_1", walletId: "w1", apiKey: "$aact_prod_sub" }));
    await withAsaasAudit({ userId: USER, businessRef: "kyc-1" }, () => asaas.post("/accounts", { name: "Ana Souza", cpfCnpj: "52998224725" }));
    const [row] = audit.all();
    expect(row).toMatchObject({ operation: "account.create", method: "POST", path: "/accounts", auth: "master", userId: USER, businessRef: "kyc-1", outcome: "success", httpStatus: 200, attempts: 1, asaasResourceId: "acc_1", responseReceived: true, environment: "production" });
    expect(row.durationMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(row)).not.toContain("aact");
  });

  it("erro HTTP: código e descrição do Asaas, com dados pessoais mascarados", async () => {
    const { asaas, audit } = client(() => json({ errors: [{ code: "invalid_cpfCnpj", description: "O CPF 529.982.247-25 é inválido." }] }, 400));
    await expect(asaas.post("/accounts", {})).rejects.toMatchObject({ status: 400 });
    expect(audit.all()[0]).toMatchObject({ outcome: "http_error", httpStatus: 400, errorCode: "invalid_cpfCnpj", errorDescription: "O CPF ***.982.247-** é inválido." });
  });

  it("timeout e queda de rede num POST ficam como resultado desconhecido, sem repetir", async () => {
    let calls = 0;
    const timeout = client(() => {
      calls += 1;
      throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
    });
    await expect(timeout.asaas.post("/transfers", { value: 10 })).rejects.toMatchObject({ ambiguous: true, code: "timeout" });
    expect(calls).toBe(1);
    expect(timeout.audit.all()[0]).toMatchObject({ outcome: "timeout", responseReceived: false, httpStatus: null, attempts: 1 });

    const network = client(() => {
      throw new TypeError("fetch failed");
    });
    await expect(network.asaas.post("/bill", { value: 10 })).rejects.toMatchObject({ ambiguous: true, code: "network_error" });
    expect(network.audit.all()[0].outcome).toBe("network_error");
  });

  it("resposta 2xx fora do formato vira invalid_response, com o campo que faltou", async () => {
    const { asaas, audit } = client(() => json({ id: "tr_1" }));
    await expect(asaas.post("/transfers", {}, {}, z.object({ id: z.string(), status: z.string() }))).rejects.toMatchObject({ status: 502, ambiguous: true });
    expect(audit.all()[0]).toMatchObject({ outcome: "invalid_response", httpStatus: 200, asaasResourceId: "tr_1", responseReceived: true });
    expect(audit.all()[0].errorDescription).toContain("status");
  });

  it("429 respeita RateLimit-Reset, conta as tentativas e registra o limite", async () => {
    let calls = 0;
    const { asaas, audit } = client(() => (++calls < 3 ? json({ errors: [{ code: "too_many", description: "Limite" }] }, 429, { "RateLimit-Reset": "1" }) : json({})));
    await expect(asaas.get("/finance/balance")).rejects.toMatchObject({ status: 429 });
    expect(audit.all()[0]).toMatchObject({ outcome: "rate_limited", attempts: 2, operation: "finance.balance" });
  });

  it("caminho inválido não sai do servidor e fica como not_sent; regra do PRX também", async () => {
    const { asaas, audit } = client(() => json({}));
    await expect(asaas.get("/../accounts")).rejects.toThrow();
    expect(audit.all()[0]).toMatchObject({ outcome: "not_sent", errorCode: "invalid_path" });
    await withAsaasAudit({ userId: USER }, () => recordNotSent(audit, { environment: "production", operation: "account.create", method: "POST", path: "/accounts", reason: "Cadastro não aprovado." }));
    expect(audit.all().find((r) => r.errorDescription === "Cadastro não aprovado.")).toMatchObject({ outcome: "not_sent", userId: USER, auth: "none" });
  });

  it("chamadas da mesma ação compartilham a correlação; filtros e busca funcionam", async () => {
    const { asaas, audit } = client((_url, init) => json(init.method === "GET" ? { data: [] } : { id: "acc_2", walletId: "w" }));
    await withAsaasAudit({ userId: USER }, async () => {
      await asaas.get("/accounts", { query: { cpfCnpj: "52998224725" } });
      await asaas.post("/accounts", { name: "Ana" });
    });
    const create = audit.all().find((r) => r.operation === "account.create")!;
    const find = audit.all().find((r) => r.operation === "account.find")!;
    expect(create.correlationId).toBe(find.correlationId);
    expect(find.query).toEqual({ cpfCnpj: "***.982.247-**" });
    await expect(audit.related(create.correlationId)).resolves.toHaveLength(2);
    const byResource = await audit.list({ search: "acc_2", limit: 10, offset: 0 });
    expect(byResource.rows.map((r) => r.id)).toEqual([create.id]);
    const byOperation = await audit.list({ operation: "account.find", limit: 10, offset: 0 });
    expect(byOperation.total).toBe(1);
  });
});
