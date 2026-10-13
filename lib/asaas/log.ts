// Hello World
import { scrubText } from "@/lib/asaas/sanitize";

/**
 * Logs estruturados do PRX BANK: uma linha JSON por evento nos logs da Vercel,
 * filtrável pelo correlationId (o mesmo de asaas_api_requests).
 *
 * Escreve direto em stdout/stderr porque o build de produção apaga as chamadas
 * a `console.*` (next.config.ts → compiler.removeConsole): sem isso, nenhuma
 * linha do banco chegava à Vercel.
 *
 * Nunca recebe chave, token, documento, imagem nem CPF inteiro: todo texto passa
 * por scrubText e o membro é identificado só pelo id interno.
 */

export type BankLogLevel = "info" | "warn" | "error";

export interface BankLogFields {
  correlationId?: string | null;
  /** Etapa executada (ex.: account.create, kyc.submit, webhook.events). */
  step?: string | null;
  method?: string | null;
  /** Caminho da API do Asaas ou rota do PRX (sem query). */
  endpoint?: string | null;
  httpStatus?: number | null;
  durationMs?: number | null;
  outcome?: string | null;
  errorCode?: string | null;
  /** Mensagem de erro (sanitizada aqui). */
  error?: string | null;
  /** Id interno do membro (uuid do Supabase). */
  userId?: string | null;
  /** Id da operação no banco local (pedido, abertura, registro de auditoria). */
  localId?: string | null;
  /** Id correspondente no Asaas (subconta, transferência, evento). */
  asaasId?: string | null;
  environment?: string | null;
  detail?: string | null;
}

const MAX_TEXT = 500;

function clean(value: unknown): unknown {
  if (typeof value === "string") return scrubText(value).slice(0, MAX_TEXT);
  return value;
}

/** Ambiente da Vercel e commit do deploy que escreveu a linha (diz se a configuração nova já entrou). */
export function deployTag(env: Record<string, string | undefined> = process.env): string {
  const target = (env.VERCEL_ENV ?? "").trim() || "local";
  const sha = (env.VERCEL_GIT_COMMIT_SHA ?? "").trim().slice(0, 7);
  return sha ? `${target}@${sha}` : target;
}

export function bankLogLine(level: BankLogLevel, event: string, fields: BankLogFields, now = new Date()): string {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined && v !== null && v !== "");
  return JSON.stringify({ ts: now.toISOString(), level, scope: "prx-bank", event, deploy: deployTag(), ...Object.fromEntries(entries.map(([k, v]) => [k, clean(v)])) });
}

type BankLogSink = (level: BankLogLevel, line: string) => void;

/** stdout para info, stderr para avisos e erros (a Vercel separa os níveis por aí). PRX_BANK_LOG=off silencia (testes). */
const streamSink: BankLogSink = (level, line) => {
  if ((process.env.PRX_BANK_LOG ?? "").trim().toLowerCase() === "off") return;
  (level === "info" ? process.stdout : process.stderr).write(`${line}\n`);
};

let sink: BankLogSink = streamSink;

/** Troca o destino das linhas (testes); null volta para stdout/stderr. */
export function setBankLogSink(next: BankLogSink | null): void {
  sink = next ?? streamSink;
}

/** Grava a linha; falha de escrita nunca derruba a operação. */
export function bankLog(level: BankLogLevel, event: string, fields: BankLogFields = {}): void {
  try {
    sink(level, bankLogLine(level, event, fields));
  } catch {
    // sem saída disponível: o registro no Supabase continua sendo a trilha principal
  }
}
