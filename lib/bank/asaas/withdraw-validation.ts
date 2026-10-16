// Hello World
import { z } from "zod";
import { isUuid } from "@/lib/partners/catalog";
import type { AsaasDeps } from "@/lib/bank/asaas/deps";
import type { OutgoingKind, OutgoingRequest } from "@/lib/bank/asaas/types";

/**
 * Webhook de validação de saque (POST /api/bank/webhooks/validate-withdraw).
 * O Asaas pergunta, ~5 s depois de cada saída, se ela foi pedida por nós. Só
 * aprovamos o que está em bank_outgoing_requests: confirmado pelo membro,
 * mesmo valor, tipo compatível e recente. Qualquer outra coisa é recusada
 * (inclusive saídas que não nasceram no app PRX).
 */

const looseObject = z.record(z.string(), z.unknown());

export const withdrawValidationSchema = z.object({
  type: z.string().trim().min(1).max(40),
  transfer: looseObject.nullish(),
  bill: looseObject.nullish(),
  pixQrCode: looseObject.nullish(),
  mobilePhoneRecharge: looseObject.nullish(),
  pixRefund: looseObject.nullish(),
  paymentSplit: looseObject.nullish(),
});
export type WithdrawValidation = z.output<typeof withdrawValidationSchema>;

export type ValidationAnswer = { status: "APPROVED" } | { status: "REFUSED"; refuseReason: string };

/** Tipos de operação do Asaas que cada pedido da PRX pode gerar. */
const COMPATIBLE: Record<string, readonly OutgoingKind[]> = {
  TRANSFER: ["pix_key", "pix_qr"],
  PIX_QR_CODE: ["pix_qr"],
  BILL: ["bill"],
};

/** Confirmado há no máximo isto (o Asaas valida ~5 s depois; folga para retentativas). */
const MAX_AGE_MS = 15 * 60_000;
const LOOKUP_ATTEMPTS = 3;
const LOOKUP_DELAY_MS = 800;

const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);
const refuse = (refuseReason: string): ValidationAnswer => ({ status: "REFUSED", refuseReason });

/** Só os pedidos do próprio PRX: a validação não depende da chave do Asaas estar ligada neste deploy. */
export type ValidationDeps = Pick<AsaasDeps, "store" | "now">;

async function lookup(object: Record<string, unknown>, deps: ValidationDeps): Promise<OutgoingRequest | null> {
  const ref = str(object.externalReference);
  if (ref && isUuid(ref)) {
    const found = await deps.store.getOutgoing(ref);
    if (found) return found;
  }
  const id = str(object.id);
  return id ? deps.store.findOutgoingByProviderRef(id) : null;
}

export async function validateWithdraw(input: WithdrawValidation, deps: ValidationDeps, wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Promise<ValidationAnswer> {
  const kinds = COMPATIBLE[input.type.toUpperCase()];
  const object = input.transfer ?? input.bill ?? input.pixQrCode ?? null;
  if (!kinds || !object) return refuse("Operação não reconhecida pela PRX.");

  // O id do Asaas é gravado logo depois da resposta da criação: espera um pouco se ainda não chegou.
  let request: OutgoingRequest | null = null;
  for (let attempt = 0; attempt < LOOKUP_ATTEMPTS && !request; attempt++) {
    if (attempt > 0) await wait(LOOKUP_DELAY_MS);
    request = await lookup(object, deps);
  }
  if (!request) return refuse("Operação não encontrada na PRX.");
  if (!kinds.includes(request.kind)) return refuse("Tipo de operação diferente do pedido na PRX.");

  const value = typeof object.value === "number" ? object.value : Number.NaN;
  if (!(Math.abs(value - request.amount) < 0.005)) return refuse("Valor diferente do confirmado pelo cliente.");
  if (request.status === "approved") return { status: "APPROVED" };
  if (request.status !== "requested" || !request.confirmedAt) return refuse("Operação não confirmada pelo cliente.");
  if (deps.now().getTime() - new Date(request.confirmedAt).getTime() > MAX_AGE_MS) return refuse("Confirmação expirada.");

  const id = str(object.id);
  if (id && !request.providerRef) await deps.store.attachProviderRef(request.id, id);
  if (id && request.providerRef && request.providerRef !== id) return refuse("Operação diferente da registrada na PRX.");
  const approved = await deps.store.transitionOutgoing(request.id, ["requested"], "approved");
  return approved || (await deps.store.getOutgoing(request.id))?.status === "approved" ? { status: "APPROVED" } : refuse("Operação já decidida.");
}
