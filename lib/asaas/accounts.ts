// Hello World
import { z } from "zod";
import type { AsaasClient } from "@/lib/asaas/client";

/**
 * Subcontas (BaaS) e onboarding no Asaas. Docs: /reference/criar-subconta,
 * /reference/listar-subcontas, /reference/verificar-documentos-pendentes,
 * /reference/consultar-situacao-cadastral-da-conta,
 * /docs/webhook-para-verificar-situacao-da-conta.
 */

/** Situação cadastral: todos os eventos documentados (cada um traz o objeto accountStatus completo). */
export const ACCOUNT_STATUS_EVENTS = [
  "ACCOUNT_STATUS_BANK_ACCOUNT_INFO_APPROVED",
  "ACCOUNT_STATUS_BANK_ACCOUNT_INFO_AWAITING_APPROVAL",
  "ACCOUNT_STATUS_BANK_ACCOUNT_INFO_PENDING",
  "ACCOUNT_STATUS_BANK_ACCOUNT_INFO_REJECTED",
  "ACCOUNT_STATUS_COMMERCIAL_INFO_APPROVED",
  "ACCOUNT_STATUS_COMMERCIAL_INFO_AWAITING_APPROVAL",
  "ACCOUNT_STATUS_COMMERCIAL_INFO_PENDING",
  "ACCOUNT_STATUS_COMMERCIAL_INFO_REJECTED",
  "ACCOUNT_STATUS_COMMERCIAL_INFO_EXPIRING_SOON",
  "ACCOUNT_STATUS_COMMERCIAL_INFO_EXPIRED",
  "ACCOUNT_STATUS_DOCUMENT_APPROVED",
  "ACCOUNT_STATUS_DOCUMENT_AWAITING_APPROVAL",
  "ACCOUNT_STATUS_DOCUMENT_PENDING",
  "ACCOUNT_STATUS_DOCUMENT_REJECTED",
  "ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED",
  "ACCOUNT_STATUS_GENERAL_APPROVAL_AWAITING_APPROVAL",
  "ACCOUNT_STATUS_GENERAL_APPROVAL_PENDING",
  "ACCOUNT_STATUS_GENERAL_APPROVAL_REJECTED",
] as const;

/** Eventos que cada subconta manda para o webhook PRX. */
export const SUBACCOUNT_WEBHOOK_EVENTS = [
  "PAYMENT_RECEIVED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_REFUNDED",
  "TRANSFER_DONE",
  "TRANSFER_FAILED",
  "TRANSFER_CANCELLED",
  "BILL_PAID",
  "BILL_FAILED",
  "BILL_CANCELLED",
  "BILL_REFUNDED",
  ...ACCOUNT_STATUS_EVENTS,
] as const;

export interface SubaccountWebhook {
  name: string;
  url: string;
  email: string;
  sendType: "SEQUENTIALLY";
  interrupted: false;
  enabled: true;
  apiVersion: 3;
  authToken: string;
  events: readonly string[];
}

export interface NewSubaccount {
  name: string;
  email: string;
  cpfCnpj: string;
  birthDate: string;
  mobilePhone: string;
  incomeValue: number;
  address: string;
  addressNumber: string;
  complement?: string;
  province: string;
  postalCode: string;
  webhooks: SubaccountWebhook[];
}

const nullableText = z.string().nullish().transform((v) => v ?? null);

const accountNumberSchema = z
  .object({ agency: nullableText, account: nullableText, accountDigit: nullableText })
  .nullish()
  .transform((v) => v ?? null);

/**
 * Resposta do POST /v3/accounts. A referência atual (AccountSaveResponseDTO)
 * traz a chave em accessToken.apiKey; o guia e respostas antigas, em apiKey.
 * Aceita os dois e, se a chave não vier, o id é aproveitado assim mesmo: a
 * subconta existe no Asaas e não pode ser aberta de novo.
 */
export const createdSubaccountSchema = z
  .object({
    id: z.string().min(1),
    walletId: nullableText,
    apiKey: nullableText,
    accessToken: z
      .object({ apiKey: nullableText })
      .loose()
      .nullish()
      .transform((v) => v ?? null),
    accountNumber: accountNumberSchema,
  })
  .loose()
  .transform(({ id, walletId, apiKey, accessToken, accountNumber }) => {
    const key = [apiKey, accessToken?.apiKey].find((k): k is string => typeof k === "string" && k.trim().length >= 10) ?? null;
    return { id, walletId, apiKey: key, accountNumber };
  });
export type CreatedSubaccount = z.output<typeof createdSubaccountSchema>;

export function createSubaccount(client: AsaasClient, input: NewSubaccount): Promise<CreatedSubaccount> {
  return client.post("/accounts", input, {}, createdSubaccountSchema);
}

export const documentGroupSchema = z.object({
  id: z.string().min(1),
  status: z.string(),
  type: z.string(),
  title: nullableText,
  description: nullableText,
  onboardingUrl: z.string().url().nullish().transform((v) => v ?? null),
  documents: z
    .array(z.object({ id: z.string(), status: z.string() }))
    .nullish()
    .transform((v) => v ?? []),
});
export type DocumentGroup = z.output<typeof documentGroupSchema>;

const documentsSchema = z.object({
  rejectReasons: nullableText,
  data: z
    .array(documentGroupSchema)
    .nullish()
    .transform((v) => v ?? []),
});
export type PendingDocuments = z.output<typeof documentsSchema>;

/** Documentos pendentes da subconta. O Asaas pede ~15 s depois da criação antes da primeira consulta. */
export function listDocuments(client: AsaasClient, apiKey: string): Promise<PendingDocuments> {
  return client.get("/myAccount/documents", { apiKey }, documentsSchema);
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Envia um arquivo para um grupo de documentos (multipart: documentFile + type). */
export async function uploadDocument(client: AsaasClient, apiKey: string, groupId: string, type: string, file: Blob, filename: string): Promise<void> {
  if (!SAFE_ID.test(groupId)) throw new Error("[asaas] grupo de documento inválido.");
  const form = new FormData();
  form.append("documentFile", file, filename);
  form.append("type", type);
  await client.request(`/myAccount/documents/${groupId}`, { method: "POST", form, apiKey });
}

const accountStatusSchema = z.object({
  id: nullableText,
  general: nullableText,
  documentation: nullableText,
  commercialInfo: nullableText,
  bankAccountInfo: nullableText,
});
export type AccountStatusInfo = z.output<typeof accountStatusSchema>;

/** Situação cadastral da subconta (consulta de reforço quando um webhook se perde). */
export function getAccountStatus(client: AsaasClient, apiKey: string): Promise<AccountStatusInfo> {
  return client.get("/myAccount/status", { apiKey }, accountStatusSchema);
}

const foundAccountSchema = z
  .object({
    id: z.string().min(1),
    walletId: nullableText,
    cpfCnpj: nullableText,
    email: nullableText,
    accountNumber: accountNumberSchema,
  })
  .loose();
export type FoundSubaccount = z.output<typeof foundAccountSchema>;

const accountListSchema = z.object({
  data: z
    .array(foundAccountSchema)
    .nullish()
    .transform((v) => v ?? []),
});

/** Subcontas da conta-pai com este CPF (GET /v3/accounts?cpfCnpj=): acha a conta criada numa tentativa cuja resposta se perdeu. */
export async function findSubaccountsByCpf(client: AsaasClient, cpf: string): Promise<FoundSubaccount[]> {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11 && digits.length !== 14) return [];
  return (await client.get("/accounts", { query: { cpfCnpj: digits, limit: 10 } }, accountListSchema)).data;
}

const accessTokenSchema = z.object({ id: nullableText, apiKey: z.string().min(10) }).loose();

/**
 * Nova chave para uma subconta (POST /v3/accounts/{id}/accessTokens, com a chave
 * da conta-pai). Só funciona com o gerenciamento de chaves liberado no painel do
 * Asaas (vale 2 h) e o IP do servidor na whitelist.
 */
export async function createSubaccountApiKey(client: AsaasClient, accountId: string, name: string): Promise<string> {
  if (!SAFE_ID.test(accountId)) throw new Error("[asaas] subconta inválida.");
  return (await client.post(`/accounts/${accountId}/accessTokens`, { name: name.slice(0, 60) }, {}, accessTokenSchema)).apiKey;
}

/** Aprovação simulada (POST /v3/sandbox/myAccount/approve). Não existe em produção. */
export function approveSandboxAccount(client: AsaasClient, apiKey: string): Promise<AccountStatusInfo> {
  if (client.environment !== "sandbox") throw new Error("[asaas] aprovação simulada só existe no sandbox.");
  return client.post("/sandbox/myAccount/approve", {}, { apiKey }, accountStatusSchema);
}
