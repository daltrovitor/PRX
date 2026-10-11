// Hello World
import type { supabaseAdmin } from "@/lib/supabase/client";
import { dbError } from "@/lib/partners/errors";
import { isUuid } from "@/lib/partners/catalog";
import {
  COMMITTED_OUTGOING,
  type AsaasBankStore,
  type NewNotification,
  type NewOutgoing,
  type OutgoingPatch,
  type OutgoingStatus,
  type PendingWebhook,
  type ProvisioningLogEntry,
  type Subaccount,
  type SubaccountPatch,
  type WebhookRecord,
  type WebhookRecordResult,
  roundMoney,
} from "@/lib/bank/asaas/types";
import {
  EMPTY_SUBACCOUNT,
  SUBACCOUNT_COLUMNS,
  mapNotification,
  mapOutgoing,
  mapSubaccount,
  missingColumn,
  warnMissingMigration,
  withoutNewColumns,
  type NotificationRow,
  type OutgoingRow,
  type SubaccountRow,
} from "@/lib/bank/asaas/store-supabase-rows";

type SupabaseClient = NonNullable<typeof supabaseAdmin>;
type DbError = { code?: string; message: string } | null;

/** Grava; se uma coluna da migração 20261010 ainda não existe, grava de novo sem as colunas novas. */
async function tolerant<R extends { error: DbError }>(row: Record<string, unknown>, run: (row: Record<string, unknown>) => PromiseLike<R>): Promise<R> {
  const first = await run(row);
  if (!missingColumn(first.error)) return first;
  warnMissingMigration();
  return run(withoutNewColumns(row));
}

export class SupabaseAsaasBankStore implements AsaasBankStore {
  constructor(private readonly db: SupabaseClient) {}

  async getSubaccount(userId: string) {
    if (!isUuid(userId)) return null;
    const { data, error } = await this.db.from("bank_subaccounts").select("*").eq("id", userId).maybeSingle();
    if (error) throw dbError(error, "Não foi possível consultar a subconta");
    return data ? mapSubaccount(data as SubaccountRow) : null;
  }

  async findSubaccountByAsaasId(asaasAccountId: string) {
    const { data, error } = await this.db.from("bank_subaccounts").select("*").eq("asaas_account_id", asaasAccountId).maybeSingle();
    if (error) throw dbError(error, "Não foi possível consultar a subconta");
    return data ? mapSubaccount(data as SubaccountRow) : null;
  }

  async reserveSubaccount(userId: string, environment: Subaccount["environment"], staleBefore: string) {
    const now = new Date().toISOString();
    const inserted = await this.db.from("bank_subaccounts").insert({ id: userId, environment, provisioning_started_at: now }).select("id");
    if (!inserted.error) return true;
    if (inserted.error.code !== "23505") throw dbError(inserted.error, "Não foi possível reservar a abertura da conta");
    // Subconta de outro ambiente (sandbox antes da produção): recomeça do zero neste.
    const replaced = await tolerant({ ...EMPTY_SUBACCOUNT, environment, provisioning_started_at: now, created_at: now, updated_at: now }, (row) =>
      this.db.from("bank_subaccounts").update(row).eq("id", userId).neq("environment", environment).select("id")
    );
    if (replaced.error) throw dbError(replaced.error, "Não foi possível reservar a abertura da conta");
    if ((replaced.data as unknown[]).length > 0) return true;
    // Já existe: só pega a vez se ainda não foi criada no Asaas e a trava está livre ou esquecida.
    const { data, error } = await this.db
      .from("bank_subaccounts")
      .update({ provisioning_started_at: now, updated_at: now })
      .eq("id", userId)
      .is("asaas_account_id", null)
      .or(`provisioning_started_at.is.null,provisioning_started_at.lt."${staleBefore}"`)
      .select("id");
    if (error) throw dbError(error, "Não foi possível reservar a abertura da conta");
    return (data as unknown[]).length > 0;
  }

  async releaseSubaccount(userId: string) {
    const { error } = await this.db.from("bank_subaccounts").update({ provisioning_started_at: null, updated_at: new Date().toISOString() }).eq("id", userId).is("asaas_account_id", null);
    if (error) throw dbError(error, "Não foi possível liberar a abertura da conta");
  }

  async saveSubaccount(userId: string, patch: SubaccountPatch) {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [key, value] of Object.entries(patch) as Array<[keyof SubaccountPatch, unknown]>) {
      if (value !== undefined) row[SUBACCOUNT_COLUMNS[key]] = value;
    }
    const { data, error } = await tolerant(row, (r) => this.db.from("bank_subaccounts").update(r).eq("id", userId).select("*").single());
    if (error) throw dbError(error, "Não foi possível salvar a subconta");
    return mapSubaccount(data as SubaccountRow);
  }

  async listSubaccountsToReconcile(environment: Subaccount["environment"], limit: number) {
    const { data, error } = await this.db
      .from("bank_subaccounts")
      .select("*")
      .eq("environment", environment)
      .in("status", ["pending_activation", "rejected"])
      .order("updated_at", { ascending: true })
      .limit(limit);
    if (error) throw dbError(error, "Não foi possível listar as subcontas");
    return (data as SubaccountRow[]).map(mapSubaccount);
  }

  async recordWebhook(input: WebhookRecord): Promise<WebhookRecordResult> {
    const { error } = await this.db.from("bank_webhooks_log").insert({
      event_id: input.eventId,
      event_type: input.eventType,
      asaas_account_id: input.asaasAccountId,
      payload: input.payload,
    });
    if (!error) return "new";
    if (error.code !== "23505") throw dbError(error, "Não foi possível registrar o evento");
    const found = await this.db.from("bank_webhooks_log").select("processed_at").eq("event_id", input.eventId).single();
    if (found.error) throw dbError(found.error, "Não foi possível consultar o evento");
    return (found.data as { processed_at: string | null }).processed_at ? "duplicate" : "retry";
  }

  async finishWebhook(eventId: string, failure: string | null) {
    let patch: Record<string, unknown> = { processed_at: new Date().toISOString(), error: null };
    if (failure) {
      const current = await this.db.from("bank_webhooks_log").select("*").eq("event_id", eventId).maybeSingle();
      const attempts = Number((current.data as { attempts?: number } | null)?.attempts ?? 0);
      patch = { error: failure.slice(0, 500), attempts: attempts + 1 };
    }
    const { error } = await tolerant(patch, (row) => this.db.from("bank_webhooks_log").update(row).eq("event_id", eventId));
    if (error) throw dbError(error, "Não foi possível concluir o evento");
  }

  async listPendingWebhooks(before: string, maxAttempts: number, limit: number): Promise<PendingWebhook[]> {
    const base = () => this.db.from("bank_webhooks_log").select("*").is("processed_at", null).lt("received_at", before).order("received_at", { ascending: true }).limit(limit);
    let result = await base().lt("attempts", maxAttempts);
    if (missingColumn(result.error)) result = await base();
    if (result.error) throw dbError(result.error, "Não foi possível listar os eventos pendentes");
    return (result.data as Array<{ event_id: string; payload: unknown; attempts?: number }>).map((r) => ({ eventId: r.event_id, payload: r.payload, attempts: Number(r.attempts ?? 0) }));
  }

  async logProvisioning(entry: ProvisioningLogEntry) {
    const { error } = await this.db.from("bank_provisioning_log").insert({
      user_id: entry.userId,
      environment: entry.environment,
      step: entry.step,
      outcome: entry.outcome,
      asaas_account_id: entry.asaasAccountId,
      detail: entry.detail?.slice(0, 1000) ?? null,
    });
    // Tabela ainda não criada (migração 20261008) ou fora do ar: fica só a linha nos logs da Vercel.
    if (error) console.warn("[prx-bank:abertura] registro não gravado no Supabase:", error.message);
  }

  async insertNotification(input: NewNotification) {
    const { error } = await this.db.from("bank_notifications").insert({
      user_id: input.userId,
      event_type: input.eventType,
      title: input.title.slice(0, 160),
      body: input.body.slice(0, 300),
      amount: input.amount,
      event_id: input.eventId,
    });
    if (!error) return true;
    if (error.code === "23505") return false;
    throw dbError(error, "Não foi possível registrar o aviso");
  }

  async listNotifications(userId: string, limit: number) {
    if (!isUuid(userId)) return [];
    const { data, error } = await this.db.from("bank_notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
    if (error) throw dbError(error, "Não foi possível carregar os avisos");
    return (data as NotificationRow[]).map(mapNotification);
  }

  async markNotificationsRead(userId: string, ids: string[] | "all") {
    let query = this.db.from("bank_notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null);
    if (ids !== "all") query = query.in("id", ids.filter(isUuid));
    const { error } = await query;
    if (error) throw dbError(error, "Não foi possível marcar os avisos como lidos");
  }

  async insertOutgoing(input: NewOutgoing) {
    const { data, error } = await this.db
      .from("bank_outgoing_requests")
      .insert({ user_id: input.userId, kind: input.kind, amount: roundMoney(input.amount), counterparty: input.counterparty.slice(0, 140), target: input.target, description: input.description.slice(0, 140) })
      .select("*")
      .single();
    if (error) throw dbError(error, "Não foi possível registrar a operação");
    return mapOutgoing(data as OutgoingRow);
  }

  async getOutgoing(id: string) {
    if (!isUuid(id)) return null;
    const { data, error } = await this.db.from("bank_outgoing_requests").select("*").eq("id", id).maybeSingle();
    if (error) throw dbError(error, "Não foi possível consultar a operação");
    return data ? mapOutgoing(data as OutgoingRow) : null;
  }

  async findOutgoingByProviderRef(providerRef: string) {
    const { data, error } = await this.db.from("bank_outgoing_requests").select("*").eq("provider_ref", providerRef).maybeSingle();
    if (error) throw dbError(error, "Não foi possível consultar a operação");
    return data ? mapOutgoing(data as OutgoingRow) : null;
  }

  async transitionOutgoing(id: string, from: readonly OutgoingStatus[], to: OutgoingStatus, patch: OutgoingPatch = {}) {
    if (!isUuid(id)) return null;
    const row: Record<string, unknown> = { status: to, updated_at: new Date().toISOString() };
    if (patch.providerRef !== undefined) row.provider_ref = patch.providerRef;
    if (patch.failReason !== undefined) row.fail_reason = patch.failReason?.slice(0, 300) ?? null;
    if (patch.confirmedAt !== undefined) row.confirmed_at = patch.confirmedAt;
    if (patch.outcomeUnknown !== undefined) row.outcome_unknown = patch.outcomeUnknown;
    const { data, error } = await tolerant(row, (r) => this.db.from("bank_outgoing_requests").update(r).eq("id", id).in("status", [...from]).select("*"));
    if (error) throw dbError(error, "Não foi possível atualizar a operação");
    const rows = data as OutgoingRow[];
    return rows.length > 0 ? mapOutgoing(rows[0]) : null;
  }

  async attachProviderRef(id: string, providerRef: string) {
    if (!isUuid(id)) return;
    const { error } = await this.db.from("bank_outgoing_requests").update({ provider_ref: providerRef, updated_at: new Date().toISOString() }).eq("id", id).is("provider_ref", null);
    if (error) throw dbError(error, "Não foi possível vincular a operação ao banco parceiro");
  }

  async outgoingTotalSince(userId: string, sinceIso: string) {
    const { data, error } = await this.db
      .from("bank_outgoing_requests")
      .select("amount")
      .eq("user_id", userId)
      .in("status", [...COMMITTED_OUTGOING])
      .gte("created_at", sinceIso);
    if (error) throw dbError(error, "Não foi possível consultar os limites");
    return roundMoney((data as Array<{ amount: number | string }>).reduce((sum, r) => sum + Number(r.amount), 0));
  }

  async listOpenOutgoing(before: string, limit: number) {
    const { data, error } = await this.db
      .from("bank_outgoing_requests")
      .select("*")
      .in("status", ["requested", "approved"])
      .lt("created_at", before)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) throw dbError(error, "Não foi possível listar as operações em aberto");
    return (data as OutgoingRow[]).map(mapOutgoing);
  }

  async setOutgoingUnknown(id: string, unknown: boolean) {
    if (!isUuid(id)) return;
    const { error } = await this.db.from("bank_outgoing_requests").update({ outcome_unknown: unknown, updated_at: new Date().toISOString() }).eq("id", id);
    if (missingColumn(error)) return warnMissingMigration();
    if (error) throw dbError(error, "Não foi possível marcar a operação");
  }
}
