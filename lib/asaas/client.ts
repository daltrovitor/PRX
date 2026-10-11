// Hello World
import type { z } from "zod";
import { readAsaasConfig, type AsaasConfig, type AsaasEnvironment } from "@/lib/asaas/config";
import { AsaasError, parseErrorItems } from "@/lib/asaas/errors";
import { newAuditRecord, type AuditRecord, type AuditSink } from "@/lib/asaas/audit";
import { operationName } from "@/lib/asaas/operations";
import { sanitizePayload, sanitizeQuery, scrubText } from "@/lib/asaas/sanitize";
import { getAsaasAuditStore } from "@/lib/bank/asaas/audit-store";

/**
 * Camada HTTP do Asaas API v3. Só roda no servidor: as chaves (conta mãe e
 * subcontas) vão no header `access_token` e nunca saem daqui.
 *
 * Política de repetição:
 *   - 429 (limite de requisições): repete qualquer método. O Asaas não processou
 *     o pedido, então repetir um POST não duplica Pix nem boleto.
 *   - 5xx, timeout ou queda de rede: repete só GET. Num POST o resultado é
 *     incerto e repetir poderia pagar duas vezes; o erro sai com `ambiguous`.
 * Espera exponencial com jitter, respeitando Retry-After (ou RateLimit-Reset) quando vier.
 * Cada chamada vira um registro em asaas_api_requests (ver lib/asaas/audit.ts).
 */

type Method = "GET" | "POST" | "PUT" | "DELETE";
export type AsaasQuery = Record<string, string | number | boolean | null | undefined>;

export interface AsaasRequest {
  method?: Method;
  query?: AsaasQuery;
  /** Corpo JSON. */
  body?: unknown;
  /** Corpo multipart (envio de documentos). */
  form?: FormData;
  /** apiKey da subconta. Sem ela, a chamada sai pela conta mãe. */
  apiKey?: string;
}

export interface AsaasClientOptions extends AsaasConfig {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  maxRetries?: number;
  timeoutMs?: number;
  /** Registro central das chamadas; null desliga (testes). */
  audit?: AuditSink | null;
}

const USER_AGENT = "PRX-App/1.0 (+https://prx.app.br)";
const BASE_DELAY_MS = 400;
const MAX_DELAY_MS = 8_000;
const MAX_RETRY_AFTER_MS = 30_000;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Retry-After em segundos ou data HTTP; null quando ausente ou inválido. */
export function retryAfterMs(header: string | null, now = Date.now()): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.min(Math.max(date - now, 0), MAX_RETRY_AFTER_MS);
}

/** Id do recurso devolvido (subconta, transferência, chave…), quando a resposta é um objeto com id. */
function resourceId(json: unknown): string | null {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return null;
  const id = (json as Record<string, unknown>).id;
  return typeof id === "string" && id.length <= 120 ? id : null;
}

export class AsaasClient {
  readonly environment: AsaasEnvironment;
  private readonly baseUrl: string;
  private readonly masterKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  /** Registro central das chamadas (null nos testes que não o usam). */
  readonly audit: AuditSink | null;

  constructor(options: AsaasClientOptions) {
    this.environment = options.environment;
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.masterKey = options.apiKey;
    this.fetchImpl = options.fetch ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
    this.random = options.random ?? Math.random;
    this.maxRetries = options.maxRetries ?? 3;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.audit = options.audit ?? null;
  }

  /** Monta a URL só com caminhos relativos à API: nada de host vindo de fora. */
  private url(path: string, query?: AsaasQuery): string {
    if (!path.startsWith("/") || path.includes("//") || path.includes("..") || /[?#]/.test(path)) {
      throw new Error(`[asaas] caminho inválido: ${path}`);
    }
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== null && value !== undefined && value !== "") params.set(key, String(value));
    }
    const qs = params.toString();
    return `${this.baseUrl}${path}${qs ? `?${qs}` : ""}`;
  }

  private backoff(attempt: number, retryAfter: number | null): number {
    if (retryAfter !== null) return retryAfter;
    const exp = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
    return Math.round(exp / 2 + this.random() * (exp / 2));
  }

  async request<T = unknown>(path: string, init: AsaasRequest = {}, schema?: z.ZodType<T>): Promise<T> {
    const method = init.method ?? "GET";
    const subaccount = Boolean(init.apiKey && init.apiKey.trim());
    // Registro central (asaas_api_requests): aberto antes do envio, fechado com o desfecho. Nunca guarda a chave.
    const record = this.audit
      ? newAuditRecord({
          environment: this.environment,
          operation: operationName(method, path),
          method,
          path: path.split("?")[0].slice(0, 300),
          query: sanitizeQuery(init.query),
          auth: subaccount ? "subaccount" : "master",
          requestBody: sanitizePayload(init.form ?? init.body),
        })
      : null;
    const started = Date.now();
    let attempts = 0;
    const close = async (patch: Partial<AuditRecord>) => {
      if (record && this.audit) await this.audit.finish({ ...record, ...patch, attempts, durationMs: Date.now() - started });
    };

    let url: string;
    try {
      url = this.url(path, init.query);
    } catch (err) {
      await close({ outcome: "not_sent", errorCode: "invalid_path", errorDescription: err instanceof Error ? err.message : "caminho inválido" });
      throw err;
    }
    const headers: Record<string, string> = {
      access_token: subaccount ? init.apiKey!.trim() : this.masterKey,
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    };
    let body: string | FormData | undefined;
    if (init.form) body = init.form;
    else if (init.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(init.body);
    }
    if (record && this.audit) await this.audit.start(record);

    for (let attempt = 0; ; attempt++) {
      attempts = attempt + 1;
      const canRetry = attempt < this.maxRetries;
      let res: Response;
      try {
        res = await this.fetchImpl(url, { method, headers, body, cache: "no-store", signal: AbortSignal.timeout(this.timeoutMs) });
      } catch (err) {
        // Timeout ou rede: só GET é seguro repetir.
        if (method === "GET" && canRetry) {
          await this.sleep(this.backoff(attempt, null));
          continue;
        }
        const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
        const error = new AsaasError(0, [{ code: timedOut ? "timeout" : "network_error", description: timedOut ? "O PRX BANK não respondeu a tempo." : "Sem resposta do PRX BANK." }], method !== "GET");
        await close({ outcome: timedOut ? "timeout" : "network_error", errorCode: error.code, errorDescription: error.message });
        throw error;
      }

      if (res.status === 429 && canRetry) {
        await this.sleep(this.backoff(attempt, retryAfterMs(res.headers.get("retry-after")) ?? retryAfterMs(res.headers.get("ratelimit-reset"))));
        continue;
      }
      if (res.status >= 500 && method === "GET" && canRetry) {
        await this.sleep(this.backoff(attempt, null));
        continue;
      }

      const text = await res.text().catch(() => "");
      let json: unknown = null;
      if (text) {
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }
      }
      const received = { httpStatus: res.status, responseReceived: true, responseBody: sanitizePayload(json ?? (text ? text.slice(0, 500) : null)), asaasResourceId: resourceId(json) };

      if (!res.ok) {
        const items = parseErrorItems(json);
        const error = new AsaasError(res.status, items.length > 0 ? items : [{ code: `http_${res.status}`, description: "" }], res.status >= 500 && method !== "GET");
        await close({ ...received, outcome: res.status === 429 ? "rate_limited" : "http_error", errorCode: error.code, errorDescription: scrubText(error.message) });
        throw error;
      }
      if (!schema) {
        await close({ ...received, outcome: "success" });
        return json as T;
      }
      const parsed = schema.safeParse(json);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const where = issue?.path.join(".") || "(raiz)";
        console.warn("[asaas] resposta fora do formato esperado:", method, path, where);
        await close({ ...received, outcome: "invalid_response", errorCode: "invalid_response", errorDescription: `Formato inesperado no campo ${where}: ${issue?.message ?? ""}`.slice(0, 1000) });
        throw new AsaasError(502, [{ code: "invalid_response", description: "Resposta inesperada do PRX BANK." }], method !== "GET");
      }
      await close({ ...received, outcome: "success" });
      return parsed.data;
    }
  }

  get<T = unknown>(path: string, options: Omit<AsaasRequest, "method" | "body" | "form"> = {}, schema?: z.ZodType<T>): Promise<T> {
    return this.request(path, { ...options, method: "GET" }, schema);
  }

  post<T = unknown>(path: string, body: unknown, options: Pick<AsaasRequest, "apiKey" | "query"> = {}, schema?: z.ZodType<T>): Promise<T> {
    return this.request(path, { ...options, method: "POST", body }, schema);
  }

  put<T = unknown>(path: string, body: unknown, options: Pick<AsaasRequest, "apiKey"> = {}, schema?: z.ZodType<T>): Promise<T> {
    return this.request(path, { ...options, method: "PUT", body }, schema);
  }

  delete<T = unknown>(path: string, options: Pick<AsaasRequest, "apiKey"> = {}, schema?: z.ZodType<T>): Promise<T> {
    return this.request(path, { ...options, method: "DELETE" }, schema);
  }
}

const globalAsaas = globalThis as unknown as { __prxAsaas?: { signature: string; client: AsaasClient } };

/** Cliente único por configuração; null quando o Asaas não está ligado neste ambiente. */
export function getAsaasClient(): AsaasClient | null {
  const config = readAsaasConfig();
  if (!config) return null;
  const signature = `${config.environment}|${config.baseUrl}|${config.apiKey.slice(-6)}`;
  if (globalAsaas.__prxAsaas?.signature !== signature) globalAsaas.__prxAsaas = { signature, client: new AsaasClient({ ...config, audit: getAsaasAuditStore() }) };
  return globalAsaas.__prxAsaas.client;
}

export function asaasEnabled(): boolean {
  return readAsaasConfig() !== null;
}
