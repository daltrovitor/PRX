// Hello World
import type { supabaseAdmin } from "@/lib/supabase/client";
import { dbError } from "@/lib/partners/errors";
import { isUuid } from "@/lib/partners/catalog";
import {
  COMMITTED_OUTGOING,
  OUTGOING_KINDS,
  OUTGOING_STATUSES,
  SUBACCOUNT_KYC_STATUSES,
  SUBACCOUNT_STATUSES,
  roundMoney,
  type AsaasBankStore,
  type BankNotification,
  type NewNotification,
  type NewOutgoing,
  type OutgoingPatch,
  type OutgoingRequest,
  type OutgoingStatus,
  type Subaccount,
  type SubaccountPatch,
  type WebhookRecord,
  type WebhookRecordResult,
} from "@/lib/bank/asaas/types";

type SupabaseClient = NonNullable<typeof supabaseAdmin>;

const oneOf = <T extends string>(list: readonly T[], value: unknown, fallback: T): T => (list.includes(value as T) ? (value as T) : fallback);

interface SubaccountRow {
  id: string;
  asaas_account_id: string | null;
  wallet_id: string | null;
  api_key: string | null;
  asaas_customer_id: string | null;
  account_number: string | null;
  agency: string | null;
  status: string;
  kyc_status: string;
  reject_reason: string | null;
  environment: string;
  provisioning_started_at: string | null;
  created_at: string;
}

function mapSubaccount(r: SubaccountRow): Subaccount {
  return {
    userId: r.id,
    asaasAccountId: r.asaas_account_id,
    walletId: r.wallet_id,
    apiKeySealed: r.api_key,
    customerId: r.asaas_customer_id,
    accountNumber: r.account_number,
    agency: r.agency,
    status: oneOf(SUBACCOUNT_STATUSES, r.status, "pending_activation"),
    kycStatus: oneOf(SUBACCOUNT_KYC_STATUSES, r.kyc_status, "PENDING"),
    rejectReason: r.reject_reason,
    environment: r.environment === "production" ? "production" : "sandbox",
    provisioningStartedAt: r.provisioning_started_at,
    createdAt: r.created_at,
  };
}

/** Subconta ainda não criada no Asaas. */
const EMPTY_SUBACCOUNT = {
  asaas_account_id: null,
  wallet_id: null,
  api_key: null,
  asaas_customer_id: null,
  account_number: null,
  agency: null,
  status: "pending_activation",
  kyc_status: "PENDING",
  reject_reason: null,
} as const;

const SUBACCOUNT_COLUMNS: Record<keyof SubaccountPatch, keyof SubaccountRow> = {
  asaasAccountId: "asaas_account_id",
  walletId: "wallet_id",
  apiKeySealed: "api_key",
  customerId: "asaas_customer_id",
  accountNumber: "account_number",
  agency: "agency",
  status: "status",
  kycStatus: "kyc_status",
  rejectReason: "reject_reason",
  provisioningStartedAt: "provisioning_started_at",
};

interface OutgoingRow {
  id: string;
  user_id: string;
  kind: string;
  amount: number | string;
  counterparty: string;
  target: string;
  description: string;
  status: string;
  provider_ref: string | null;
  fail_reason: string | null;
  confirmed_at: string | null;
  created_at: string;
}

function mapOutgoing(r: OutgoingRow): OutgoingRequest {
  return {
    id: r.id,
    userId: r.user_id,
    kind: oneOf(OUTGOING_KINDS, r.kind, "pix_key"),
    amount: roundMoney(r.amount),
    counterparty: r.counterparty,
    target: r.target,
    description: r.description,
    status: oneOf(OUTGOING_STATUSES, r.status, "failed"),
    providerRef: r.provider_ref,
    failReason: r.fail_reason,
    confirmedAt: r.confirmed_at,
    createdAt: r.created_at,
  };
}

interface NotificationRow {
  id: string;
  user_id: string;
  event_type: string;
  title: string;
  body: string;
  amount: number | string | null;
  read_at: string | null;
  created_at: string;
}

function mapNotification(r: NotificationRow): BankNotification {
  return {
    id: r.id,
    userId: r.user_id,
    eventType: r.event_type,
    title: r.title,
    body: r.body,
    amount: r.amount === null ? null : roundMoney(r.amount),
    readAt: r.read_at,
    createdAt: r.created_at,
  };
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
    const replaced = await this.db
      .from("bank_subaccounts")
      .update({ ...EMPTY_SUBACCOUNT, environment, provisioning_started_at: now, updated_at: now })
      .eq("id", userId)
      .neq("environment", environment)
      .select("id");
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
    const { data, error } = await this.db.from("bank_subaccounts").update(row).eq("id", userId).select("*").single();
    if (error) throw dbError(error, "Não foi possível salvar a subconta");
    return mapSubaccount(data as SubaccountRow);
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
    const patch = failure ? { error: failure.slice(0, 500) } : { processed_at: new Date().toISOString(), error: null };
    const { error } = await this.db.from("bank_webhooks_log").update(patch).eq("event_id", eventId);
    if (error) throw dbError(error, "Não foi possível concluir o evento");
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
    const { data, error } = await this.db.from("bank_outgoing_requests").update(row).eq("id", id).in("status", [...from]).select("*");
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
}
