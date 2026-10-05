// Hello World
import { z } from "zod";
import { PartnerError } from "@/lib/partners/errors";
import { AsaasError, toPartnerError } from "@/lib/asaas/errors";
import { getBalance } from "@/lib/asaas/finance";
import { createPixTransfer, decodePixQrCode, payBill, payPixQrCode, simulateBill } from "@/lib/asaas/transfers";
import { assertMinorSpend } from "@/lib/family/guards";
import { onlyDigits } from "@/lib/family/types";
import type { BankTransaction } from "@/lib/prx/bank";
import { PIX_KEY_LABEL, detectPixKeyType, parsePixPayload } from "@/lib/prx/pix";
import type { AsaasDeps } from "@/lib/bank/asaas/deps";
import { assertNightLimit } from "@/lib/bank/asaas/limits";
import { brl } from "@/lib/bank/asaas/messages";
import { requireActiveSubaccount, sinceSubaccount } from "@/lib/bank/asaas/onboarding";
import type { OutgoingKind, OutgoingRequest } from "@/lib/bank/asaas/types";

/**
 * Saída de dinheiro (Pix por chave, Pix QR Code e pagamento de contas) em dois
 * passos: preparar (valida limites e saldo e registra o pedido aguardando
 * confirmação) e confirmar (biometria ou senha conferidas antes; troca de
 * status atômica, então um pedido nunca sai duas vezes). O webhook de validação
 * de saque só aprova no Asaas o que estiver registrado aqui.
 */

/** Tempo para confirmar um pedido preparado. */
export const CONFIRMATION_TTL_MS = 10 * 60_000;

const money = z.coerce.number().positive("Informe o valor.").max(50_000, "Limite de R$ 50.000 por operação.");

export const preparePixSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("key"), key: z.string().trim().min(1, "Informe a chave Pix.").max(140), amount: money, description: z.string().trim().max(60).default("") }),
  z.object({ method: z.literal("qr"), payload: z.string().trim().min(20, "Código Pix inválido.").max(1000), amount: money.optional(), description: z.string().trim().max(60).default("") }),
]);
export type PreparePixInput = z.output<typeof preparePixSchema>;

export const prepareBillSchema = z.object({
  identificationField: z
    .string()
    .transform(onlyDigits)
    .refine((v) => v.length === 47 || v.length === 48, "Linha digitável inválida: confira os 47 ou 48 números."),
  description: z.string().trim().max(60).default(""),
});
export type PrepareBillInput = z.output<typeof prepareBillSchema>;

export interface PreparedOutgoing {
  requestId: string;
  kind: OutgoingKind;
  amount: number;
  recipient: string;
  institution: string | null;
  /** CPF/CNPJ do recebedor com máscara (só os dígitos do meio). */
  document: string | null;
  dueDate: string | null;
  fee: number | null;
  expiresAt: string;
}

const round = (value: number) => Math.round(value * 100) / 100;

/** CPF/CNPJ mascarado como nos comprovantes Pix: ***.456.789-** */
export function maskDocument(doc: string | null | undefined): string | null {
  const digits = (doc ?? "").replace(/\D/g, "");
  if (digits.length === 11) return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
  if (digits.length === 14) return `**.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-**`;
  return null;
}

/** Limites do membro e saldo no Asaas. Repetido na confirmação: o tempo passou desde a revisão. */
async function assertCanSend(userId: string, amount: number, fee: number, deps: AsaasDeps, transactions: ReadonlyArray<BankTransaction>): Promise<string> {
  const { sub, apiKey } = await requireActiveSubaccount(userId, deps);
  await assertMinorSpend(userId, amount, transactions, deps.now());
  // Saídas do sandbox (antes da subconta deste ambiente) não contam no limite noturno.
  await assertNightLimit(amount, deps.now(), (since) => deps.store.outgoingTotalSince(userId, sinceSubaccount(sub, since) ? since : sub.createdAt));
  let balance: number;
  try {
    balance = await getBalance(deps.client, apiKey);
  } catch (err) {
    throw toPartnerError(err, "Não foi possível consultar o saldo.");
  }
  if (round(amount + fee) > balance) throw new PartnerError(`Saldo insuficiente. Disponível: ${brl(balance)}.`, 409);
  return apiKey;
}

function prepared(request: OutgoingRequest, extra: Partial<PreparedOutgoing> = {}): PreparedOutgoing {
  return {
    requestId: request.id,
    kind: request.kind,
    amount: request.amount,
    recipient: request.counterparty,
    institution: null,
    document: null,
    dueDate: null,
    fee: null,
    expiresAt: new Date(new Date(request.createdAt).getTime() + CONFIRMATION_TTL_MS).toISOString(),
    ...extra,
  };
}

export async function preparePix(userId: string, input: PreparePixInput, deps: AsaasDeps, transactions: ReadonlyArray<BankTransaction>): Promise<PreparedOutgoing> {
  if (input.method === "key") {
    const type = detectPixKeyType(input.key);
    if (!type) throw new PartnerError("Chave Pix inválida. Use CPF, CNPJ, e-mail, celular com DDD ou chave aleatória.", 422);
    const amount = round(input.amount);
    await assertCanSend(userId, amount, 0, deps, transactions);
    const request = await deps.store.insertOutgoing({ userId, kind: "pix_key", amount, counterparty: `${PIX_KEY_LABEL[type]} ${input.key}`, target: input.key, description: input.description });
    return prepared(request);
  }

  const { apiKey } = await requireActiveSubaccount(userId, deps);
  let decoded;
  try {
    decoded = await decodePixQrCode(deps.client, apiKey, input.payload);
  } catch (err) {
    throw toPartnerError(err, "Não foi possível ler este código Pix.");
  }
  const fixed = decoded.totalValue ?? decoded.value;
  const amount = round(fixed && !decoded.canBePaidWithDifferentValue ? fixed : (input.amount ?? fixed ?? 0));
  if (!(amount > 0)) throw new PartnerError("Informe o valor do Pix.", 422);
  await assertCanSend(userId, amount, 0, deps, transactions);
  const recipient = decoded.receiver?.name ?? decoded.receiver?.tradingName ?? parsePixPayload(input.payload)?.merchantName ?? "Recebedor Pix";
  const request = await deps.store.insertOutgoing({ userId, kind: "pix_qr", amount, counterparty: recipient, target: input.payload, description: input.description || decoded.description || "" });
  return prepared(request, { institution: decoded.receiver?.ispbName ?? null, document: maskDocument(decoded.receiver?.cpfCnpj) });
}

export async function prepareBill(userId: string, input: PrepareBillInput, deps: AsaasDeps, transactions: ReadonlyArray<BankTransaction>): Promise<PreparedOutgoing> {
  const { apiKey } = await requireActiveSubaccount(userId, deps);
  let simulation;
  try {
    simulation = await simulateBill(deps.client, apiKey, input.identificationField);
  } catch (err) {
    throw toPartnerError(err, "Não foi possível ler esta conta.");
  }
  const amount = round(simulation.bankSlipInfo.value ?? 0);
  if (!(amount > 0)) throw new PartnerError("Esta conta não informa o valor. Confira a linha digitável.", 422);
  const fee = round(simulation.fee ?? 0);
  await assertCanSend(userId, amount, fee, deps, transactions);
  const recipient = simulation.bankSlipInfo.companyName ?? simulation.bankSlipInfo.beneficiaryName ?? "Conta";
  const request = await deps.store.insertOutgoing({ userId, kind: "bill", amount, counterparty: recipient, target: input.identificationField, description: input.description || recipient });
  return prepared(request, { institution: simulation.bankSlipInfo.bank, dueDate: simulation.bankSlipInfo.dueDate, fee: fee > 0 ? fee : null });
}

/** Pedido do próprio membro que ainda aguarda confirmação e está no prazo. */
export async function pendingRequest(userId: string, requestId: string, deps: AsaasDeps): Promise<OutgoingRequest> {
  const request = await deps.store.getOutgoing(requestId);
  if (!request || request.userId !== userId) throw new PartnerError("Operação não encontrada.", 404);
  if (request.status !== "awaiting_confirmation") throw new PartnerError("Esta operação já foi confirmada ou cancelada.", 409);
  if (deps.now().getTime() - new Date(request.createdAt).getTime() > CONFIRMATION_TTL_MS) {
    await deps.store.transitionOutgoing(request.id, ["awaiting_confirmation"], "expired");
    throw new PartnerError("A confirmação expirou. Revise a operação e tente de novo.", 409);
  }
  return request;
}

/**
 * Executa no Asaas um pedido já confirmado pelo membro (a prova de biometria
 * ou senha é conferida pela rota antes). Devolve o pedido atualizado.
 */
export async function executeOutgoing(userId: string, requestId: string, deps: AsaasDeps, transactions: ReadonlyArray<BankTransaction>): Promise<OutgoingRequest> {
  const request = await pendingRequest(userId, requestId, deps);
  const apiKey = await assertCanSend(userId, request.amount, 0, deps, transactions);
  const claimed = await deps.store.transitionOutgoing(request.id, ["awaiting_confirmation"], "requested", { confirmedAt: deps.now().toISOString() });
  if (!claimed) throw new PartnerError("Esta operação já foi confirmada.", 409);

  try {
    let providerRef: string;
    if (claimed.kind === "pix_key") {
      const type = detectPixKeyType(claimed.target);
      if (!type) throw new PartnerError("Chave Pix inválida.", 422);
      const transfer = await createPixTransfer(deps.client, apiKey, { key: claimed.target, type, value: claimed.amount, description: claimed.description, externalReference: claimed.id });
      if (transfer.status === "FAILED" || transfer.status === "CANCELLED") throw new PartnerError(transfer.failReason ?? "O banco parceiro recusou a transferência.", 422);
      providerRef = transfer.id;
    } else if (claimed.kind === "pix_qr") {
      providerRef = (await payPixQrCode(deps.client, apiKey, { payload: claimed.target, value: claimed.amount, description: claimed.description })).id;
    } else {
      providerRef = (await payBill(deps.client, apiKey, { identificationField: claimed.target, value: claimed.amount, description: claimed.description, externalReference: claimed.id })).id;
    }
    await deps.store.attachProviderRef(claimed.id, providerRef);
    return { ...claimed, providerRef };
  } catch (err) {
    // Recusa clara: o pedido falha e nada saiu. Resultado incerto: fica "pedido" até o webhook decidir.
    if (!(err instanceof AsaasError && err.ambiguous)) {
      const reason = err instanceof Error ? err.message : "Recusado pelo banco parceiro.";
      await deps.store.transitionOutgoing(claimed.id, ["requested", "approved"], "failed", { failReason: reason });
    }
    throw toPartnerError(err, "Não foi possível concluir a operação.");
  }
}

export async function cancelOutgoing(userId: string, requestId: string, deps: AsaasDeps): Promise<void> {
  const request = await deps.store.getOutgoing(requestId);
  if (!request || request.userId !== userId) throw new PartnerError("Operação não encontrada.", 404);
  await deps.store.transitionOutgoing(request.id, ["awaiting_confirmation"], "cancelled");
}
