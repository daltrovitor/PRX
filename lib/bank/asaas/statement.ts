// Hello World
import { z } from "zod";
import { hideProviderName, toPartnerError } from "@/lib/asaas/errors";
import { getBalance, listFinancialTransactions, type FinancialTransaction } from "@/lib/asaas/finance";
import type { AsaasDeps } from "@/lib/bank/asaas/deps";
import { requireActiveSubaccount } from "@/lib/bank/asaas/subaccount";

/**
 * Saldo e extrato oficiais, direto do Asaas. O saldo consultado fica em cache
 * em bank_accounts para a aba abrir rápido mesmo se o parceiro oscilar.
 */

export async function providerBalance(userId: string, deps: AsaasDeps): Promise<number> {
  const { apiKey } = await requireActiveSubaccount(userId, deps);
  try {
    const balance = await getBalance(deps.client, apiKey);
    await deps.mirror.cacheBalance(userId, balance);
    return balance;
  } catch (err) {
    throw toPartnerError(err, "Não foi possível consultar o saldo.");
  }
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD.");

export const statementQuerySchema = z
  .object({
    offset: z.coerce.number().int().min(0).max(10_000).default(0),
    limit: z.coerce.number().int().min(1).max(100).default(30),
    startDate: isoDate.optional(),
    finishDate: isoDate.optional(),
  })
  .refine((q) => !q.startDate || !q.finishDate || q.startDate <= q.finishDate, { message: "A data inicial precisa ser antes da final.", path: ["startDate"] });
export type StatementQuery = z.output<typeof statementQuerySchema>;

export interface StatementItem {
  id: string;
  direction: "in" | "out";
  amount: number;
  /** Saldo depois do lançamento, quando o Asaas informa. */
  balance: number | null;
  label: string;
  description: string;
  date: string;
}

/** Rótulos dos tipos mais comuns do extrato do Asaas; o resto usa a descrição. */
const TYPE_LABEL: Record<string, string> = {
  PIX_TRANSACTION_CREDIT: "Pix recebido",
  PIX_TRANSACTION_DEBIT: "Pix enviado",
  PIX_TRANSACTION_CREDIT_REFUND: "Pix devolvido",
  PIX_TRANSACTION_DEBIT_REFUND: "Estorno de Pix",
  PAYMENT_RECEIVED: "Cobrança recebida",
  PAYMENT_FEE: "Tarifa de cobrança",
  TRANSFER: "Transferência",
  TRANSFER_FEE: "Tarifa de transferência",
  TRANSFER_REVERSAL: "Transferência estornada",
  BILL_PAYMENT: "Conta paga",
  BILL_PAYMENT_FEE: "Tarifa de pagamento de conta",
  BILL_PAYMENT_CANCELLED: "Pagamento de conta cancelado",
  BILL_PAYMENT_REFUND: "Pagamento de conta estornado",
  INTERNAL_TRANSFER_CREDIT: "Transferência recebida",
  INTERNAL_TRANSFER_DEBIT: "Transferência enviada",
};

export function toStatementItem(tx: FinancialTransaction): StatementItem {
  return {
    id: tx.id,
    direction: tx.value >= 0 ? "in" : "out",
    amount: Math.round(Math.abs(tx.value) * 100) / 100,
    balance: tx.balance,
    label: TYPE_LABEL[tx.type] ?? hideProviderName(tx.description ?? "") ?? "Lançamento",
    description: hideProviderName(tx.description ?? ""),
    date: tx.date,
  };
}

export async function providerStatement(userId: string, query: StatementQuery, deps: AsaasDeps): Promise<{ items: StatementItem[]; hasMore: boolean; totalCount: number; nextOffset: number | null }> {
  const { apiKey } = await requireActiveSubaccount(userId, deps);
  try {
    const page = await listFinancialTransactions(deps.client, apiKey, query);
    return {
      items: page.data.map(toStatementItem),
      hasMore: page.hasMore,
      totalCount: page.totalCount,
      nextOffset: page.hasMore ? query.offset + page.data.length : null,
    };
  } catch (err) {
    throw toPartnerError(err, "Não foi possível carregar o extrato.");
  }
}
