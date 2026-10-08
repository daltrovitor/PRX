// Hello World
import type { AsaasEnvironment } from "@/lib/asaas/config";

/**
 * Tipos do espelho do Asaas no Supabase (migra��o 20261001_prx_asaas_baas.sql).
 */

export const SUBACCOUNT_STATUSES = ["pending_activation", "active", "blocked", "rejected"] as const;
export type SubaccountStatus = (typeof SUBACCOUNT_STATUSES)[number];
export const SUBACCOUNT_KYC_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type SubaccountKycStatus = (typeof SUBACCOUNT_KYC_STATUSES)[number];

export interface Subaccount {
  userId: string;
  asaasAccountId: string | null;
  walletId: string | null;
  /** apiKey cifrada (v1:kid:iv:tag:dados). Nunca vai para o cliente. */
  apiKeySealed: string | null;
  customerId: string | null;
  accountNumber: string | null;
  agency: string | null;
  status: SubaccountStatus;
  kycStatus: SubaccountKycStatus;
  rejectReason: string | null;
  environment: AsaasEnvironment;
  provisioningStartedAt: string | null;
  createdAt: string;
}

export type SubaccountPatch = Partial<Omit<Subaccount, "userId" | "createdAt" | "environment">>;

export const OUTGOING_KINDS = ["pix_key", "pix_qr", "bill"] as const;
export type OutgoingKind = (typeof OUTGOING_KINDS)[number];
export const OUTGOING_STATUSES = ["awaiting_confirmation", "requested", "approved", "refused", "done", "failed", "cancelled", "expired"] as const;
export type OutgoingStatus = (typeof OUTGOING_STATUSES)[number];
/** Saídas que já comprometem o saldo/limite do dia (pedidas ao Asaas e não desfeitas). */
export const COMMITTED_OUTGOING: readonly OutgoingStatus[] = ["requested", "approved", "done"];

export interface OutgoingRequest {
  id: string;
  userId: string;
  kind: OutgoingKind;
  amount: number;
  counterparty: string;
  target: string;
  description: string;
  status: OutgoingStatus;
  providerRef: string | null;
  failReason: string | null;
  confirmedAt: string | null;
  createdAt: string;
}

export type NewOutgoing = Pick<OutgoingRequest, "userId" | "kind" | "amount" | "counterparty" | "target" | "description">;
export type OutgoingPatch = Partial<Pick<OutgoingRequest, "providerRef" | "failReason" | "confirmedAt">>;

export interface BankNotification {
  id: string;
  userId: string;
  eventType: string;
  title: string;
  body: string;
  amount: number | null;
  readAt: string | null;
  createdAt: string;
}

export type NewNotification = Pick<BankNotification, "userId" | "eventType" | "title" | "body" | "amount"> & { eventId: string | null };

export interface WebhookRecord {
  eventId: string;
  eventType: string;
  asaasAccountId: string | null;
  payload: unknown;
}

/** new: primeiro recebimento; retry: já recebido, mas o processamento falhou; duplicate: já processado. */
export type WebhookRecordResult = "new" | "retry" | "duplicate";

/** sent: o Asaas aceitou; failed: recusou ou o PRX falhou; uncertain: sem resposta; blocked: o PRX nem enviou. */
export type ProvisioningOutcome = "sent" | "failed" | "uncertain" | "blocked";

/** Um envio do cadastro ao Asaas (bank_provisioning_log), só para o admin. */
export interface ProvisioningLogEntry {
  userId: string;
  environment: AsaasEnvironment;
  step: "account" | "documents";
  outcome: ProvisioningOutcome;
  asaasAccountId: string | null;
  detail: string | null;
}

export interface AsaasBankStore {
  getSubaccount(userId: string): Promise<Subaccount | null>;
  findSubaccountByAsaasId(asaasAccountId: string): Promise<Subaccount | null>;
  /** Trava a abertura: true só para quem pegou a vez (ou uma trava esquecida há mais de `staleBefore`). */
  reserveSubaccount(userId: string, environment: AsaasEnvironment, staleBefore: string): Promise<boolean>;
  releaseSubaccount(userId: string): Promise<void>;
  saveSubaccount(userId: string, patch: SubaccountPatch): Promise<Subaccount>;

  recordWebhook(input: WebhookRecord): Promise<WebhookRecordResult>;
  finishWebhook(eventId: string, error: string | null): Promise<void>;

  /** Registra o envio do cadastro. Nunca lança: falha aqui não derruba a abertura. */
  logProvisioning(entry: ProvisioningLogEntry): Promise<void>;

  /** false quando o aviso daquele evento já existia. */
  insertNotification(input: NewNotification): Promise<boolean>;
  listNotifications(userId: string, limit: number): Promise<BankNotification[]>;
  markNotificationsRead(userId: string, ids: string[] | "all"): Promise<void>;

  insertOutgoing(input: NewOutgoing): Promise<OutgoingRequest>;
  getOutgoing(id: string): Promise<OutgoingRequest | null>;
  findOutgoingByProviderRef(providerRef: string): Promise<OutgoingRequest | null>;
  /** Troca de status atômica: só sai de um dos `from`. null quando outro processo chegou antes. */
  transitionOutgoing(id: string, from: readonly OutgoingStatus[], to: OutgoingStatus, patch?: OutgoingPatch): Promise<OutgoingRequest | null>;
  /** Grava o id do Asaas no pedido sem mexer no status (o webhook de validação pode ter chegado antes). */
  attachProviderRef(id: string, providerRef: string): Promise<void>;
  /** Soma das saídas comprometidas do membro desde `sinceIso`. */
  outgoingTotalSince(userId: string, sinceIso: string): Promise<number>;
}

export const roundMoney = (value: unknown): number => Math.round(Number(value ?? 0) * 100) / 100;
