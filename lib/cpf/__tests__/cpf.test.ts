// Hello World
import { beforeEach, describe, expect, it } from "vitest";
import { queryCpf, readSerproConfig, resetSerproToken, serproDate, type SerproConfig } from "@/lib/cpf/serpro";
import { CPF_MISMATCH_MESSAGE, CPF_UNAVAILABLE_MESSAGE, assertCpfMatchesBirth, decide, resetCpfCache } from "@/lib/cpf/verify";

const CONFIG: SerproConfig = { key: "k", secret: "s", environment: "trial" };
const NOW = new Date("2026-10-09T12:00:00Z");

interface Call {
  url: string;
  auth: string | null;
}

/** fetch falso: token + uma resposta por consulta, em ordem. */
function fakeSerpro(...replies: Array<{ status: number; body?: unknown } | "throw">) {
  const calls: Call[] = [];
  let i = 0;
  const fetcher = (async (url: string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url, auth: headers.Authorization ?? null });
    if (url.endsWith("/token")) return new Response(JSON.stringify({ access_token: "token-de-teste-123", expires_in: 3300 }), { status: 200 });
    const reply = replies[Math.min(i++, replies.length - 1)];
    if (reply === "throw") throw new Error("timeout");
    return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status });
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

const REGULAR = { status: 200, body: { ni: "40442820135", nome: "FULANO", situacao: { codigo: "0", descricao: "Regular" }, nascimento: "14111970" } };

beforeEach(() => {
  resetSerproToken();
  resetCpfCache();
});

describe("Serpro: formato da chamada", () => {
  it("manda CPF e nascimento em DDMMAAAA com Bearer, e o token com Basic", async () => {
    const { fetcher, calls } = fakeSerpro(REGULAR);
    const result = await queryCpf("40442820135", "1970-11-14", CONFIG, fetcher);
    expect(result).toMatchObject({ kind: "match", situationCode: "0", partial: false });
    expect(calls[0].auth).toBe(`Basic ${Buffer.from("k:s").toString("base64")}`);
    expect(calls[1].url).toBe("https://gateway.apiserpro.serpro.gov.br/consulta-cpf-df-trial/v3/cpf/40442820135/14111970");
    expect(calls[1].auth).toBe("Bearer token-de-teste-123");
    expect(serproDate("2000-01-05")).toBe("05012000");
  });

  it("reaproveita o token e renova uma vez no 401", async () => {
    const { fetcher, calls } = fakeSerpro({ status: 401 }, REGULAR);
    expect(await queryCpf("40442820135", "1970-11-14", CONFIG, fetcher)).toMatchObject({ kind: "match" });
    expect(calls.filter((c) => c.url.endsWith("/token"))).toHaveLength(2);
  });

  it("traduz os códigos de retorno", async () => {
    const run = (reply: { status: number; body?: unknown } | "throw") => queryCpf("40442820135", "1970-11-14", CONFIG, fakeSerpro(reply).fetcher);
    expect(await run({ status: 404, body: { erro: "DATA_NASCIMENTO_DIVERGENTE" } })).toEqual({ kind: "mismatch", reason: "DATA_NASCIMENTO_DIVERGENTE" });
    expect(await run({ status: 404, body: { erro: "CPF_INEXISTENTE" } })).toEqual({ kind: "mismatch", reason: "CPF_INEXISTENTE" });
    expect(await run({ status: 422 })).toEqual({ kind: "minor_withheld", status: 422 });
    expect(await run({ status: 451 })).toEqual({ kind: "minor_withheld", status: 451 });
    expect(await run({ status: 206, body: { situacao: { codigo: "0" } } })).toMatchObject({ kind: "match", partial: true });
    expect(await run({ status: 500 })).toMatchObject({ kind: "unavailable", status: 500 });
    expect(await run("throw")).toMatchObject({ kind: "unavailable", status: null });
  });
});

describe("decisão", () => {
  it("aceita Regular e Pendente de regularização; recusa as demais situações", () => {
    const situation = (codigo: string) => decide({ kind: "match", situationCode: codigo, situation: null, partial: false }, "2000-01-01", NOW).outcome;
    expect(situation("0")).toBe("verified");
    expect(situation("4")).toBe("verified");
    for (const code of ["2", "3", "5", "8", "9"]) expect(situation(code)).toBe("irregular");
  });

  it("422/451 só vale para quem declara menor de 18 anos", () => {
    expect(decide({ kind: "minor_withheld", status: 422 }, "2012-03-01", NOW).outcome).toBe("verified");
    expect(decide({ kind: "minor_withheld", status: 451 }, "1999-03-01", NOW).outcome).toBe("mismatch");
  });
});

describe("assertCpfMatchesBirth", () => {
  const check = (fetcher: typeof fetch) => assertCpfMatchesBirth("40442820135", "1970-11-14", "teste", { config: CONFIG, fetcher, now: NOW });

  it("passa quando a Receita confere", async () => {
    await expect(check(fakeSerpro(REGULAR).fetcher)).resolves.toBe("verified");
  });

  it("nascimento divergente e CPF irregular dão a mesma mensagem genérica (422)", async () => {
    await expect(check(fakeSerpro({ status: 404, body: { erro: "DATA_NASCIMENTO_DIVERGENTE" } }).fetcher)).rejects.toMatchObject({ status: 422, message: CPF_MISMATCH_MESSAGE });
    resetCpfCache();
    await expect(check(fakeSerpro({ status: 200, body: { situacao: { codigo: "3", descricao: "Titular Falecido" } } }).fetcher)).rejects.toMatchObject({ status: 422, message: CPF_MISMATCH_MESSAGE });
  });

  it("Serpro fora do ar é 503, sem liberar o cadastro", async () => {
    await expect(check(fakeSerpro({ status: 500 }).fetcher)).rejects.toMatchObject({ status: 503, message: CPF_UNAVAILABLE_MESSAGE });
  });

  it("não cobra de novo o mesmo CPF e nascimento em 10 minutos", async () => {
    const { fetcher, calls } = fakeSerpro(REGULAR);
    await check(fetcher);
    await check(fetcher);
    expect(calls.filter((c) => c.url.includes("/cpf/"))).toHaveLength(1);
  });

  it("sem credenciais do Serpro não consulta nem bloqueia", async () => {
    const { fetcher, calls } = fakeSerpro(REGULAR);
    await expect(assertCpfMatchesBirth("40442820135", "1970-11-14", "teste", { config: null, fetcher })).resolves.toBe("skipped");
    expect(calls).toHaveLength(0);
  });
});

describe("configuração", () => {
  it("só liga com chave e segredo reais; trial é opt-in", () => {
    expect(readSerproConfig({})).toBeNull();
    expect(readSerproConfig({ SERPRO_CPF_CONSUMER_KEY: "your_key", SERPRO_CPF_CONSUMER_SECRET: "x" })).toBeNull();
    expect(readSerproConfig({ SERPRO_CPF_CONSUMER_KEY: "a", SERPRO_CPF_CONSUMER_SECRET: "b" })).toMatchObject({ environment: "production" });
    expect(readSerproConfig({ SERPRO_CPF_CONSUMER_KEY: "a", SERPRO_CPF_CONSUMER_SECRET: "b", SERPRO_CPF_ENVIRONMENT: "trial" })).toMatchObject({ environment: "trial" });
  });
});
