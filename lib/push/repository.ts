// Hello World
import { supabaseAdmin } from "@/lib/supabase/client";
import { isMissingTable } from "@/lib/partners/errors";

/**
 * Inscrições de notificação no celular (Web Push). Uma por aparelho/navegador:
 * o endpoint é único. Sem a migração 20261019, nada é gravado e o envio vira
 * no-op (o app segue com os avisos internos).
 */

export const PUSH_MIGRATION = "20261019_prx_resenha_convites_push.sql";

export interface PushSubscriptionRecord {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string;
  createdAt: string;
}

const memory = (): Map<string, PushSubscriptionRecord> => ((globalThis as unknown as { __prxPush?: Map<string, PushSubscriptionRecord> }).__prxPush ??= new Map());

/** Grava (ou move para esta conta) a inscrição do aparelho. false = tabela ainda não existe. */
export async function saveSubscription(record: Omit<PushSubscriptionRecord, "createdAt">): Promise<boolean> {
  if (!supabaseAdmin) {
    memory().set(record.endpoint, { ...record, createdAt: new Date().toISOString() });
    return true;
  }
  const { error } = await supabaseAdmin
    .from("push_subscriptions")
    .upsert({ user_id: record.userId, endpoint: record.endpoint, p256dh: record.p256dh, auth: record.auth, user_agent: record.userAgent.slice(0, 300), last_seen_at: new Date().toISOString() }, { onConflict: "endpoint" });
  if (isMissingTable(error)) return false;
  if (error) throw new Error(`push_subscriptions: ${error.code ?? "?"} ${error.message ?? ""}`);
  return true;
}

export async function listSubscriptions(userId: string): Promise<PushSubscriptionRecord[]> {
  if (!supabaseAdmin) return [...memory().values()].filter((s) => s.userId === userId);
  const { data, error } = await supabaseAdmin.from("push_subscriptions").select("user_id, endpoint, p256dh, auth, user_agent, created_at").eq("user_id", userId);
  if (error) return [];
  return ((data ?? []) as Array<Record<string, string>>).map((r) => ({ userId: r.user_id, endpoint: r.endpoint, p256dh: r.p256dh, auth: r.auth, userAgent: r.user_agent ?? "", createdAt: r.created_at }));
}

/** Remove a inscrição (desativada pela pessoa ou expirada no provedor). Com userId, só a da própria conta. */
export async function deleteSubscription(endpoint: string, userId?: string): Promise<void> {
  if (!supabaseAdmin) {
    const current = memory().get(endpoint);
    if (current && (!userId || current.userId === userId)) memory().delete(endpoint);
    return;
  }
  let q = supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (userId) q = q.eq("user_id", userId);
  await q;
}

/** Só para testes. */
export function resetPushMemory(): void {
  memory().clear();
}
