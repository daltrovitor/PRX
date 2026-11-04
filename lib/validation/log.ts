// Hello World
import { supabaseAdmin } from "@/lib/supabase/client";
import { dbError } from "@/lib/partners/errors";
import { launchSchemaReady } from "@/lib/db-features";
import type { Validator } from "@/lib/validation/actor";

/**
 * Registro de toda tentativa de validação na portaria (ingresso) e no balcão
 * (voucher): aceitas e recusadas, com operador, evento e horário. Serve para
 * conferência depois do evento e para notar tentativas de fraude.
 * Guarda só o código lido, nunca o token dinâmico inteiro nem dados pessoais.
 */

export interface ValidationLogEntry {
  id: string;
  kind: "ticket" | "voucher";
  action: "lookup" | "confirm";
  outcome: "accepted" | "refused";
  reason: string;
  code: string;
  refId: string;
  eventId: string | null;
  partnerId: string | null;
  isTest: boolean;
  operatorId: string;
  operatorRole: Validator["role"];
  operatorName: string;
  createdAt: string;
}

export type NewLogEntry = Omit<ValidationLogEntry, "id" | "createdAt" | "operatorId" | "operatorRole" | "operatorName">;

interface LogRow {
  id: string;
  kind: "ticket" | "voucher";
  action: "lookup" | "confirm";
  outcome: "accepted" | "refused";
  reason: string | null;
  code: string | null;
  ref_id: string | null;
  event_id: string | null;
  partner_id: string | null;
  is_test: boolean;
  operator_id: string;
  operator_role: Validator["role"];
  operator_name: string | null;
  created_at: string;
}

const mapRow = (r: LogRow): ValidationLogEntry => ({
  id: r.id,
  kind: r.kind,
  action: r.action,
  outcome: r.outcome,
  reason: r.reason ?? "",
  code: r.code ?? "",
  refId: r.ref_id ?? "",
  eventId: r.event_id,
  partnerId: r.partner_id,
  isTest: r.is_test,
  operatorId: r.operator_id,
  operatorRole: r.operator_role,
  operatorName: r.operator_name ?? "",
  createdAt: r.created_at,
});

const memory = (globalThis as unknown as { __prxValidationLog?: ValidationLogEntry[] }).__prxValidationLog ?? [];
(globalThis as unknown as { __prxValidationLog?: ValidationLogEntry[] }).__prxValidationLog = memory;

const isUuid = (v: string | null) => Boolean(v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v));

/** Grava a tentativa. Nunca bloqueia a validação: falha vira linha no log do servidor. */
export async function recordValidation(validator: Validator, entry: NewLogEntry): Promise<void> {
  const row = {
    kind: entry.kind,
    action: entry.action,
    outcome: entry.outcome,
    reason: entry.reason.slice(0, 300) || null,
    code: entry.code.slice(0, 40) || null,
    ref_id: entry.refId.slice(0, 80) || null,
    event_id: entry.eventId,
    partner_id: entry.partnerId,
    is_test: entry.isTest,
    operator_id: validator.userId,
    operator_role: validator.role,
    operator_name: validator.name.slice(0, 120),
  };
  if (!supabaseAdmin) {
    memory.unshift(mapRow({ ...row, reason: row.reason, id: crypto.randomUUID(), created_at: new Date().toISOString() }));
    memory.splice(10_000);
    return;
  }
  try {
    if (!(await launchSchemaReady())) return;
    const { error } = await supabaseAdmin.from("validation_log").insert({ ...row, event_id: isUuid(row.event_id) ? row.event_id : null });
    if (error) console.warn("[prx:validation-log] não gravado:", error.code);
  } catch {
    console.warn("[prx:validation-log] não gravado");
  }
}

export interface ValidationLogPage {
  entries: ValidationLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ValidationLogFilter {
  page: number;
  pageSize: number;
  kind?: "ticket" | "voucher";
  outcome?: "accepted" | "refused";
  eventId?: string;
  operatorId?: string;
}

/** Página do registro (mais recentes primeiro), com filtros executados no banco. */
export async function listValidations(filter: ValidationLogFilter): Promise<ValidationLogPage> {
  const { page, pageSize } = filter;
  if (!supabaseAdmin) {
    const list = memory.filter(
      (e) =>
        (!filter.kind || e.kind === filter.kind) &&
        (!filter.outcome || e.outcome === filter.outcome) &&
        (!filter.eventId || e.eventId === filter.eventId) &&
        (!filter.operatorId || e.operatorId === filter.operatorId)
    );
    return { entries: list.slice((page - 1) * pageSize, page * pageSize), total: list.length, page, pageSize };
  }
  if (!(await launchSchemaReady())) return { entries: [], total: 0, page, pageSize };
  let query = supabaseAdmin
    .from("validation_log")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (filter.kind) query = query.eq("kind", filter.kind);
  if (filter.outcome) query = query.eq("outcome", filter.outcome);
  if (filter.eventId && isUuid(filter.eventId)) query = query.eq("event_id", filter.eventId);
  if (filter.operatorId) query = query.eq("operator_id", filter.operatorId);
  const { data, error, count } = await query;
  if (error) throw dbError(error, "Não foi possível consultar o registro de validações");
  return { entries: (data as LogRow[]).map(mapRow), total: count ?? 0, page, pageSize };
}
