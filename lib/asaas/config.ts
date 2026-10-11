// Hello World
import crypto from "crypto";

/**
 * Configuração do Asaas (BaaS do PRX BANK), lida só no servidor.
 *
 * O provedor liga apenas com BANK_PROVIDER=asaas e uma chave coerente com o
 * ambiente: chave de homologação ($aact_hmlg_) nunca fala com produção e
 * vice-versa. A URL base só aceita os hosts oficiais do Asaas, para que uma
 * variável mal configurada não mande a chave da conta mãe para outro servidor.
 */

export type AsaasEnvironment = "sandbox" | "production";

export interface AsaasConfig {
  apiKey: string;
  baseUrl: string;
  environment: AsaasEnvironment;
}

const DEFAULT_BASE_URL: Record<AsaasEnvironment, string> = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  production: "https://api.asaas.com/v3",
};

const HOSTS: Record<AsaasEnvironment, ReadonlySet<string>> = {
  sandbox: new Set(["api-sandbox.asaas.com", "sandbox.asaas.com"]),
  production: new Set(["api.asaas.com", "www.asaas.com"]),
};

type Env = Record<string, string | undefined>;

/** URL base validada (https, host oficial do ambiente, caminho terminando em /v3). */
export function resolveBaseUrl(raw: string | undefined, environment: AsaasEnvironment): string | null {
  if (!raw?.trim()) return DEFAULT_BASE_URL[environment];
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !HOSTS[environment].has(url.hostname) || url.search || url.hash) return null;
  const path = url.pathname.replace(/\/+$/, "");
  if (!path.endsWith("/v3")) return null;
  return `${url.origin}${path}`;
}

/** Prefixo da chave diz o ambiente dela; chave sem prefixo conhecido é aceita (contas antigas). */
function keyEnvironment(apiKey: string): AsaasEnvironment | null {
  if (apiKey.startsWith("$aact_hmlg_")) return "sandbox";
  if (apiKey.startsWith("$aact_prod_")) return "production";
  return null;
}

let warned = false;
function warnOnce(message: string): void {
  if (warned) return;
  warned = true;
  console.warn(`[asaas] ${message}`);
}

/**
 * Chave como foi colada: sem aspas em volta e sem a barra de escape do .env
 * ("\$aact_..."), que na Vercel vira parte do valor.
 */
export function cleanApiKey(raw: string | undefined): string {
  return (raw ?? "")
    .trim()
    .replace(/^(["'])(.*)\1$/, "$2")
    .trim()
    .replace(/^\\(?=\$aact_)/, "");
}

const otherEnvironment = (environment: AsaasEnvironment): AsaasEnvironment => (environment === "production" ? "sandbox" : "production");

/** Configuração ativa do Asaas, ou null quando o PRX BANK não usa o Asaas neste ambiente. */
export function readAsaasConfig(env: Env = process.env): AsaasConfig | null {
  const provider = (env.BANK_PROVIDER ?? "").trim().toLowerCase();
  const apiKey = cleanApiKey(env.ASAAS_API_KEY);
  // Chave ausente, vazia ou placeholder: Asaas não liga
  if (!apiKey || apiKey.includes("coloque_sua_chave") || apiKey.includes("your_")) return null;
  // Só liga se BANK_PROVIDER for 'asaas'
  if (provider !== "asaas") return null;
  if (!apiKey.startsWith("$aact_")) {
    if (apiKey) warnOnce("ASAAS_API_KEY não parece uma chave do Asaas (esperado $aact_...; no .env escreva \\$aact_...). Integração desligada.");
    return null;
  }
  const environment: AsaasEnvironment = (env.ASAAS_ENVIRONMENT ?? "").trim().toLowerCase() === "production" ? "production" : "sandbox";

  const keyEnv = keyEnvironment(apiKey);
  if (keyEnv && keyEnv !== environment) {
    warnOnce(`ASAAS_API_KEY é de ${keyEnv} mas ASAAS_ENVIRONMENT=${environment}. Integração desligada.`);
    return null;
  }
  let baseUrl = resolveBaseUrl(env.ASAAS_API_URL, environment);
  // URL oficial do outro ambiente esquecida (ex.: a do sandbox na produção): vale a do ambiente da chave.
  if (!baseUrl && resolveBaseUrl(env.ASAAS_API_URL, otherEnvironment(environment))) {
    warnOnce(`ASAAS_API_URL é do ${otherEnvironment(environment)}; usando ${DEFAULT_BASE_URL[environment]}. Corrija ou apague a variável.`);
    baseUrl = DEFAULT_BASE_URL[environment];
  }
  if (!baseUrl) {
    warnOnce("ASAAS_API_URL inválida (precisa ser https, host oficial do Asaas para o ambiente e terminar em /v3). Integração desligada.");
    return null;
  }
  return { apiKey, baseUrl, environment };
}

export interface AsaasCheck {
  label: string;
  ok: boolean;
  /** O que fazer quando não está ok (nunca mostra o valor da variável). */
  hint: string | null;
}

/** Diagnóstico das variáveis do PRX BANK para o painel admin, sem expor segredos. */
export function asaasChecklist(env: Env = process.env): AsaasCheck[] {
  const check = (label: string, ok: boolean, hint: string): AsaasCheck => ({ label, ok, hint: ok ? null : hint });
  const provider = (env.BANK_PROVIDER ?? "").trim().toLowerCase();
  const environment: AsaasEnvironment = (env.ASAAS_ENVIRONMENT ?? "").trim().toLowerCase() === "production" ? "production" : "sandbox";
  const rawKey = (env.ASAAS_API_KEY ?? "").trim();
  const apiKey = cleanApiKey(rawKey);
  const keyEnv = keyEnvironment(apiKey);
  const prefix = environment === "production" ? "$aact_prod_" : "$aact_hmlg_";
  const url = (env.ASAAS_API_URL ?? "").trim();
  const urlOk = !url || resolveBaseUrl(url, environment) !== null || resolveBaseUrl(url, otherEnvironment(environment)) !== null;
  const encryption = (env.BANK_ENCRYPTION_KEY ?? "").trim();
  const baasMode = (env.PRX_BAAS_MODE ?? "").trim();

  let keyHint = `Cole em ASAAS_API_KEY a chave ${prefix}... da conta mãe (na Vercel, sem a barra \\).`;
  if (apiKey && !apiKey.startsWith("$aact_")) keyHint = "O valor não é uma chave do Asaas (ela começa com $aact_). Na Vercel, cole sem aspas e sem a barra \\.";
  else if (keyEnv && keyEnv !== environment) keyHint = `A chave é de ${keyEnv === "production" ? "produção" : "sandbox"}, mas ASAAS_ENVIRONMENT=${environment}. Use a chave ${prefix}... ou mude o ambiente.`;

  return [
    check("BANK_PROVIDER = asaas", provider === "asaas", `Defina BANK_PROVIDER=asaas (hoje: ${provider || "vazio"}).`),
    check(`ASAAS_ENVIRONMENT = ${environment}`, environment === "production", "Para dinheiro real, defina ASAAS_ENVIRONMENT=production."),
    check("ASAAS_API_KEY da conta mãe", Boolean(apiKey) && apiKey.startsWith("$aact_") && (!keyEnv || keyEnv === environment) && !apiKey.includes("coloque_sua_chave") && !apiKey.includes("your_"), keyHint),
    check("ASAAS_API_URL", urlOk, "Apague ASAAS_API_URL ou use https://api.asaas.com/v3."),
    check("ASAAS_WEBHOOK_AUTH_TOKEN (32+ caracteres)", webhookAuthToken(env) !== null, "Defina o mesmo token usado nos webhooks do Asaas, com 32 caracteres ou mais."),
    check(
      "URLs dos webhooks (https)",
      webhookUrls(env) !== null,
      "Defina ASAAS_WEBHOOK_URL_EVENTS=https://www.prx.app.br/api/bank/webhooks/asaas e ASAAS_WEBHOOK_URL_VALIDATE_WITHDRAW=https://www.prx.app.br/api/bank/webhooks/validate-withdraw. Não use https://prx.app.br: ele redireciona (308) para o www e o Asaas só aceita resposta 200."
    ),
    check("BANK_ENCRYPTION_KEY (32+ caracteres)", encryption.length >= 32, "Gere com openssl rand -base64 48 e não troque depois de abrir contas."),
    check("PRX_BAAS_MODE apagado", !baasMode || environment === "production", "Apague PRX_BAAS_MODE: ele liga o sandbox com saldo fictício."),
  ];
}

/** Token que o Asaas manda no header asaas-access-token dos webhooks (32+ caracteres). */
export function webhookAuthToken(env: Env = process.env): string | null {
  const token = (env.ASAAS_WEBHOOK_AUTH_TOKEN ?? "").trim();
  return token.length >= 32 && !token.includes("your_webhook") ? token : null;
}

/** Compara o header do webhook com o token configurado, em tempo constante. */
export function webhookTokenMatches(header: string | null, expected: string | null = webhookAuthToken()): boolean {
  if (!header || !expected) return false;
  const a = crypto.createHash("sha256").update(header).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

/** URLs públicas dos webhooks PRX registradas em cada subconta. */
export function webhookUrls(env: Env = process.env): { events: string; validateWithdraw: string } | null {
  const origin = (env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/+$/, "");
  const events = (env.ASAAS_WEBHOOK_URL_EVENTS ?? "").trim() || (origin ? `${origin}/api/bank/webhooks/asaas` : "");
  const validateWithdraw = (env.ASAAS_WEBHOOK_URL_VALIDATE_WITHDRAW ?? "").trim() || (origin ? `${origin}/api/bank/webhooks/validate-withdraw` : "");
  const httpsOnly = (u: string) => /^https:\/\/[^\s/]+\/\S*$/.test(u);
  if (!httpsOnly(events) || !httpsOnly(validateWithdraw)) return null;
  return { events, validateWithdraw };
}
