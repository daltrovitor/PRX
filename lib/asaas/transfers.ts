// Hello World
import { z } from "zod";
import type { AsaasClient } from "@/lib/asaas/client";
import type { PixKeyType } from "@/lib/prx/pix";

/**
 * Saída de dinheiro da subconta: Pix por chave (POST /v3/transfers), leitura e
 * pagamento de QR Code Pix (POST /v3/pix/qrCodes/decode e /pay) e pagamento de
 * contas (POST /v3/bill/simulate e /v3/bill). Toda saída leva externalReference
 * = id do pedido na PRX, que o webhook de validação de saque confere.
 */

const ASAAS_KEY_TYPE: Record<PixKeyType, string> = { cpf: "CPF", cnpj: "CNPJ", email: "EMAIL", phone: "PHONE", random: "EVP" };

/** Chave no formato que o Asaas pede: CPF/CNPJ só dígitos, celular com DDD (11 dígitos, sem +55). */
export function asaasPixKey(key: string, type: PixKeyType): { pixAddressKey: string; pixAddressKeyType: string } {
  const digits = key.replace(/\D/g, "");
  const value = type === "cpf" || type === "cnpj" ? digits : type === "phone" ? digits.replace(/^55(?=\d{11}$)/, "") : key.trim();
  return { pixAddressKey: type === "email" ? value.toLowerCase() : value, pixAddressKeyType: ASAAS_KEY_TYPE[type] };
}

const text = z.string().nullish().transform((v) => v ?? null);
const amount = z.number().nullish().transform((v) => v ?? null);

const transferSchema = z
  .object({
    id: z.string().min(1),
    status: z.string(),
    value: z.number(),
    failReason: text,
    endToEndIdentifier: text,
    externalReference: text,
  })
  .loose();
export type AsaasTransfer = z.output<typeof transferSchema>;

export function createPixTransfer(
  client: AsaasClient,
  apiKey: string,
  input: { key: string; type: PixKeyType; value: number; description: string; externalReference: string }
): Promise<AsaasTransfer> {
  return client.post(
    "/transfers",
    { ...asaasPixKey(input.key, input.type), value: input.value, description: input.description || undefined, externalReference: input.externalReference },
    { apiKey },
    transferSchema
  );
}

const decodedSchema = z.object({
  payload: z.string(),
  pixKey: text,
  value: amount,
  totalValue: amount,
  canBePaidWithDifferentValue: z.boolean().nullish().transform((v) => v ?? false),
  expirationDate: text,
  description: text,
  receiver: z
    .object({ name: text, tradingName: text, ispbName: text, cpfCnpj: text })
    .nullish()
    .transform((v) => v ?? null),
});
export type DecodedQrCode = z.output<typeof decodedSchema>;

export function decodePixQrCode(client: AsaasClient, apiKey: string, payload: string): Promise<DecodedQrCode> {
  return client.post("/pix/qrCodes/decode", { payload }, { apiKey }, decodedSchema);
}

const qrPaymentSchema = z.object({
  id: z.string().min(1),
  status: text,
  value: z.number(),
  endToEndIdentifier: text,
});

export function payPixQrCode(client: AsaasClient, apiKey: string, input: { payload: string; value: number; description: string }): Promise<z.output<typeof qrPaymentSchema>> {
  return client.post("/pix/qrCodes/pay", { qrCode: { payload: input.payload }, value: input.value, description: input.description || undefined }, { apiKey }, qrPaymentSchema);
}

const billSimulationSchema = z.object({
  minimumScheduleDate: text,
  fee: amount,
  bankSlipInfo: z.object({
    identificationField: text,
    value: amount,
    dueDate: text,
    companyName: text,
    beneficiaryName: text,
    bank: text,
    isOverdue: z.boolean().nullish().transform((v) => v ?? false),
  }),
});
export type BillSimulation = z.output<typeof billSimulationSchema>;

export function simulateBill(client: AsaasClient, apiKey: string, identificationField: string): Promise<BillSimulation> {
  return client.post("/bill/simulate", { identificationField }, { apiKey }, billSimulationSchema);
}

/** failReasons é lista na referência atual (BillGetResponseDTO); texto em respostas antigas. */
const failReasons = z
  .union([z.string(), z.array(z.string())])
  .nullish()
  .transform((v) => (Array.isArray(v) ? v.join(" ") || null : (v ?? null)));

const billSchema = z
  .object({
    id: z.string().min(1),
    status: z.string(),
    value: amount,
    failReasons,
    externalReference: text,
  })
  .loose();

export function payBill(
  client: AsaasClient,
  apiKey: string,
  input: { identificationField: string; value: number; description: string; externalReference: string }
): Promise<z.output<typeof billSchema>> {
  return client.post("/bill", { ...input, description: input.description || undefined }, { apiKey }, billSchema);
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const safeId = (id: string) => {
  if (!SAFE_ID.test(id)) throw new Error("[asaas] identificador inválido.");
  return id;
};

/** Estado atual de uma transferência (conciliação). Estados: PENDING, BANK_PROCESSING, DONE, CANCELLED, FAILED. */
export function getTransfer(client: AsaasClient, apiKey: string, id: string): Promise<AsaasTransfer> {
  return client.get(`/transfers/${safeId(id)}`, { apiKey }, transferSchema);
}

const transferListSchema = z.object({
  hasMore: z.boolean().nullish().transform((v) => v ?? false),
  data: z
    .array(transferSchema)
    .nullish()
    .transform((v) => v ?? []),
});

/** Transferências criadas no dia (AAAA-MM-DD): acha pelo externalReference uma transferência cuja resposta se perdeu. */
export function listTransfersOn(client: AsaasClient, apiKey: string, day: string): Promise<z.output<typeof transferListSchema>> {
  return client.get("/transfers", { apiKey, query: { "dateCreated[ge]": day, "dateCreated[le]": day, limit: 100 } }, transferListSchema);
}

const pixTransactionSchema = z
  .object({
    id: z.string().min(1),
    status: z.string(),
    value: amount,
    endToEndIdentifier: text,
    refusalReason: text,
  })
  .loose();

/** Estado de um pagamento de QR Code (GET /v3/pix/transactions/{id}): DONE, REFUSED, CANCELLED ou em processamento. */
export function getPixTransaction(client: AsaasClient, apiKey: string, id: string): Promise<z.output<typeof pixTransactionSchema>> {
  return client.get(`/pix/transactions/${safeId(id)}`, { apiKey }, pixTransactionSchema);
}

/** Estado de um pagamento de conta (GET /v3/bill/{id}): PENDING, BANK_PROCESSING, PAID, FAILED, CANCELLED, REFUNDED. */
export function getBill(client: AsaasClient, apiKey: string, id: string): Promise<z.output<typeof billSchema>> {
  return client.get(`/bill/${safeId(id)}`, { apiKey }, billSchema);
}
