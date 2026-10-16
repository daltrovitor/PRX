// Hello World
import { getAccountStatus, type AccountStatusInfo } from "@/lib/asaas/accounts";
import { getFamilyRepository } from "@/lib/family/repository";
import type { AsaasDeps } from "@/lib/bank/asaas/deps";
import { bankMessage } from "@/lib/bank/asaas/messages";
import { ACCOUNT_STATUS_VALUES, type AccountStatusValue, type CommercialInfoAlert, type Subaccount, type SubaccountKycStatus, type SubaccountPatch, type SubaccountStatus } from "@/lib/bank/asaas/types";

/**
 * Situação cadastral da subconta como o Asaas informa: quatro dimensões
 * (dados comerciais, conta bancária, documentação e aprovação geral). Só
 * general = APPROVED libera dinheiro (docs: consultar-situacao-cadastral-da-conta).
 * Cada atualização guarda o instante da informação: um evento mais antigo que
 * a situação já aplicada é ignorado (fila fora de ordem ou reprocessamento).
 */

export interface StatusSnapshot {
  general: AccountStatusValue | null;
  documentation: AccountStatusValue | null;
  commercialInfo: AccountStatusValue | null;
  bankAccountInfo: AccountStatusValue | null;
}

const value = (raw: unknown): AccountStatusValue | null => {
  const upper = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  return (ACCOUNT_STATUS_VALUES as readonly string[]).includes(upper) ? (upper as AccountStatusValue) : null;
};

/** Objeto accountStatus do evento ou resposta do GET /myAccount/status. */
export function parseSnapshot(raw: Partial<Record<keyof StatusSnapshot, unknown>> | AccountStatusInfo | null | undefined): StatusSnapshot {
  return { general: value(raw?.general), documentation: value(raw?.documentation), commercialInfo: value(raw?.commercialInfo), bankAccountInfo: value(raw?.bankAccountInfo) };
}

const EVENT_DIMENSION: Record<string, keyof StatusSnapshot> = {
  BANK_ACCOUNT_INFO: "bankAccountInfo",
  COMMERCIAL_INFO: "commercialInfo",
  DOCUMENT: "documentation",
  GENERAL_APPROVAL: "general",
};

/** Dimensão que o nome do evento informa (ACCOUNT_STATUS_DOCUMENT_REJECTED → documentation = REJECTED). */
export function snapshotFromEvent(event: string): Partial<StatusSnapshot> {
  const match = /^ACCOUNT_STATUS_(BANK_ACCOUNT_INFO|COMMERCIAL_INFO|DOCUMENT|GENERAL_APPROVAL)_(APPROVED|AWAITING_APPROVAL|PENDING|REJECTED)$/.exec(event);
  return match ? { [EVENT_DIMENSION[match[1]]]: match[2] as AccountStatusValue } : {};
}

/** dateCreated dos eventos ("2024-06-12 16:45:03", horário de Brasília); ISO com fuso também vale. */
export function eventInstant(dateCreated: string | null | undefined): Date | null {
  if (!dateCreated) return null;
  const local = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/.exec(dateCreated.trim());
  const parsed = local ? Date.parse(`${local[1]}T${local[2]}-03:00`) : Date.parse(dateCreated);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

/** Estado da PRX que cada combinação produz. Conta bloqueada pela PRX continua bloqueada. */
function derive(current: Subaccount, dims: StatusSnapshot): { status: SubaccountStatus; kycStatus: SubaccountKycStatus } {
  if (current.status === "blocked") return { status: "blocked", kycStatus: dims.general === "APPROVED" ? "APPROVED" : current.kycStatus };
  if (dims.general === "APPROVED") return { status: "active", kycStatus: "APPROVED" };
  if (dims.general === "REJECTED") return { status: "rejected", kycStatus: "REJECTED" };
  // Documento recusado: a conta segue em análise, mas o membro precisa reenviar (novo link do Asaas).
  if (dims.documentation === "REJECTED") return { status: "rejected", kycStatus: "PENDING" };
  return { status: "pending_activation", kycStatus: "PENDING" };
}

/**
 * Menor emancipado cuja conta o banco parceiro aprovou (ele conferiu a certidão
 * de emancipação): vira conta comum na PRX, sem os limites de menor.
 */
async function liftEmancipatedMinor(userId: string, deps: AsaasDeps): Promise<void> {
  const app = await deps.latestKyc(userId);
  if (app?.minorPath !== "emancipated") return;
  const family = getFamilyRepository();
  const request = await family.latestEmancipation(userId).catch(() => null);
  if (request?.status === "pending") await family.decideEmancipation(request.id, "approved", "Certidão aprovada pelo PRX BANK.", "PRX BANK");
  await family.updateIdentity(userId, { accountType: "member", status: "active" });
}

export interface StatusUpdate {
  snapshot: Partial<StatusSnapshot>;
  /** Instante da informação (evento) ou da consulta. */
  at: Date;
  reason?: string | null;
  commercialInfoAlert?: CommercialInfoAlert | null;
}

/**
 * Aplica a situação informada pelo Asaas. Aprovação geral ativa a conta e avisa
 * o membro uma vez; recusa (geral ou de documento) pede novo envio; voltar a
 * pendente tira o acesso ao dinheiro até nova aprovação.
 */
export async function applyStatusUpdate(sub: Subaccount, update: StatusUpdate, deps: AsaasDeps): Promise<{ sub: Subaccount; stale: boolean }> {
  if (!sub.asaasAccountId) return { sub, stale: false };
  if (sub.statusUpdatedAt && update.at.getTime() < Date.parse(sub.statusUpdatedAt)) return { sub, stale: true };

  const dims: StatusSnapshot = {
    general: update.snapshot.general ?? sub.generalStatus,
    documentation: update.snapshot.documentation ?? sub.documentationStatus,
    commercialInfo: update.snapshot.commercialInfo ?? sub.commercialInfoStatus,
    bankAccountInfo: update.snapshot.bankAccountInfo ?? sub.bankAccountInfoStatus,
  };
  const next = derive(sub, dims);
  const reason = next.status === "rejected" ? (update.reason?.slice(0, 500) ?? sub.rejectReason) : null;
  const patch: SubaccountPatch = {
    generalStatus: dims.general,
    documentationStatus: dims.documentation,
    commercialInfoStatus: dims.commercialInfo,
    bankAccountInfoStatus: dims.bankAccountInfo,
    statusUpdatedAt: update.at.toISOString(),
    status: next.status,
    kycStatus: next.kycStatus,
    rejectReason: reason,
  };
  if (update.commercialInfoAlert !== undefined) patch.commercialInfoAlert = update.commercialInfoAlert;
  // Documento recusado gera um link novo no Asaas: o membro precisa ser avisado de novo.
  if (dims.documentation === "REJECTED" && sub.documentationStatus !== "REJECTED") patch.onboardingNotifiedAt = null;
  const saved = await deps.store.saveSubaccount(sub.userId, patch);

  const id = sub.asaasAccountId;
  if (next.status === "active" && sub.status !== "active") {
    await deps.mirror.setAccountStatus(sub.userId, "active", deps.now().toISOString());
    await liftEmancipatedMinor(sub.userId, deps).catch((err: unknown) => console.warn("[bank] emancipação não atualizada:", err instanceof Error ? err.message : err));
    await deps.store.insertNotification({ userId: sub.userId, eventType: "ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED", ...bankMessage("account_approved"), amount: null, eventId: `account:${id}:approved` });
  } else if (sub.status === "active" && next.status !== "active" && next.status !== "blocked") {
    await deps.mirror.setAccountStatus(sub.userId, "pending_activation");
  }
  if (next.status === "rejected" && (sub.status !== "rejected" || sub.rejectReason !== reason)) {
    await deps.mirror.setAccountStatus(sub.userId, "pending_activation");
    await deps.store.insertNotification({
      userId: sub.userId,
      eventType: dims.general === "REJECTED" ? "ACCOUNT_STATUS_GENERAL_APPROVAL_REJECTED" : "ACCOUNT_STATUS_DOCUMENT_REJECTED",
      ...bankMessage("account_rejected", { reason }),
      amount: null,
      eventId: `account:${id}:rejected:${update.at.toISOString()}`,
    });
  }
  return { sub: saved, stale: false };
}

type GeneralStatus = "APPROVED" | "REJECTED" | "PENDING" | "AWAITING_APPROVAL";

/** Atalho para quem só conhece a aprovação geral (testes e chamadas antigas). */
export async function applyGeneralApproval(sub: Subaccount, status: GeneralStatus, reason: string | null, deps: AsaasDeps): Promise<Subaccount> {
  return (await applyStatusUpdate(sub, { snapshot: { general: status }, at: deps.now(), reason }, deps)).sub;
}

/** Situação atual direto do Asaas (GET /myAccount/status, com a chave da subconta). */
export async function fetchStatusSnapshot(apiKey: string, deps: AsaasDeps): Promise<StatusSnapshot> {
  return parseSnapshot(await getAccountStatus(deps.client, apiKey));
}
