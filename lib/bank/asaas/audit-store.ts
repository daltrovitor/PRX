// Hello World
import { supabaseAdmin } from "@/lib/supabase/client";
import { isUuid } from "@/lib/partners/catalog";
import { AUDIT_OUTCOMES, auditLine, type AuditFilter, type AuditReader, type AuditRecord, type AuditSink } from "@/lib/asaas/audit";

/**
 * Onde ficam os registros das chamadas ao Asaas: tabela asaas_api_requests
 * (migração 20261010) no Supabase; memória em desenvolvimento e nos testes.
 * Gravar nunca lança: sem a tabela, sobra a linha "[prx-asaas]" nos logs.
 */

type SupabaseClient = NonNullable<typeof supabaseAdmin>;
export type AsaasAuditStore = AuditSink & AuditReader;

interface Row {
  id: string;
  correlation_id: string;
  user_id: string | null;
  asaas_account_id: string | null;
  environment: string;
  operation: string;
  business_ref: string | null;
  method: string;
  path: string;
  query: Record<string, unknown> | null;
  auth: string;
  request_body: unknown;
  started_at: string;
  duration_ms: number | null;
  http_status: number | null;
  response_body: unknown;
  error_code: string | null;
  error_description: string | null;
  outcome: string;
  attempts: number;
  asaas_resource_id: string | null;
  response_received: boolean;
}

function toRow(r: AuditRecord): Row {
  return {
    id: r.id,
    correlation_id: r.correlationId,
    user_id: r.userId && isUuid(r.userId) ? r.userId : null,
    asaas_account_id: r.asaasAccountId,
    environment: r.environment,
    operation: r.operation.slice(0, 80),
    business_ref: r.businessRef?.slice(0, 120) ?? null,
    method: r.method,
    path: r.path.slice(0, 300),
    query: r.query,
    auth: r.auth,
    request_body: r.requestBody ?? null,
    started_at: r.startedAt,
    duration_ms: r.durationMs,
    http_status: r.httpStatus,
    response_body: r.responseBody ?? null,
    error_code: r.errorCode?.slice(0, 120) ?? null,
    error_description: r.errorDescription?.slice(0, 1000) ?? null,
    outcome: r.outcome,
    attempts: r.attempts,
    asaas_resource_id: r.asaasResourceId?.slice(0, 120) ?? null,
    response_received: r.responseReceived,
  };
}

function fromRow(r: Row): AuditRecord {
  return {
    id: r.id,
    correlationId: r.correlation_id,
    userId: r.user_id,
    asaasAccountId: r.asaas_account_id,
    environment: r.environment === "production" ? "production" : "sandbox",
    operation: r.operation,
    businessRef: r.business_ref,
    method: r.method,
    path: r.path,
    query: r.query,
    auth: r.auth === "subaccount" ? "subaccount" : r.auth === "none" ? "none" : "master",
    requestBody: r.request_body,
    startedAt: r.started_at,
    durationMs: r.duration_ms,
    httpStatus: r.http_status,
    responseBody: r.response_body,
    errorCode: r.error_code,
    errorDescription: r.error_description,
    outcome: (AUDIT_OUTCOMES as readonly string[]).includes(r.outcome) ? (r.outcome as AuditRecord["outcome"]) : "pending",
    attempts: r.attempts,
    asaasResourceId: r.asaas_resource_id,
    responseReceived: r.response_received,
  };
}

/** Busca livre: só caracteres de identificador (nada que quebre o filtro do PostgREST). */
const SEARCH = /^[A-Za-z0-9_$.-]{3,120}$/;

export class SupabaseAuditStore implements AsaasAuditStore {
  private warned = false;
  constructor(private readonly db: SupabaseClient) {}

  private warn(message: string) {
    if (this.warned) return;
    this.warned = true;
    console.warn(`[prx-asaas] registro não gravado no Supabase (aplique supabase/migrations/20261010_prx_asaas_audit.sql): ${message}`);
  }

  async start(record: AuditRecord) {
    try {
      const { error } = await this.db.from("asaas_api_requests").insert(toRow(record));
      if (error) this.warn(error.message);
    } catch (err) {
      this.warn(err instanceof Error ? err.message : String(err));
    }
  }

  async finish(record: AuditRecord) {
    console.info(auditLine(record));
    try {
      const { error } = await this.db.from("asaas_api_requests").upsert({ ...toRow(record), updated_at: new Date().toISOString() }, { onConflict: "id" });
      if (error) this.warn(error.message);
    } catch (err) {
      this.warn(err instanceof Error ? err.message : String(err));
    }
  }

  async list(filter: AuditFilter) {
    let query = this.db.from("asaas_api_requests").select("*", { count: "exact" }).order("started_at", { ascending: false });
    if (filter.userId) query = query.eq("user_id", filter.userId);
    if (filter.operation) query = query.eq("operation", filter.operation);
    if (filter.environment) query = query.eq("environment", filter.environment);
    if (filter.outcome) query = query.eq("outcome", filter.outcome);
    if (filter.httpStatus) query = query.eq("http_status", filter.httpStatus);
    if (filter.from) query = query.gte("started_at", filter.from);
    if (filter.to) query = query.lte("started_at", filter.to);
    if (filter.search && SEARCH.test(filter.search)) {
      const s = filter.search;
      const byUuid = isUuid(s) ? `id.eq.${s},correlation_id.eq.${s},user_id.eq.${s},` : "";
      query = query.or(`${byUuid}asaas_resource_id.eq.${s},business_ref.eq.${s},asaas_account_id.eq.${s}`);
    }
    const { data, error, count } = await query.range(filter.offset, filter.offset + filter.limit - 1);
    if (error) throw new Error(`Registro de chamadas indisponível: ${error.message}`);
    return { rows: (data as Row[]).map(fromRow), total: count ?? null };
  }

  async get(id: string) {
    if (!isUuid(id)) return null;
    const { data, error } = await this.db.from("asaas_api_requests").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`Registro de chamadas indisponível: ${error.message}`);
    return data ? fromRow(data as Row) : null;
  }

  async related(correlationId: string) {
    if (!isUuid(correlationId)) return [];
    const { data, error } = await this.db.from("asaas_api_requests").select("*").eq("correlation_id", correlationId).order("started_at", { ascending: true }).limit(50);
    if (error) throw new Error(`Registro de chamadas indisponível: ${error.message}`);
    return (data as Row[]).map(fromRow);
  }
}

/** Mesmo comportamento, em memória (desenvolvimento sem Supabase e testes). */
export class MemoryAuditStore implements AsaasAuditStore {
  readonly records = new Map<string, AuditRecord>();

  static shared(): MemoryAuditStore {
    const g = globalThis as unknown as { __prxAsaasAudit?: MemoryAuditStore };
    return (g.__prxAsaasAudit ??= new MemoryAuditStore());
  }

  async start(record: AuditRecord) {
    this.records.set(record.id, { ...record });
  }

  async finish(record: AuditRecord) {
    this.records.set(record.id, { ...record });
  }

  all(): AuditRecord[] {
    return [...this.records.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  async list(filter: AuditFilter) {
    const s = filter.search;
    const rows = this.all().filter(
      (r) =>
        (!filter.userId || r.userId === filter.userId) &&
        (!filter.operation || r.operation === filter.operation) &&
        (!filter.environment || r.environment === filter.environment) &&
        (!filter.outcome || r.outcome === filter.outcome) &&
        (!filter.httpStatus || r.httpStatus === filter.httpStatus) &&
        (!filter.from || r.startedAt >= filter.from) &&
        (!filter.to || r.startedAt <= filter.to) &&
        (!s || [r.id, r.correlationId, r.userId, r.asaasResourceId, r.businessRef, r.asaasAccountId].includes(s))
    );
    return { rows: rows.slice(filter.offset, filter.offset + filter.limit), total: rows.length };
  }

  async get(id: string) {
    return this.records.get(id) ?? null;
  }

  async related(correlationId: string) {
    return this.all()
      .filter((r) => r.correlationId === correlationId)
      .reverse();
  }
}

let override: AsaasAuditStore | null = null;

export function getAsaasAuditStore(): AsaasAuditStore {
  if (override) return override;
  return supabaseAdmin ? new SupabaseAuditStore(supabaseAdmin) : MemoryAuditStore.shared();
}

/** Só para testes. */
export function setAsaasAuditStoreForTests(store: AsaasAuditStore | null): void {
  override = store;
}
