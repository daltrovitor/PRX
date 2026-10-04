// Hello World
import { AsaasClient } from "@/lib/asaas/client";
import type { AsaasEnvironment } from "@/lib/asaas/config";
import { MemoryBankMirror } from "@/lib/bank/asaas/mirror";
import { MemoryAsaasBankStore } from "@/lib/bank/asaas/store-memory";
import type { AsaasDeps } from "@/lib/bank/asaas/deps";
import type { BankKycApplication } from "@/lib/kyc/types";

/** Asaas falso para os testes: rotas "MÉTODO /caminho" → resposta, e registro das chamadas. */
export interface FakeCall {
  method: string;
  path: string;
  query: string;
  apiKey: string;
  body: unknown;
}

type Reply = { status?: number; body?: unknown } | ((call: FakeCall) => { status?: number; body?: unknown });

export function fakeAsaas(routes: Record<string, Reply>, environment: AsaasEnvironment = "sandbox") {
  const calls: FakeCall[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = (init?.headers ?? {}) as Record<string, string>;
    let body: unknown = init?.body;
    if (typeof body === "string") body = JSON.parse(body);
    const call: FakeCall = { method: init?.method ?? "GET", path: url.pathname.replace(/^\/v3/, ""), query: url.search, apiKey: headers.access_token, body };
    calls.push(call);
    const key = `${call.method} ${call.path}`;
    const route = routes[key] ?? Object.entries(routes).find(([pattern]) => new RegExp(`^${pattern.replace(/\*/g, "[^/]+")}$`).test(key))?.[1];
    if (!route) return new Response(JSON.stringify({ errors: [{ code: "not_mocked", description: key }] }), { status: 404 });
    const reply = typeof route === "function" ? route(call) : route;
    return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status ?? 200, headers: { "Content-Type": "application/json" } });
  }) as typeof globalThis.fetch;
  const production = environment === "production";
  const client = new AsaasClient({
    apiKey: production ? "$aact_prod_master" : "$aact_hmlg_master",
    baseUrl: production ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3",
    environment,
    fetch,
    sleep: async () => undefined,
    maxRetries: 1,
  });
  return { client, calls };
}

export const USER_ID = "33333333-3333-4333-8333-333333333333";

export function approvedKyc(overrides: Partial<BankKycApplication> = {}): BankKycApplication {
  return {
    id: "kyc-1",
    userId: USER_ID,
    email: "ana@prx.dev",
    fullName: "Ana Souza",
    cpf: "52998224725",
    birthDate: "2000-05-10",
    motherName: "Maria Souza",
    phone: "11987654321",
    occupation: "Estudante",
    incomeRange: "3k_6k",
    pep: false,
    address: { cep: "01310100", street: "Avenida Paulista", number: "1000", complement: "Apto 5", district: "Bela Vista", city: "São Paulo", state: "SP" },
    documents: [
      { kind: "id_front", path: `${USER_ID}/id_front-1.png` },
      { kind: "id_back", path: `${USER_ID}/id_back-1.png` },
    ],
    minorPath: null,
    riskFlags: [],
    status: "approved",
    reviewNote: "",
    reviewedBy: "admin@prx.dev",
    reviewedAt: "2026-10-01T10:00:00.000Z",
    ip: null,
    userAgent: "",
    createdAt: "2026-10-01T09:00:00.000Z",
    ...overrides,
  } as BankKycApplication;
}

export function testDeps(client: AsaasClient, kyc: BankKycApplication | null = approvedKyc()) {
  const store = new MemoryAsaasBankStore();
  const mirror = new MemoryBankMirror();
  const deps: AsaasDeps = {
    client,
    store,
    mirror,
    latestKyc: async () => kyc,
    readDocument: async (path) => ({ blob: new Blob(["img"], { type: "image/png" }), filename: path.split("/").pop() ?? "doc.png" }),
    now: () => new Date(),
  };
  return { deps, store, mirror };
}

/** Variáveis que a integração precisa nos testes. */
export const ASAAS_TEST_ENV = {
  ASAAS_WEBHOOK_AUTH_TOKEN: "t".repeat(48),
  ASAAS_WEBHOOK_URL_EVENTS: "https://prx.app.br/api/bank/webhooks/asaas",
  ASAAS_WEBHOOK_URL_VALIDATE_WITHDRAW: "https://prx.app.br/api/bank/webhooks/validate-withdraw",
  PRX_EMAIL_FROM: "PRX <noreply@prx.app.br>",
  BANK_ENCRYPTION_KEY: "e".repeat(40),
};
