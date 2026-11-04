// Hello World
import type { BankKycState } from "@/lib/kyc/types";
import type { PixKeyType } from "@/lib/prx/pix";
import { verticalOf } from "@/lib/points/partner-match";

/**
 * Domínio do PRX BANK (tipos e regras puras, seguros para o cliente).
 *
 * A conta de cada membro vive nas tabelas bank_* do Supabase e nasce zerada,
 * em "pending_activation". Saldo, extrato, Pix e cartões só passam a mover
 * dinheiro quando o banco parceiro (BaaS) for conectado: até lá nenhum número
 * é inventado. O que já funciona sem o BaaS: pré-cadastro de chaves Pix e
 * pedido do cartão físico, que são enviados ao banco na ativação.
 * Ver docs/PLANO_BAAS.md.
 */

export const ACCOUNT_STATUSES = ["pending_activation", "active", "blocked"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const ACCOUNT_STATUS_LABEL: Record<AccountStatus, string> = {
  pending_activation: "Em ativação",
  active: "Ativa",
  blocked: "Bloqueada",
};

export type TransactionKind = "pix_in" | "pix_out" | "card" | "cashback" | "ticket" | "bill";

export interface BankTransaction {
  id: string;
  kind: TransactionKind;
  direction: "in" | "out";
  amount: number;
  counterparty: string;
  description: string;
  createdAt: string;
  /** Nicho do gasto (vertical PRX) quando o recebedor é um parceiro reconhecido. */
  categoryId?: string | null;
  partnerId?: string | null;
}

export type PixKeyStatus = "pending_activation" | "active";

export interface PixKey {
  id: string;
  type: PixKeyType;
  value: string;
  status: PixKeyStatus;
  createdAt: string;
}

export const PIX_KEY_STATUS_LABEL: Record<PixKeyStatus, string> = {
  pending_activation: "Registro na ativação",
  active: "Ativa",
};

/** Dados do cartão virtual guardados pela PRX: nunca o número completo nem o CVV (ficam no emissor). */
export interface VirtualCard {
  last4: string;
  expiry: string;
  locked: boolean;
}

export const CARD_REQUEST_STATUSES = ["waiting_activation", "requested", "production", "shipped", "delivered", "cancelled"] as const;
export type CardRequestStatus = (typeof CARD_REQUEST_STATUSES)[number];

export const CARD_REQUEST_STATUS_LABEL: Record<CardRequestStatus, string> = {
  waiting_activation: "Aguardando ativação da conta",
  requested: "Pedido enviado ao emissor",
  production: "Em produção",
  shipped: "A caminho",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

export interface CardRequest {
  id: string;
  address: string;
  status: CardRequestStatus;
  trackingCode: string | null;
  createdAt: string;
}

export interface PixCharge {
  id: string;
  amount: number | null;
  description: string;
  payload: string;
  paid: boolean;
  createdAt: string;
}

/** Banco parceiro (BaaS) que opera a conta; o BankAccountView traz null enquanto nenhum provedor estiver ligado. */
export interface BankProviderView {
  name: string;
  environment: "sandbox" | "production";
  /** Subconta no parceiro: ainda não aberta, abrindo, em análise, ativa, bloqueada ou reprovada. */
  state: "none" | "provisioning" | "pending_activation" | "active" | "blocked" | "rejected";
  rejectReason: string | null;
}

/** O que o app recebe de /api/bank. */
export interface BankAccountView {
  status: AccountStatus;
  balance: number;
  agency: string | null;
  accountNumber: string | null;
  activatedAt: string | null;
  transactions: BankTransaction[];
  pixKeys: PixKey[];
  virtualCard: VirtualCard | null;
  cardRequest: CardRequest | null;
  charges: PixCharge[];
  /** Ambiente de testes (sem banco parceiro): permite ativar uma conta sandbox com saldo fictício. */
  sandbox: boolean;
  /** Abertura de conta (KYC bancário): sem aprovação a conta não existe no banco parceiro. */
  kyc: BankKycState;
  /** Banco parceiro ligado neste ambiente (null = sem BaaS: pré-ativação ou sandbox). */
  provider: BankProviderView | null;
  /** Etapa da abertura, decidida no servidor (lib/bank/activation.ts): a tela só mostra. */
  activation: BankActivation;
}

/**
 * Etapa da abertura do PRX BANK a partir do que está salvo (abertura no
 * Supabase, subconta no banco parceiro):
 *   form         sem abertura, ou recusada pela PRX: formulário
 *   waiting      abertura salva aguardando responsável, emancipação ou o banco parceiro
 *   unavailable  dados aprovados, mas o banco parceiro não atende agora: nada a reenviar
 *   ready        dados aprovados, conta ainda não criada no banco: abrir com os dados salvos
 *   opening      criação da conta em andamento
 *   review       conta criada no banco, em análise (documentos e aprovação)
 *   rejected     o banco pediu um novo envio
 *   active       conta liberada pelo banco (ou sandbox)
 *   blocked      conta bloqueada
 */
export type BankActivation = "form" | "waiting" | "unavailable" | "ready" | "opening" | "review" | "rejected" | "active" | "blocked";

export const MAX_PIX_KEYS = 5;
const DAY = 86_400_000;

export type StatementPeriod = 7 | 30 | 90 | 365;
export type StatementFilter = "all" | "in" | "out";

export function filterTransactions(list: BankTransaction[], period: StatementPeriod, filter: StatementFilter, now = Date.now()): BankTransaction[] {
  const since = now - period * DAY;
  return list.filter((tx) => new Date(tx.createdAt).getTime() >= since && (filter === "all" || tx.direction === filter));
}

export function summarize(list: BankTransaction[]): { income: number; outcome: number } {
  const totals = list.reduce(
    (acc, tx) => {
      if (tx.direction === "in") acc.income += tx.amount;
      else acc.outcome += tx.amount;
      return acc;
    },
    { income: 0, outcome: 0 }
  );
  return { income: Math.round(totals.income * 100) / 100, outcome: Math.round(totals.outcome * 100) / 100 };
}

/** Períodos do PRX Map: mês, trimestre e ano. */
export const MAP_PERIODS = [
  { value: 30, label: "Mensal (30 dias)", long: "Últimos 30 dias" },
  { value: 90, label: "90 dias", long: "Trimestre" },
  { value: 365, label: "Ano", long: "Últimos 12 meses" },
] as const satisfies ReadonlyArray<{ value: StatementPeriod; label: string; long: string }>;

export interface SpendingSlice {
  id: string;
  name: string;
  code: string;
  amount: number;
  /** Participação no total de saídas, 0–100 (soma 100 com arredondamento). */
  pct: number;
}

/** Nicho de uma saída: parceiro reconhecido, ingresso (PLAY) ou "Outros". */
function spendingCategory(tx: BankTransaction): string {
  if (tx.categoryId) return tx.categoryId;
  if (tx.kind === "ticket") return "entretenimento";
  return "outros";
}

/**
 * Distribuição das saídas por nicho para o gráfico PRX Map, da maior para a
 * menor. Entradas e estornos não entram.
 */
export function spendingByCategory(list: BankTransaction[]): SpendingSlice[] {
  const totals = new Map<string, number>();
  for (const tx of list) {
    if (tx.direction !== "out" || !(tx.amount > 0)) continue;
    const id = spendingCategory(tx);
    totals.set(id, (totals.get(id) ?? 0) + tx.amount);
  }
  const total = [...totals.values()].reduce((sum, n) => sum + n, 0);
  if (total <= 0) return [];
  const slices = [...totals.entries()]
    .map(([id, amount]) => {
      const vertical = verticalOf(id);
      return { id: vertical.id, name: vertical.name, code: vertical.code, amount: Math.round(amount * 100) / 100, pct: (amount / total) * 100 };
    })
    .sort((a, b) => b.amount - a.amount);
  // Maiores restos: as porcentagens inteiras sempre somam 100.
  const floors = slices.map((s) => Math.floor(s.pct));
  let missing = 100 - floors.reduce((sum, n) => sum + n, 0);
  const order = slices.map((s, i) => ({ i, rest: s.pct - floors[i] })).sort((a, b) => b.rest - a.rest);
  for (const { i } of order) {
    if (missing <= 0) break;
    floors[i] += 1;
    missing -= 1;
  }
  return slices.map((s, i) => ({ ...s, pct: floors[i] }));
}

export const TRANSACTION_LABEL: Record<TransactionKind, string> = {
  pix_in: "Pix recebido",
  pix_out: "Pix enviado",
  card: "Cartão",
  cashback: "Cashback",
  ticket: "Ingresso",
  bill: "Conta paga",
};

/** Mensagem única para operações que dependem do banco parceiro. */
export const ACTIVATION_REQUIRED = "Disponível quando sua conta PRX BANK for ativada.";
