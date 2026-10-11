// Hello World
import crypto from "crypto";
import {
  COMMITTED_OUTGOING,
  roundMoney,
  type AsaasBankStore,
  type BankNotification,
  type NewNotification,
  type NewOutgoing,
  type OutgoingPatch,
  type OutgoingRequest,
  type OutgoingStatus,
  type PendingWebhook,
  type ProvisioningLogEntry,
  type Subaccount,
  type SubaccountPatch,
  type WebhookRecord,
  type WebhookRecordResult,
} from "@/lib/bank/asaas/types";

/** Situação cadastral ainda desconhecida (subconta recém-reservada). */
const EMPTY_STATUS = {
  generalStatus: null,
  documentationStatus: null,
  commercialInfoStatus: null,
  bankAccountInfoStatus: null,
  commercialInfoAlert: null,
  statusUpdatedAt: null,
  accountCreatedAt: null,
  documentsSyncedAt: null,
  onboardingNotifiedAt: null,
} as const;

/** Espelho em memória (desenvolvimento sem Supabase e testes). Mesmas regras do Supabase. */
export class MemoryAsaasBankStore implements AsaasBankStore {
  private subaccounts = new Map<string, Subaccount>();
  private webhooks = new Map<string, { processedAt: string | null; error: string | null; payload: unknown; attempts: number; receivedAt: string }>();
  private notifications: Array<BankNotification & { eventId: string | null }> = [];
  private outgoing = new Map<string, OutgoingRequest>();
  private provisioning: Array<ProvisioningLogEntry & { createdAt: string }> = [];

  static shared(): MemoryAsaasBankStore {
    const g = globalThis as unknown as { __prxAsaasStore?: MemoryAsaasBankStore };
    return (g.__prxAsaasStore ??= new MemoryAsaasBankStore());
  }

  async getSubaccount(userId: string) {
    const found = this.subaccounts.get(userId);
    return found ? { ...found } : null;
  }

  async findSubaccountByAsaasId(asaasAccountId: string) {
    const found = [...this.subaccounts.values()].find((s) => s.asaasAccountId === asaasAccountId);
    return found ? { ...found } : null;
  }

  async reserveSubaccount(userId: string, environment: Subaccount["environment"], staleBefore: string) {
    const now = new Date().toISOString();
    const current = this.subaccounts.get(userId);
    if (!current) {
      this.subaccounts.set(userId, {
        userId,
        asaasAccountId: null,
        walletId: null,
        apiKeySealed: null,
        customerId: null,
        accountNumber: null,
        agency: null,
        status: "pending_activation",
        kycStatus: "PENDING",
        rejectReason: null,
        environment,
        provisioningStartedAt: now,
        createdAt: now,
        ...EMPTY_STATUS,
      });
      return true;
    }
    if (current.environment !== environment) {
      Object.assign(current, { asaasAccountId: null, walletId: null, apiKeySealed: null, customerId: null, accountNumber: null, agency: null, status: "pending_activation", kycStatus: "PENDING", rejectReason: null, environment, provisioningStartedAt: now, createdAt: now, ...EMPTY_STATUS });
      return true;
    }
    if (current.asaasAccountId) return false;
    if (current.provisioningStartedAt && current.provisioningStartedAt >= staleBefore) return false;
    current.provisioningStartedAt = now;
    return true;
  }

  async releaseSubaccount(userId: string) {
    const current = this.subaccounts.get(userId);
    if (current && !current.asaasAccountId) current.provisioningStartedAt = null;
  }

  async saveSubaccount(userId: string, patch: SubaccountPatch) {
    const current = this.subaccounts.get(userId);
    if (!current) throw new Error("[bank] subconta inexistente.");
    const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as SubaccountPatch;
    const next = { ...current, ...defined };
    this.subaccounts.set(userId, next);
    return { ...next };
  }

  async listSubaccounts(environment: Subaccount["environment"], limit: number) {
    return [...this.subaccounts.values()]
      .filter((s) => s.environment === environment)
      .slice(0, limit)
      .map((s) => ({ ...s }));
  }

  async listSubaccountsToReconcile(environment: Subaccount["environment"], limit: number) {
    return [...this.subaccounts.values()]
      .filter((s) => s.environment === environment && (s.status === "pending_activation" || s.status === "rejected"))
      .slice(0, limit)
      .map((s) => ({ ...s }));
  }

  async logProvisioning(entry: ProvisioningLogEntry) {
    this.provisioning.push({ ...entry, createdAt: new Date().toISOString() });
  }

  async listProvisioning(userId: string, limit: number) {
    return this.provisioning
      .filter((p) => p.userId === userId)
      .reverse()
      .slice(0, limit);
  }

  /** Só para testes: envios registrados. */
  provisioningLog(): ProvisioningLogEntry[] {
    return this.provisioning.map((p) => ({ userId: p.userId, environment: p.environment, step: p.step, outcome: p.outcome, asaasAccountId: p.asaasAccountId, detail: p.detail }));
  }

  async recordWebhook(input: WebhookRecord): Promise<WebhookRecordResult> {
    const found = this.webhooks.get(input.eventId);
    if (!found) {
      this.webhooks.set(input.eventId, { processedAt: null, error: null, payload: input.payload, attempts: 0, receivedAt: new Date().toISOString() });
      return "new";
    }
    return found.processedAt ? "duplicate" : "retry";
  }

  async finishWebhook(eventId: string, error: string | null) {
    const found = this.webhooks.get(eventId);
    if (!found) return;
    if (error) {
      found.error = error;
      found.attempts += 1;
    } else {
      found.processedAt = new Date().toISOString();
      found.error = null;
    }
  }

  async listPendingWebhooks(before: string, maxAttempts: number, limit: number): Promise<PendingWebhook[]> {
    return [...this.webhooks.entries()]
      .filter(([, w]) => !w.processedAt && w.receivedAt < before && w.attempts < maxAttempts)
      .slice(0, limit)
      .map(([eventId, w]) => ({ eventId, payload: w.payload, attempts: w.attempts }));
  }

  /** Só para testes: situação de um evento. */
  webhookState(eventId: string) {
    const found = this.webhooks.get(eventId);
    return found ? { processedAt: found.processedAt, error: found.error, attempts: found.attempts } : null;
  }

  async insertNotification(input: NewNotification) {
    if (input.eventId && this.notifications.some((n) => n.eventId === input.eventId)) return false;
    this.notifications.unshift({
      id: crypto.randomUUID(),
      userId: input.userId,
      eventType: input.eventType,
      title: input.title.slice(0, 160),
      body: input.body.slice(0, 300),
      amount: input.amount,
      eventId: input.eventId,
      readAt: null,
      createdAt: new Date().toISOString(),
    });
    return true;
  }

  async listNotifications(userId: string, limit: number) {
    return this.notifications
      .filter((n) => n.userId === userId)
      .slice(0, limit)
      .map((n) => ({ id: n.id, userId: n.userId, eventType: n.eventType, title: n.title, body: n.body, amount: n.amount, readAt: n.readAt, createdAt: n.createdAt }));
  }

  async markNotificationsRead(userId: string, ids: string[] | "all") {
    const now = new Date().toISOString();
    for (const n of this.notifications) {
      if (n.userId === userId && !n.readAt && (ids === "all" || ids.includes(n.id))) n.readAt = now;
    }
  }

  async insertOutgoing(input: NewOutgoing) {
    const created: OutgoingRequest = {
      id: crypto.randomUUID(),
      ...input,
      amount: roundMoney(input.amount),
      status: "awaiting_confirmation",
      providerRef: null,
      failReason: null,
      confirmedAt: null,
      createdAt: new Date().toISOString(),
      outcomeUnknown: false,
    };
    this.outgoing.set(created.id, created);
    return { ...created };
  }

  async getOutgoing(id: string) {
    const found = this.outgoing.get(id);
    return found ? { ...found } : null;
  }

  async findOutgoingByProviderRef(providerRef: string) {
    const found = [...this.outgoing.values()].find((o) => o.providerRef === providerRef);
    return found ? { ...found } : null;
  }

  async transitionOutgoing(id: string, from: readonly OutgoingStatus[], to: OutgoingStatus, patch: OutgoingPatch = {}) {
    const found = this.outgoing.get(id);
    if (!found || !from.includes(found.status)) return null;
    if (patch.providerRef && [...this.outgoing.values()].some((o) => o.id !== id && o.providerRef === patch.providerRef)) {
      throw new Error("[bank] provider_ref duplicado.");
    }
    found.status = to;
    if (patch.providerRef !== undefined) found.providerRef = patch.providerRef;
    if (patch.failReason !== undefined) found.failReason = patch.failReason;
    if (patch.confirmedAt !== undefined) found.confirmedAt = patch.confirmedAt;
    if (patch.outcomeUnknown !== undefined) found.outcomeUnknown = patch.outcomeUnknown;
    return { ...found };
  }

  async attachProviderRef(id: string, providerRef: string) {
    const found = this.outgoing.get(id);
    if (found && !found.providerRef) found.providerRef = providerRef;
  }

  async outgoingTotalSince(userId: string, sinceIso: string) {
    const total = [...this.outgoing.values()]
      .filter((o) => o.userId === userId && COMMITTED_OUTGOING.includes(o.status) && o.createdAt >= sinceIso)
      .reduce((sum, o) => sum + o.amount, 0);
    return roundMoney(total);
  }

  async listOpenOutgoing(before: string, limit: number) {
    return [...this.outgoing.values()]
      .filter((o) => (o.status === "requested" || o.status === "approved") && o.createdAt < before)
      .slice(0, limit)
      .map((o) => ({ ...o }));
  }

  async setOutgoingUnknown(id: string, unknown: boolean) {
    const found = this.outgoing.get(id);
    if (found) found.outcomeUnknown = unknown;
  }
}
