// Hello World
import {
  ACCOUNT_STATUS_VALUES,
  OUTGOING_KINDS,
  OUTGOING_STATUSES,
  SUBACCOUNT_KYC_STATUSES,
  SUBACCOUNT_STATUSES,
  roundMoney,
  type AccountStatusValue,
  type BankNotification,
  type OutgoingRequest,
  type Subaccount,
  type SubaccountPatch,
} from "@/lib/bank/asaas/types";

/** Linhas do Supabase e conversão para os tipos do PRX BANK (store-supabase.ts). */

export const oneOf = <T extends string>(list: readonly T[], value: unknown, fallback: T): T => (list.includes(value as T) ? (value as T) : fallback);
const dimension = (value: unknown): AccountStatusValue | null => (ACCOUNT_STATUS_VALUES.includes(value as AccountStatusValue) ? (value as AccountStatusValue) : null);

export interface SubaccountRow {
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
  // Migração 20261010 (podem faltar enquanto ela não for aplicada).
  general_status?: string | null;
  documentation_status?: string | null;
  commercial_info_status?: string | null;
  bank_account_info_status?: string | null;
  commercial_info_alert?: string | null;
  status_updated_at?: string | null;
  account_created_at?: string | null;
  documents_synced_at?: string | null;
  onboarding_notified_at?: string | null;
}

export function mapSubaccount(r: SubaccountRow): Subaccount {
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
    generalStatus: dimension(r.general_status),
    documentationStatus: dimension(r.documentation_status),
    commercialInfoStatus: dimension(r.commercial_info_status),
    bankAccountInfoStatus: dimension(r.bank_account_info_status),
    commercialInfoAlert: r.commercial_info_alert === "EXPIRING_SOON" || r.commercial_info_alert === "EXPIRED" ? r.commercial_info_alert : null,
    statusUpdatedAt: r.status_updated_at ?? null,
    accountCreatedAt: r.account_created_at ?? null,
    documentsSyncedAt: r.documents_synced_at ?? null,
    onboardingNotifiedAt: r.onboarding_notified_at ?? null,
  };
}

/** Subconta ainda não criada no Asaas. */
export const EMPTY_SUBACCOUNT = {
  asaas_account_id: null,
  wallet_id: null,
  api_key: null,
  asaas_customer_id: null,
  account_number: null,
  agency: null,
  status: "pending_activation",
  kyc_status: "PENDING",
  reject_reason: null,
  general_status: null,
  documentation_status: null,
  commercial_info_status: null,
  bank_account_info_status: null,
  commercial_info_alert: null,
  status_updated_at: null,
  account_created_at: null,
  documents_synced_at: null,
  onboarding_notified_at: null,
} as const;

export const SUBACCOUNT_COLUMNS: Record<keyof SubaccountPatch, keyof SubaccountRow> = {
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
  generalStatus: "general_status",
  documentationStatus: "documentation_status",
  commercialInfoStatus: "commercial_info_status",
  bankAccountInfoStatus: "bank_account_info_status",
  commercialInfoAlert: "commercial_info_alert",
  statusUpdatedAt: "status_updated_at",
  accountCreatedAt: "account_created_at",
  documentsSyncedAt: "documents_synced_at",
  onboardingNotifiedAt: "onboarding_notified_at",
};

/** Colunas da migração 20261010: sem ela aplicada, o resto continua sendo gravado. */
const NEW_COLUMNS = new Set([
  "general_status",
  "documentation_status",
  "commercial_info_status",
  "bank_account_info_status",
  "commercial_info_alert",
  "status_updated_at",
  "account_created_at",
  "documents_synced_at",
  "onboarding_notified_at",
  "outcome_unknown",
  "attempts",
  "counterparty_document",
]);

/** Erro de coluna inexistente (PostgREST PGRST204 ou Postgres 42703). */
export function missingColumn(error: { code?: string } | null | undefined): boolean {
  return Boolean(error && (error.code === "PGRST204" || error.code === "42703"));
}

export function withoutNewColumns<T extends Record<string, unknown>>(row: T): Partial<T> {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !NEW_COLUMNS.has(key))) as Partial<T>;
}

let warned = false;
export function warnMissingMigration(): void {
  if (warned) return;
  warned = true;
  console.warn("[prx-bank] colunas novas ausentes: aplique supabase/migrations/20261010_prx_asaas_audit.sql. Gravando sem elas.");
}

export interface OutgoingRow {
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
  outcome_unknown?: boolean | null;
  counterparty_document?: string | null;
}

export function mapOutgoing(r: OutgoingRow): OutgoingRequest {
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
    outcomeUnknown: r.outcome_unknown === true,
    counterpartyDocument: r.counterparty_document ?? null,
  };
}

export interface NotificationRow {
  id: string;
  user_id: string;
  event_type: string;
  title: string;
  body: string;
  amount: number | string | null;
  read_at: string | null;
  created_at: string;
}

export function mapNotification(r: NotificationRow): BankNotification {
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
