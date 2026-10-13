// Hello World
import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "crypto";
import type { AsaasEnvironment } from "@/lib/asaas/config";
import type { AuditOutcome } from "@/lib/asaas/audit-outcomes";
import { bankLog } from "@/lib/asaas/log";

export { AUDIT_OUTCOMES, type AuditOutcome } from "@/lib/asaas/audit-outcomes";

/**
 * Registro central de cada chamada do PRX ao Asaas (tabela asaas_api_requests).
 * O AsaasClient abre um registro antes de enviar e o fecha com a resposta (ou
 * a falha): quem chamou não precisa repassar nada além do contexto de negócio,
 * que viaja por AsyncLocalStorage (membro, subconta, pedido). Falha ao gravar
 * nunca derruba nem repete a operação: o registro é melhor esforço e tem os
 * logs da Vercel (JSON "asaas.request", lib/asaas/log.ts) como segunda trilha.
 */

export interface AuditContext {
  userId?: string | null;
  asaasAccountId?: string | null;
  /** Operação de negócio: id do pedido de saída, da cobrança, do cadastro… */
  businessRef?: string | null;
  /** Agrupa as chamadas de uma mesma ação (ex.: abrir conta = procurar + criar + documentos). */
  correlationId?: string;
}

export interface AuditRecord {
  id: string;
  correlationId: string;
  userId: string | null;
  asaasAccountId: string | null;
  environment: AsaasEnvironment;
  operation: string;
  businessRef: string | null;
  method: string;
  path: string;
  query: Record<string, unknown> | null;
  auth: "master" | "subaccount" | "none";
  requestBody: unknown;
  startedAt: string;
  durationMs: number | null;
  httpStatus: number | null;
  responseBody: unknown;
  errorCode: string | null;
  errorDescription: string | null;
  outcome: AuditOutcome;
  attempts: number;
  /** Id do recurso no Asaas (subconta, transferência, chave…), quando a resposta traz. */
  asaasResourceId: string | null;
  /** O Asaas respondeu (qualquer status) e o corpo foi lido. */
  responseReceived: boolean;
}

export interface AuditFilter {
  userId?: string;
  operation?: string;
  environment?: AsaasEnvironment;
  outcome?: AuditOutcome;
  httpStatus?: number;
  from?: string;
  to?: string;
  /** Id interno, correlação, recurso do Asaas ou pedido de negócio. */
  search?: string;
  limit: number;
  offset: number;
}

export interface AuditSink {
  /** Grava o registro "pending" antes do envio. Nunca lança. */
  start(record: AuditRecord): Promise<void>;
  /** Grava o desfecho. Nunca lança. */
  finish(record: AuditRecord): Promise<void>;
}

export interface AuditReader {
  list(filter: AuditFilter): Promise<{ rows: AuditRecord[]; total: number | null }>;
  get(id: string): Promise<AuditRecord | null>;
  /** Chamadas da mesma ação (mesma correlação), em ordem. */
  related(correlationId: string): Promise<AuditRecord[]>;
}

const storage = new AsyncLocalStorage<AuditContext>();

/** Roda `fn` com o contexto de negócio somado ao atual (o mais interno vence). */
export function withAsaasAudit<T>(context: AuditContext, fn: () => Promise<T>): Promise<T> {
  const parent = storage.getStore() ?? {};
  const merged: AuditContext = { ...parent, ...Object.fromEntries(Object.entries(context).filter(([, v]) => v !== undefined)) };
  merged.correlationId ??= crypto.randomUUID();
  return storage.run(merged, fn);
}

export function currentAuditContext(): AuditContext {
  return storage.getStore() ?? {};
}

export function newAuditRecord(input: Pick<AuditRecord, "environment" | "operation" | "method" | "path" | "query" | "auth" | "requestBody">): AuditRecord {
  const ctx = currentAuditContext();
  return {
    id: crypto.randomUUID(),
    correlationId: ctx.correlationId ?? crypto.randomUUID(),
    userId: ctx.userId ?? null,
    asaasAccountId: ctx.asaasAccountId ?? null,
    businessRef: ctx.businessRef ?? null,
    startedAt: new Date().toISOString(),
    durationMs: null,
    httpStatus: null,
    responseBody: null,
    errorCode: null,
    errorDescription: null,
    outcome: "pending",
    attempts: 0,
    asaasResourceId: null,
    responseReceived: false,
    ...input,
  };
}

/** Linha estruturada nos logs da Vercel (sem corpos): mesma correlação e id do registro no Supabase. */
export function logAuditRecord(record: AuditRecord): void {
  bankLog(record.outcome === "success" ? "info" : record.outcome === "pending" ? "warn" : "error", "asaas.request", {
    correlationId: record.correlationId,
    step: record.operation,
    method: record.method,
    endpoint: `/v3${record.path}`,
    httpStatus: record.httpStatus,
    durationMs: record.durationMs,
    outcome: record.outcome,
    errorCode: record.errorCode,
    error: record.errorDescription,
    userId: record.userId,
    localId: record.businessRef ?? record.id,
    asaasId: record.asaasResourceId ?? record.asaasAccountId,
    environment: record.environment,
    detail: `tentativas=${record.attempts} registro=${record.id}`,
  });
}

/** Registro de algo que o PRX decidiu não enviar ao Asaas (regra ou configuração). */
export async function recordNotSent(sink: AuditSink | null, input: { environment: AsaasEnvironment; operation: string; method: string; path: string; reason: string }): Promise<void> {
  const record = newAuditRecord({ environment: input.environment, operation: input.operation, method: input.method, path: input.path, query: null, auth: "none", requestBody: null });
  const done: AuditRecord = { ...record, outcome: "not_sent", durationMs: 0, errorCode: "not_sent", errorDescription: input.reason.slice(0, 1000) };
  logAuditRecord(done);
  await sink?.finish(done);
}
