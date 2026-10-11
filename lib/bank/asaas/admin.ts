// Hello World
import { supabaseAdmin } from "@/lib/supabase/client";
import { isUuid } from "@/lib/partners/catalog";
import { errorMessage } from "@/lib/errors";
import { withAsaasAudit, type AuditFilter, type AuditRecord } from "@/lib/asaas/audit";
import { diagnose, type Diagnosis } from "@/lib/asaas/diagnosis";
import { decryptSecret } from "@/lib/asaas/secrets";
import { listDocuments } from "@/lib/asaas/accounts";
import { getAsaasAuditStore } from "@/lib/bank/asaas/audit-store";
import type { AsaasDeps } from "@/lib/bank/asaas/deps";
import { fetchStatusSnapshot, type StatusSnapshot } from "@/lib/bank/asaas/account-status";
import { getAsaasBankStore } from "@/lib/bank/asaas/store";
import type { OutgoingRequest, ProvisioningLogEntry, Subaccount } from "@/lib/bank/asaas/types";
import { subaccountWebhookHealth, type WebhookHealth } from "@/lib/bank/asaas/webhook-sync";

/**
 * Dados do painel admin "Asaas": registro das chamadas, diagnóstico de cada uma
 * e o estado de negócio ligado a ela (subconta, pedido de saída). Nada aqui
 * devolve chave de API ou token: a subconta aparece só com "tem chave".
 */

export type SubaccountSummary = Omit<Subaccount, "apiKeySealed"> & { hasApiKey: boolean };

export function summarize(sub: Subaccount | null): SubaccountSummary | null {
  if (!sub) return null;
  const { apiKeySealed, ...rest } = sub;
  return { ...rest, hasApiKey: Boolean(apiKeySealed) };
}

/** UUID direto ou e-mail do cadastro do PRX BANK (bank_kyc_applications). */
export async function resolveUserId(input: string | null | undefined): Promise<string | null> {
  const value = (input ?? "").trim();
  if (!value) return null;
  if (isUuid(value as string | null)) return value;
  if (!value.includes("@") || !supabaseAdmin) return null;
  const { data } = await supabaseAdmin.from("bank_kyc_applications").select("user_id").ilike("email", value).order("created_at", { ascending: false }).limit(1);
  return (data as Array<{ user_id: string }> | null)?.[0]?.user_id ?? null;
}

export async function listRequests(filter: AuditFilter): Promise<{ rows: Array<AuditRecord & { httpState: Diagnosis["httpState"] }>; total: number | null }> {
  const { rows, total } = await getAsaasAuditStore().list(filter);
  return { rows: rows.map((r) => ({ ...r, httpState: diagnose(r).httpState })), total };
}

export interface RequestDetail {
  record: AuditRecord;
  diagnosis: Diagnosis;
  /** Outras chamadas da mesma ação (mesma correlação), em ordem. */
  related: AuditRecord[];
  /** Estado de negócio atual, separado do HTTP. */
  business: { subaccount: SubaccountSummary | null; outgoing: OutgoingRequest | null };
}

export async function requestDetail(id: string): Promise<RequestDetail | null> {
  const audit = getAsaasAuditStore();
  const record = await audit.get(id);
  if (!record) return null;
  const store = getAsaasBankStore();
  const [related, sub, outgoing] = await Promise.all([
    audit.related(record.correlationId),
    record.userId ? store.getSubaccount(record.userId).catch(() => null) : Promise.resolve(null),
    record.businessRef && isUuid(record.businessRef) ? store.getOutgoing(record.businessRef).catch(() => null) : Promise.resolve(null),
  ]);
  return { record, diagnosis: diagnose(record), related, business: { subaccount: summarize(sub), outgoing } };
}

/** Parte consultada ao vivo no Asaas: falha vira mensagem, sem derrubar o resto. */
type Live<T> = { ok: true; value: T } | { ok: false; error: string };

async function live<T>(task: () => Promise<T>): Promise<Live<T>> {
  try {
    return { ok: true, value: await task() };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "falha na consulta") };
  }
}

export interface MemberDiagnostics {
  userId: string;
  subaccount: SubaccountSummary | null;
  provisioning: Array<ProvisioningLogEntry & { createdAt: string }>;
  /** Situação no Asaas agora (GET /myAccount/status), webhook e documentos pedidos. */
  live: {
    status: Live<StatusSnapshot> | null;
    webhook: Live<WebhookHealth> | null;
    documents: Live<{ rejectReasons: string | null; groups: Array<{ id: string; type: string; status: string; viaLink: boolean; title: string | null }> }> | null;
  };
}

export async function memberDiagnostics(userId: string, deps: AsaasDeps): Promise<MemberDiagnostics> {
  const sub = await deps.store.getSubaccount(userId);
  const provisioning = await deps.store.listProvisioning(userId, 25).catch(() => []);
  const sameEnv = sub && sub.environment === deps.client.environment;
  const apiKey = sameEnv && sub.asaasAccountId && sub.apiKeySealed ? decryptSecret(sub.apiKeySealed) : null;
  if (!apiKey) return { userId, subaccount: summarize(sub), provisioning, live: { status: null, webhook: null, documents: null } };
  const [status, webhook, documents] = await withAsaasAudit({ userId, asaasAccountId: sub?.asaasAccountId ?? null }, () =>
    Promise.all([
      live(() => fetchStatusSnapshot(apiKey, deps)),
      live(() => subaccountWebhookHealth(userId, deps)),
      live(async () => {
        const docs = await listDocuments(deps.client, apiKey);
        return { rejectReasons: docs.rejectReasons, groups: docs.data.map((g) => ({ id: g.id, type: g.type, status: g.status, viaLink: Boolean(g.onboardingUrl), title: g.title })) };
      }),
    ])
  );
  return { userId, subaccount: summarize(sub), provisioning, live: { status, webhook, documents } };
}
