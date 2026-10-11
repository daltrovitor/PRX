// Hello World
import type { NextRequest } from "next/server";
import type { SessionPayload } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/client";
import { clientIp } from "@/lib/partners/http";
import { dbError } from "@/lib/partners/errors";
import { launchSchemaReady } from "@/lib/db-features";

/**
 * Auditoria do admin: quem fez o quê, em quê e quando. Grava ações críticas
 * (publicar/cancelar evento, confirmar pagamento, cupom, equipe, papéis).
 * Nunca guarda senha, token ou documento completo: só o resumo da ação.
 * Falha ao gravar não desfaz a ação (fica a linha "[prx:audit]" nos logs).
 */

export interface AuditEntry {
  id: string;
  actorId: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  meta: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditInput {
  action: string;
  targetType?: string;
  targetId?: string;
  summary: string;
  meta?: Record<string, unknown>;
}

interface AuditRow {
  id: string;
  actor_id: string;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  summary: string;
  meta: Record<string, unknown> | null;
  created_at: string;
}

const memory = (globalThis as unknown as { __prxAudit?: AuditEntry[] }).__prxAudit ?? [];
(globalThis as unknown as { __prxAudit?: AuditEntry[] }).__prxAudit = memory;

const mapRow = (r: AuditRow): AuditEntry => ({
  id: r.id,
  actorId: r.actor_id,
  actorEmail: r.actor_email ?? "",
  action: r.action,
  targetType: r.target_type ?? "",
  targetId: r.target_id ?? "",
  summary: r.summary,
  meta: r.meta,
  createdAt: r.created_at,
});

export async function recordAdminAction(actor: Pick<SessionPayload, "sub" | "email">, input: AuditInput, req?: NextRequest): Promise<void> {
  const entry = {
    actor_id: actor.sub,
    actor_email: (actor.email || "").toLowerCase() || null,
    action: input.action.slice(0, 80),
    target_type: input.targetType?.slice(0, 40) ?? null,
    target_id: input.targetId?.slice(0, 120) ?? null,
    summary: input.summary.slice(0, 500),
    meta: input.meta ?? null,
    ip: req ? clientIp(req) : null,
  };
  if (!supabaseAdmin) {
    memory.unshift(mapRow({ ...entry, id: crypto.randomUUID(), created_at: new Date().toISOString() }));
    memory.splice(5000);
    return;
  }
  if (!(await launchSchemaReady())) {
    console.info(`[prx:audit] ${entry.action} ${entry.target_type ?? ""}:${entry.target_id ?? ""} por ${entry.actor_id} (tabela ainda não criada)`);
    return;
  }
  const { error } = await supabaseAdmin.from("admin_audit_log").insert(entry);
  if (error) console.warn("[prx:audit] não gravado:", error.code, error.message);
}

export interface AuditPage {
  entries: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
}

/** Página do registro, mais recentes primeiro. Filtros executados no banco. */
export async function listAdminActions(filter: { page: number; pageSize: number; action?: string; targetType?: string; actor?: string }): Promise<AuditPage> {
  const { page, pageSize } = filter;
  if (!supabaseAdmin) {
    const list = memory.filter(
      (e) =>
        (!filter.action || e.action === filter.action) &&
        (!filter.targetType || e.targetType === filter.targetType) &&
        (!filter.actor || e.actorEmail.includes(filter.actor.toLowerCase()))
    );
    return { entries: list.slice((page - 1) * pageSize, page * pageSize), total: list.length, page, pageSize };
  }
  if (!(await launchSchemaReady())) return { entries: [], total: 0, page, pageSize };
  let query = supabaseAdmin
    .from("admin_audit_log")
    .select("id, actor_id, actor_email, action, target_type, target_id, summary, meta, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (filter.action) query = query.eq("action", filter.action);
  if (filter.targetType) query = query.eq("target_type", filter.targetType);
  if (filter.actor) query = query.ilike("actor_email", `%${filter.actor.toLowerCase().replace(/[%_\\]/g, "")}%`);
  const { data, error, count } = await query;
  if (error) throw dbError(error, "Não foi possível consultar a auditoria");
  return { entries: (data as AuditRow[]).map(mapRow), total: count ?? 0, page, pageSize };
}
