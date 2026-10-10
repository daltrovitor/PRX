// Hello World
import { z } from "zod";

/**
 * Consulta CPF v3 do Serpro (Receita Federal): confere se o CPF existe, se a
 * data de nascimento é a da Receita e qual a situação cadastral.
 * Docs: https://apicenter.estaleiro.serpro.gov.br/documentacao/consulta-cpf/
 * Toda chamada à v3 é cobrada (não há ambiente de teste, só o "trial" gratuito).
 */

const TOKEN_URL = "https://gateway.apiserpro.serpro.gov.br/token";
const BASE = {
  trial: "https://gateway.apiserpro.serpro.gov.br/consulta-cpf-df-trial/v3",
  production: "https://gateway.apiserpro.serpro.gov.br/consulta-cpf-df/v3",
} as const;
const TIMEOUT_MS = 8_000;

export type SerproEnvironment = keyof typeof BASE;

export interface SerproConfig {
  key: string;
  secret: string;
  environment: SerproEnvironment;
}

/** Sem a chave e o segredo do contrato a checagem fica desligada (cadastro autodeclarado). */
export function readSerproConfig(env: Record<string, string | undefined> = process.env): SerproConfig | null {
  const key = (env.SERPRO_CPF_CONSUMER_KEY ?? "").trim();
  const secret = (env.SERPRO_CPF_CONSUMER_SECRET ?? "").trim();
  if (!key || !secret || key.includes("your_") || secret.includes("your_")) return null;
  return { key, secret, environment: (env.SERPRO_CPF_ENVIRONMENT ?? "").trim().toLowerCase() === "trial" ? "trial" : "production" };
}

/** AAAA-MM-DD → DDMMAAAA, o formato da v3. */
export function serproDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}${m}${y}`;
}

const tokenSchema = z.object({ access_token: z.string().min(10), expires_in: z.number().positive() });
const personSchema = z.object({
  ni: z.string().optional(),
  situacao: z.object({ codigo: z.union([z.string(), z.number()]).transform(String), descricao: z.string().nullish() }),
});
const errorSchema = z.object({ erro: z.string().optional() }).passthrough();

export type SerproResult =
  /** 200/206: CPF e data de nascimento conferem. */
  | { kind: "match"; situationCode: string; situation: string | null; partial: boolean }
  /** 404: CPF inexistente ou data de nascimento diferente da Receita. */
  | { kind: "mismatch"; reason: "CPF_INEXISTENTE" | "DATA_NASCIMENTO_DIVERGENTE" | "NAO_ENCONTRADO" }
  /** 422/451: a v3 não devolve dados de menor (não confirma a data). */
  | { kind: "minor_withheld"; status: number }
  /** Falha do serviço ou da credencial: não dá para decidir. */
  | { kind: "unavailable"; status: number | null; detail: string };

let cachedToken: { value: string; expiresAt: number; key: string } | null = null;

async function accessToken(config: SerproConfig, fetcher: typeof fetch): Promise<string> {
  if (cachedToken && cachedToken.key === config.key && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value;
  const basic = Buffer.from(`${config.key}:${config.secret}`).toString("base64");
  const res = await fetcher(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`token Serpro recusado (${res.status})`);
  const parsed = tokenSchema.parse(await res.json());
  cachedToken = { value: parsed.access_token, expiresAt: Date.now() + parsed.expires_in * 1000, key: config.key };
  return parsed.access_token;
}

/** Só para testes. */
export function resetSerproToken(): void {
  cachedToken = null;
}

async function errorCode(res: Response): Promise<string | undefined> {
  const body = errorSchema.safeParse(await res.json().catch(() => null));
  return body.success ? body.data.erro : undefined;
}

export async function queryCpf(cpf: string, isoBirthDate: string, config: SerproConfig, fetcher: typeof fetch = fetch): Promise<SerproResult> {
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await accessToken(config, fetcher);
      const res = await fetcher(`${BASE[config.environment]}/cpf/${cpf}/${serproDate(isoBirthDate)}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      // Token vencido antes da hora: pede outro uma vez.
      if (res.status === 401 && attempt === 0) {
        cachedToken = null;
        continue;
      }
      if (res.status === 200 || res.status === 206) {
        const person = personSchema.safeParse(await res.json().catch(() => null));
        if (!person.success) return { kind: "unavailable", status: res.status, detail: "resposta do Serpro fora do formato" };
        return { kind: "match", situationCode: person.data.situacao.codigo, situation: person.data.situacao.descricao ?? null, partial: res.status === 206 };
      }
      if (res.status === 404) {
        const code = await errorCode(res);
        return { kind: "mismatch", reason: code === "CPF_INEXISTENTE" || code === "DATA_NASCIMENTO_DIVERGENTE" ? code : "NAO_ENCONTRADO" };
      }
      if (res.status === 400) {
        return { kind: "mismatch", reason: (await errorCode(res)) === "CPF_INVALIDO" ? "CPF_INEXISTENTE" : "NAO_ENCONTRADO" };
      }
      if (res.status === 422 || res.status === 451) return { kind: "minor_withheld", status: res.status };
      return { kind: "unavailable", status: res.status, detail: `Serpro respondeu ${res.status}` };
    }
    return { kind: "unavailable", status: 401, detail: "credencial do Serpro recusada" };
  } catch (err) {
    return { kind: "unavailable", status: null, detail: err instanceof Error ? err.message : "falha de rede" };
  }
}
