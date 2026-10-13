// Hello World
import { cleanApiKey, keyEnvironment, readAsaasConfig, webhookUrls, type AsaasCheck, type AsaasEnvironment } from "@/lib/asaas/config";
import { errorMessage } from "@/lib/errors";

/**
 * O que o deploy em execução realmente lê, para o painel admin (nunca para
 * logs): ambiente da Vercel, commit, que tipo de chave do Asaas chegou e para
 * onde as chamadas vão. Responde "a variável que eu mudei já está valendo?"
 * sem mostrar a chave: só o tipo (pelo prefixo oficial) e os 4 últimos
 * caracteres, para conferir com a Vercel.
 */

type Env = Record<string, string | undefined>;

export type KeyKind = "production" | "sandbox" | "legacy" | "missing" | "invalid";

export interface AsaasRuntime {
  /** VERCEL_ENV (production, preview, development); null fora da Vercel. */
  vercelEnv: string | null;
  commit: string | null;
  deploymentId: string | null;
  /** Ambiente pedido em ASAAS_ENVIRONMENT. */
  environment: AsaasEnvironment;
  /** Tipo da chave lida, pelo prefixo ($aact_prod_ / $aact_hmlg_); legacy = formato antigo, sem prefixo de ambiente. */
  keyKind: KeyKind;
  keyTail: string | null;
  /** Endpoint efetivo das chamadas; null = integração desligada neste deploy. */
  apiBaseUrl: string | null;
  webhookEvents: string | null;
  webhookValidateWithdraw: string | null;
}

function keyKind(apiKey: string): KeyKind {
  if (!apiKey || apiKey.includes("coloque_sua_chave") || apiKey.includes("your_")) return "missing";
  if (!apiKey.startsWith("$aact_")) return "invalid";
  return keyEnvironment(apiKey) ?? "legacy";
}

export function asaasRuntime(env: Env = process.env): AsaasRuntime {
  const apiKey = cleanApiKey(env.ASAAS_API_KEY);
  const kind = keyKind(apiKey);
  const urls = webhookUrls(env);
  const trimmed = (value: string | undefined) => (value ?? "").trim() || null;
  return {
    vercelEnv: trimmed(env.VERCEL_ENV),
    commit: trimmed(env.VERCEL_GIT_COMMIT_SHA)?.slice(0, 7) ?? null,
    deploymentId: trimmed(env.VERCEL_DEPLOYMENT_ID),
    environment: (env.ASAAS_ENVIRONMENT ?? "").trim().toLowerCase() === "production" ? "production" : "sandbox",
    keyKind: kind,
    keyTail: kind === "missing" || apiKey.length < 12 ? null : apiKey.slice(-4),
    apiBaseUrl: readAsaasConfig(env)?.baseUrl ?? null,
    webhookEvents: urls?.events ?? null,
    webhookValidateWithdraw: urls?.validateWithdraw ?? null,
  };
}

type Probe = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Chama a URL do webhook como o Asaas chamaria, mas sem o token: o esperado é
 * 401 vindo do próprio PRX, sem redirecionamento. 3xx quer dizer que o Asaas
 * nunca recebe 200 (ele não aceita redirecionamento como sucesso).
 */
export async function probeWebhookUrl(label: string, url: string, probe: Probe = fetch): Promise<AsaasCheck> {
  const fail = (hint: string): AsaasCheck => ({ label, ok: false, hint });
  try {
    const res = await probe(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (res.status === 401) return { label, ok: true, hint: null };
    if (res.status >= 300 && res.status < 400) {
      const to = res.headers.get("location");
      return fail(`${url} redireciona (${res.status})${to ? ` para ${to}` : ""} antes de chegar ao PRX, e o Asaas só aceita 200. Use ${to ?? "o endereço final"} na variável e faça redeploy.`);
    }
    if (res.status === 503) return fail(`${url} chega ao PRX, mas o deploy que atende esse endereço está sem ASAAS_WEBHOOK_AUTH_TOKEN.`);
    if (res.status === 404 || res.status === 405) return fail(`${url} respondeu ${res.status}: a rota do webhook não está nesse endereço.`);
    return fail(`${url} respondeu ${res.status} a uma chamada sem token; o esperado é 401 do PRX.`);
  } catch (err) {
    return fail(`${url} não respondeu: ${errorMessage(err, "sem resposta").slice(0, 160)}`);
  }
}
