import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/client";

/**
 * Limitador em memória (por instância): bom para rotas autenticadas de alto volume e como
 * reserva do limitador persistente. Logins, cadastros e OTP usam checkRateLimitPersistent.
 */
interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

export function checkRateLimit(identifier: string, maxRequests: number = 10, windowSeconds: number = 60): {
  allowed: boolean;
  remaining: number;
  resetInSeconds: number;
} {
  const now = Date.now();
  const record = rateLimitStore.get(identifier);

  if (!record || now > record.resetAt) {
    rateLimitStore.set(identifier, {
      count: 1,
      resetAt: now + windowSeconds * 1000,
    });
    return { allowed: true, remaining: maxRequests - 1, resetInSeconds: windowSeconds };
  }

  if (record.count >= maxRequests) {
    const resetInSeconds = Math.ceil((record.resetAt - now) / 1000);
    return { allowed: false, remaining: 0, resetInSeconds };
  }

  record.count += 1;
  return {
    allowed: true,
    remaining: maxRequests - record.count,
    resetInSeconds: Math.ceil((record.resetAt - now) / 1000),
  };
}

export type RateLimitResult = ReturnType<typeof checkRateLimit>;

let warnedRpcFailure = false;

/**
 * Limite persistente e atômico no Postgres (RPC prx_check_rate_limit), igual para todas as
 * instâncias serverless: é ele que segura força bruta distribuída em login, cadastro, OTP e
 * guardian-auth (pentest H3). A chave é gravada em hash, sem IP nem e-mail em claro.
 *
 * Sem Supabase (desenvolvimento) ou se a RPC falhar (ex.: migration 20261105 ainda não aplicada),
 * cai no limitador em memória acima, que vale só por instância, para não derrubar o endpoint.
 */
export async function checkRateLimitPersistent(identifier: string, maxRequests: number = 10, windowSeconds: number = 60): Promise<RateLimitResult> {
  if (!supabaseAdmin) return checkRateLimit(identifier, maxRequests, windowSeconds);
  try {
    const key = crypto.createHash("sha256").update(identifier).digest("hex");
    const { data, error } = await supabaseAdmin.rpc("prx_check_rate_limit", { p_key: key, p_max_requests: maxRequests, p_window_seconds: windowSeconds });
    const result = data as Partial<RateLimitResult> | null;
    if (error || !result || typeof result.allowed !== "boolean") throw new Error(error?.message ?? "resposta inesperada da RPC");
    return {
      allowed: result.allowed,
      remaining: Number(result.remaining ?? 0),
      resetInSeconds: Number(result.resetInSeconds ?? windowSeconds),
    };
  } catch (error) {
    if (!warnedRpcFailure) {
      warnedRpcFailure = true;
      console.warn("Rate limit persistente indisponível, usando o limitador em memória:", error instanceof Error ? error.message : error);
    }
    return checkRateLimit(identifier, maxRequests, windowSeconds);
  }
}

/**
 * Sanitizes input string to prevent stored or reflected XSS injection.
 */
export function sanitizeInput(str: string): string {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
}
