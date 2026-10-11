// Hello World
import { withAsaasAudit } from "@/lib/asaas/audit";
import { getBill, getPixTransaction, getTransfer, listTransfersOn } from "@/lib/asaas/transfers";
import { errorMessage } from "@/lib/errors";
import type { AsaasDeps } from "@/lib/bank/asaas/deps";
import { handleOutgoingEvent } from "@/lib/bank/asaas/outgoing-events";
import { requireSubaccount } from "@/lib/bank/asaas/subaccount";
import type { OutgoingRequest, Subaccount } from "@/lib/bank/asaas/types";

/**
 * Conciliação das saídas pedidas ao Asaas e ainda sem desfecho no PRX (webhook
 * perdido ou resposta que não chegou). Só consulta (GET), nunca repete a
 * operação: o estado vem de GET /transfers/{id}, /pix/transactions/{id} e
 * /bill/{id} (ou da lista do dia, pelo externalReference, quando o id se
 * perdeu). Desfecho final segue o mesmo caminho do webhook (idempotente).
 */

type Resolution =
  | { kind: "final"; event: string; object: Record<string, unknown> }
  | { kind: "pending" }
  /** Lista completa do dia sem a operação: o Asaas não a registrou. */
  | { kind: "absent" }
  /** Sem como consultar (QR Code ou conta sem id do Asaas): fica para o admin. */
  | { kind: "unknown" };

const TRANSFER_EVENT: Record<string, string> = { DONE: "TRANSFER_DONE", FAILED: "TRANSFER_FAILED", CANCELLED: "TRANSFER_CANCELLED" };
const PIX_EVENT: Record<string, string> = { DONE: "TRANSFER_DONE", REFUSED: "TRANSFER_FAILED", CANCELLED: "TRANSFER_CANCELLED" };
const BILL_EVENT: Record<string, string> = { PAID: "BILL_PAID", FAILED: "BILL_FAILED", CANCELLED: "BILL_CANCELLED", REFUNDED: "BILL_REFUNDED" };

/** Dia da criação no horário de Brasília (o filtro dateCreated do Asaas é por data local). */
const brasiliaDay = (iso: string) => new Date(Date.parse(iso) - 3 * 3_600_000).toISOString().slice(0, 10);

async function resolve(request: OutgoingRequest, apiKey: string, deps: AsaasDeps): Promise<Resolution> {
  if (request.kind === "pix_key") {
    let transfer = request.providerRef ? await getTransfer(deps.client, apiKey, request.providerRef) : null;
    if (!transfer) {
      const list = await listTransfersOn(deps.client, apiKey, brasiliaDay(request.createdAt));
      transfer = list.data.find((t) => t.externalReference === request.id) ?? null;
      if (!transfer) return list.hasMore ? { kind: "unknown" } : { kind: "absent" };
      await deps.store.attachProviderRef(request.id, transfer.id);
    }
    const event = TRANSFER_EVENT[transfer.status.toUpperCase()];
    return event ? { kind: "final", event, object: { ...transfer, externalReference: request.id } } : { kind: "pending" };
  }
  if (!request.providerRef) return { kind: "unknown" };
  if (request.kind === "pix_qr") {
    const tx = await getPixTransaction(deps.client, apiKey, request.providerRef);
    const event = PIX_EVENT[tx.status.toUpperCase()];
    return event ? { kind: "final", event, object: { id: request.providerRef, value: tx.value ?? request.amount, failReason: tx.refusalReason, endToEndIdentifier: tx.endToEndIdentifier } } : { kind: "pending" };
  }
  const bill = await getBill(deps.client, apiKey, request.providerRef);
  const event = BILL_EVENT[bill.status.toUpperCase()];
  return event ? { kind: "final", event, object: { ...bill, value: bill.value ?? request.amount, externalReference: request.id } } : { kind: "pending" };
}

/** QR Code: o id do webhook pode ser outro (transferência), então só o pedido muda; aviso e extrato ficam com o webhook. */
async function settleQr(request: OutgoingRequest, event: string, failReason: string | null, deps: AsaasDeps): Promise<void> {
  const open = ["requested", "approved"] as const;
  if (event === "TRANSFER_DONE") await deps.store.transitionOutgoing(request.id, open, "done", { outcomeUnknown: false });
  else await deps.store.transitionOutgoing(request.id, open, event === "TRANSFER_CANCELLED" ? "cancelled" : "failed", { failReason: failReason ?? "Pagamento não concluído.", outcomeUnknown: false });
}

export interface OutgoingReconcileReport {
  checked: number;
  settled: number;
  pending: number;
  /** Sem registro no Asaas há mais de 30 min: marcado como falha (nada saiu). */
  absent: number;
  /** Precisa de conferência manual (QR Code ou conta sem id do Asaas). */
  unknown: string[];
  errors: string[];
}

const ABSENT_AFTER_MS = 30 * 60_000;

export async function reconcileOutgoing(deps: AsaasDeps, options: { olderThanMs?: number; limit?: number } = {}): Promise<OutgoingReconcileReport> {
  const now = deps.now().getTime();
  const open = await deps.store.listOpenOutgoing(new Date(now - (options.olderThanMs ?? 3 * 60_000)).toISOString(), options.limit ?? 25);
  const report: OutgoingReconcileReport = { checked: open.length, settled: 0, pending: 0, absent: 0, unknown: [], errors: [] };
  for (const request of open) {
    try {
      await withAsaasAudit({ userId: request.userId, businessRef: request.id }, async () => {
        const { sub, apiKey }: { sub: Subaccount; apiKey: string } = await requireSubaccount(request.userId, deps);
        const result = await resolve(request, apiKey, deps);
        if (result.kind === "pending") report.pending += 1;
        else if (result.kind === "unknown") report.unknown.push(request.id);
        else if (result.kind === "absent") {
          if (now - Date.parse(request.createdAt) < ABSENT_AFTER_MS) return void (report.pending += 1);
          await deps.store.transitionOutgoing(request.id, ["requested", "approved"], "failed", { failReason: "O banco parceiro não registrou a operação; nada saiu.", outcomeUnknown: false });
          report.absent += 1;
        } else if (request.kind === "pix_qr") {
          await settleQr(request, result.event, typeof result.object.failReason === "string" ? result.object.failReason : null, deps);
          report.settled += 1;
        } else {
          const objectKey = request.kind === "bill" ? "bill" : "transfer";
          const id = String(result.object.id);
          await handleOutgoingEvent({ id: `reconcile:${id}:${result.event}`, event: result.event, account: { id: sub.asaasAccountId }, [objectKey]: result.object }, sub, deps);
          report.settled += 1;
        }
      });
    } catch (err) {
      report.errors.push(`${request.id}: ${errorMessage(err, "falha na consulta")}`);
    }
  }
  return report;
}
