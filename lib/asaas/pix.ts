// Hello World
import { z } from "zod";
import type { AsaasClient } from "@/lib/asaas/client";

/**
 * Entrada de dinheiro na subconta: chaves Pix (DICT), clientes e cobranças Pix
 * com QR Code dinâmico. Todas as chamadas saem com a apiKey da subconta.
 */

export const ASAAS_KEY_TYPES = ["CPF", "CNPJ", "EMAIL", "PHONE", "EVP"] as const;
export type AsaasKeyType = (typeof ASAAS_KEY_TYPES)[number];

const pixKeySchema = z.object({
  id: z.string().min(1),
  key: z.string().nullish().transform((v) => v ?? ""),
  type: z.string(),
  status: z.string(),
  dateCreated: z.string().nullish().transform((v) => v ?? null),
});
export type AsaasPixKey = z.output<typeof pixKeySchema>;

const pixKeyListSchema = z.object({
  data: z
    .array(pixKeySchema)
    .nullish()
    .transform((v) => v ?? []),
});

export async function listPixKeys(client: AsaasClient, apiKey: string): Promise<AsaasPixKey[]> {
  const list = await client.get("/pix/addressKeys", { apiKey, query: { limit: 20 } }, pixKeyListSchema);
  return list.data;
}

/** Pela API o Asaas cria só chave aleatória (EVP); as demais o membro registra pelo próprio CPF/e-mail/celular depois. */
export function createEvpKey(client: AsaasClient, apiKey: string): Promise<AsaasPixKey> {
  return client.post("/pix/addressKeys", { type: "EVP" }, { apiKey }, pixKeySchema);
}

const PIX_KEY_ID = /^[A-Za-z0-9-]{8,64}$/;

/** Exclui a chave do Pix (DICT). O Asaas recusa a exclusão de chaves com motivo (cannotBeDeletedReason). */
export async function deletePixKey(client: AsaasClient, apiKey: string, keyId: string): Promise<void> {
  if (!PIX_KEY_ID.test(keyId)) throw new Error("[asaas] chave Pix inválida.");
  await client.delete(`/pix/addressKeys/${keyId}`, { apiKey });
}

const customerSchema = z.object({ id: z.string().min(1) });

export function createCustomer(client: AsaasClient, apiKey?: string, input?: { name: string; cpfCnpj: string; email: string; mobilePhone: string }): Promise<{ id: string }> {
  const payload = input ?? (typeof apiKey === "object" ? apiKey : undefined);
  const key = typeof apiKey === "string" && apiKey.trim() ? apiKey.trim() : undefined;
  return client.post("/customers", { ...payload, notificationDisabled: true }, key ? { apiKey: key } : {}, customerSchema);
}

const paymentSchema = z.object({
  id: z.string().min(1),
  status: z.string(),
  value: z.number(),
});

export interface NewPixPayment {
  customer: string;
  value: number;
  dueDate: string;
  description: string;
  externalReference: string;
}

export function createPixPayment(client: AsaasClient, apiKey: string, input: NewPixPayment): Promise<z.output<typeof paymentSchema>> {
  return client.post("/payments", { ...input, billingType: "PIX" }, { apiKey }, paymentSchema);
}

const qrCodeSchema = z.object({
  encodedImage: z.string().nullish().transform((v) => v ?? null),
  payload: z.string().min(10),
  expirationDate: z.string().nullish().transform((v) => v ?? null),
});
export type PaymentQrCode = z.output<typeof qrCodeSchema>;

const PAYMENT_ID = /^pay_[A-Za-z0-9]{1,40}$/;

export function getPaymentQrCode(client: AsaasClient, apiKey: string, paymentId: string): Promise<PaymentQrCode> {
  if (!PAYMENT_ID.test(paymentId)) throw new Error("[asaas] cobrança inválida.");
  return client.get(`/payments/${paymentId}/pixQrCode`, { apiKey }, qrCodeSchema);
}

const customerNameSchema = z.object({ name: z.string().nullish().transform((v) => v ?? null) });

/** Nome do pagador (Pix recebido por chave vira um "cliente" na subconta). */
export async function customerName(client: AsaasClient, apiKey: string, customerId: string): Promise<string | null> {
  if (!/^cus_[A-Za-z0-9]{1,40}$/.test(customerId)) return null;
  return (await client.get(`/customers/${customerId}`, { apiKey }, customerNameSchema)).name;
}
