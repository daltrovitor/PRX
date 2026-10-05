// Hello World
import crypto from "crypto";
import { PartnerError } from "@/lib/partners/errors";
import { toPartnerError } from "@/lib/asaas/errors";
import { createCustomer, createEvpKey, createPixPayment, customerName, deletePixKey, getPaymentQrCode, listPixKeys, type AsaasPixKey } from "@/lib/asaas/pix";
import { todayInBrasilia } from "@/lib/family/age";
import { MAX_PIX_KEYS, type PixCharge, type PixKey } from "@/lib/prx/bank";
import type { PixKeyType } from "@/lib/prx/pix";
import type { AsaasDeps } from "@/lib/bank/asaas/deps";
import { bankMessage } from "@/lib/bank/asaas/messages";
import { requireActiveSubaccount } from "@/lib/bank/asaas/onboarding";
import type { Subaccount } from "@/lib/bank/asaas/types";
import type { AsaasEvent, WebhookOutcome } from "@/lib/bank/asaas/webhooks";

/**
 * Entrada de dinheiro (Pix cash-in): chaves Pix da subconta, cobrança Pix com
 * QR Code dinâmico e o crédito no extrato quando o Asaas avisa o pagamento.
 */

const KEY_TYPE: Record<string, PixKeyType> = { EVP: "random", CPF: "cpf", CNPJ: "cnpj", EMAIL: "email", PHONE: "phone" };
/** Chaves em exclusão ou com erro no DICT não aparecem para o membro. */
const HIDDEN_KEY_STATUS = new Set(["DELETED", "AWAITING_DELETION", "AWAITING_ACCOUNT_DELETION", "ERROR"]);

export function toPixKey(key: AsaasPixKey): PixKey | null {
  if (HIDDEN_KEY_STATUS.has(key.status.toUpperCase()) || !key.key) return null;
  return {
    id: key.id,
    type: KEY_TYPE[key.type.toUpperCase()] ?? "random",
    value: key.key,
    status: key.status.toUpperCase() === "ACTIVE" ? "active" : "pending_activation",
    createdAt: key.dateCreated ?? new Date(0).toISOString(),
  };
}

export async function providerPixKeys(userId: string, deps: AsaasDeps): Promise<PixKey[]> {
  const { apiKey } = await requireActiveSubaccount(userId, deps);
  return (await listPixKeys(deps.client, apiKey)).map(toPixKey).filter((k): k is PixKey => k !== null);
}

export async function createProviderPixKey(userId: string, type: PixKeyType, deps: AsaasDeps): Promise<PixKey> {
  const { apiKey } = await requireActiveSubaccount(userId, deps);
  if (type !== "random") {
    throw new PartnerError("Pelo app, o banco parceiro (Asaas) só registra chave aleatória. Chave de CPF, e-mail ou celular não pode ser criada pela integração.", 422);
  }
  try {
    const keys = (await listPixKeys(deps.client, apiKey)).map(toPixKey).filter(Boolean);
    if (keys.length >= MAX_PIX_KEYS) throw new PartnerError(`Limite de ${MAX_PIX_KEYS} chaves Pix por conta.`, 409);
    const created = toPixKey(await createEvpKey(deps.client, apiKey));
    if (!created) throw new PartnerError("O banco parceiro não confirmou a chave. Tente de novo em instantes.", 503);
    return created;
  } catch (err) {
    throw toPartnerError(err, "Não foi possível cadastrar a chave Pix.");
  }
}

/** Exclui uma chave da própria subconta (a lista do Asaas confirma que ela é do membro). */
export async function removeProviderPixKey(userId: string, keyId: string, deps: AsaasDeps): Promise<void> {
  const { apiKey } = await requireActiveSubaccount(userId, deps);
  try {
    const keys = await listPixKeys(deps.client, apiKey);
    if (!keys.some((k) => k.id === keyId && toPixKey(k))) throw new PartnerError("Chave não encontrada.", 404);
    await deletePixKey(deps.client, apiKey, keyId);
  } catch (err) {
    throw toPartnerError(err, "Não foi possível excluir a chave Pix.");
  }
}

/** Primeira chave da conta recém-aprovada, para já poder receber Pix. Melhor esforço. */
export async function ensureDefaultPixKey(userId: string, deps: AsaasDeps): Promise<void> {
  try {
    const { apiKey } = await requireActiveSubaccount(userId, deps);
    const keys = (await listPixKeys(deps.client, apiKey)).map(toPixKey).filter(Boolean);
    if (keys.length === 0) await createEvpKey(deps.client, apiKey);
  } catch (err) {
    console.warn("[bank] chave Pix inicial não criada:", err instanceof Error ? err.message : err);
  }
}

/** Cliente da própria subconta que representa o titular nas cobranças (criado uma vez). */
async function holderCustomer(sub: Subaccount, apiKey: string, deps: AsaasDeps): Promise<string> {
  if (sub.customerId) return sub.customerId;
  const kyc = await deps.latestKyc(sub.userId);
  if (!kyc) throw new PartnerError("Cadastro do titular não encontrado.", 409);
  const customer = await createCustomer(deps.client, apiKey, { name: kyc.fullName, cpfCnpj: kyc.cpf, email: kyc.email, mobilePhone: kyc.phone });
  await deps.store.saveSubaccount(sub.userId, { customerId: customer.id });
  return customer.id;
}

const isoDate = (now: Date) => {
  const { y, m, d } = todayInBrasilia(now);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

/** Cobrança Pix (depósito ou "cobrar") com QR Code dinâmico e Copia e Cola. */
export async function createProviderCharge(userId: string, input: { amount: number | null; description: string }, deps: AsaasDeps): Promise<PixCharge> {
  if (!input.amount || !(input.amount > 0)) throw new PartnerError("Informe o valor da cobrança.", 422);
  const amount = Math.round(input.amount * 100) / 100;
  const description = input.description.trim().slice(0, 140) || "Cobrança PRX";
  const { sub, apiKey } = await requireActiveSubaccount(userId, deps);
  try {
    const customer = await holderCustomer(sub, apiKey, deps);
    const payment = await createPixPayment(deps.client, apiKey, { customer, value: amount, dueDate: isoDate(deps.now()), description, externalReference: crypto.randomUUID() });
    const qr = await getPaymentQrCode(deps.client, apiKey, payment.id);
    await deps.mirror.saveCharge(userId, { amount, description, payload: qr.payload, providerRef: payment.id });
    return { id: payment.id, amount, description, payload: qr.payload, paid: false, createdAt: deps.now().toISOString() };
  } catch (err) {
    throw toPartnerError(err, "Não foi possível gerar a cobrança Pix.");
  }
}

const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

/** PAYMENT_RECEIVED credita o extrato e avisa; PAYMENT_REFUNDED estorna o lançamento. */
export async function handlePaymentEvent(event: AsaasEvent, sub: Subaccount, deps: AsaasDeps): Promise<WebhookOutcome> {
  const payment = event.payment ?? {};
  const id = str(payment.id);
  const value = num(payment.value);
  if (!id || value === null) return "ignored";

  if (event.event === "PAYMENT_REFUNDED") {
    await deps.mirror.reverseTransaction(id);
    return "processed";
  }
  if (event.event !== "PAYMENT_RECEIVED" || str(payment.billingType) !== "PIX") return "ignored";

  const now = deps.now().toISOString();
  await deps.mirror.markChargePaid(id, now);
  let payer: string | null = null;
  const customer = str(payment.customer);
  if (customer && customer !== sub.customerId && sub.apiKeySealed) {
    const { apiKey } = await requireActiveSubaccount(sub.userId, deps).catch(() => ({ apiKey: null }));
    if (apiKey) payer = await customerName(deps.client, apiKey, customer).catch(() => null);
  }
  const credited = num(payment.netValue) ?? value;
  await deps.mirror.upsertTransaction(sub.userId, {
    kind: "pix_in",
    direction: "in",
    amount: credited,
    counterparty: payer ?? "Pix recebido",
    description: str(payment.description) ?? "Pix recebido",
    providerRef: id,
    createdAt: now,
  });
  const msg = bankMessage("pix_received", { amount: value, counterparty: payer });
  await deps.store.insertNotification({ userId: sub.userId, eventType: event.event, ...msg, amount: value, eventId: event.id });
  return "processed";
}
