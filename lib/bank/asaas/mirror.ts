// Hello World
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/client";
import { dbError } from "@/lib/partners/errors";
import type { AccountStatus, TransactionKind } from "@/lib/prx/bank";

/**
 * Espelho do Asaas nas tabelas do PRX BANK que o app já lê (bank_accounts,
 * bank_transactions, bank_pix_charges). Lançamentos são idempotentes pelo id
 * do Asaas (provider_ref), então um webhook repetido nunca duplica o extrato.
 */

export interface MirrorTransaction {
  kind: TransactionKind;
  direction: "in" | "out";
  amount: number;
  counterparty: string;
  description: string;
  providerRef: string;
  createdAt: string;
  status?: "pending" | "settled" | "reversed";
}

export interface MirrorCharge {
  amount: number;
  description: string;
  payload: string;
  providerRef: string;
}

export interface BankMirror {
  linkAccount(userId: string, data: { providerAccountId: string; agency: string | null; accountNumber: string | null }): Promise<void>;
  setAccountStatus(userId: string, status: AccountStatus, activatedAt?: string): Promise<void>;
  /** Volta a conta a "em ativação", sem saldo, cartão, agência nem vínculo (restos do sandbox). */
  resetAccount(userId: string): Promise<void>;
  cacheBalance(userId: string, balance: number): Promise<void>;
  upsertTransaction(userId: string, tx: MirrorTransaction): Promise<void>;
  /** Marca o lançamento como estornado (Pix devolvido, boleto recusado). */
  reverseTransaction(providerRef: string): Promise<void>;
  /** Nicho e parceiro do gasto (PRX Map) quando o Pix foi para um parceiro PRX. */
  categorizeTransaction(providerRef: string, data: { categoryId: string; partnerId: string | null; counterparty: string }): Promise<void>;
  saveCharge(userId: string, charge: MirrorCharge): Promise<void>;
  /** Marca a cobrança paga; devolve o dono, ou null se não era uma cobrança da PRX. */
  markChargePaid(providerRef: string, paidAt: string): Promise<string | null>;
}

const money = (value: number) => Math.round(value * 100) / 100;

type Db = NonNullable<typeof supabaseAdmin>;

class SupabaseBankMirror implements BankMirror {
  constructor(private readonly db: Db) {}

  /** A linha da conta precisa existir antes de qualquer lançamento (FK do extrato). */
  private async ensureAccount(userId: string): Promise<void> {
    const { error } = await this.db.from("bank_accounts").upsert({ user_id: userId, status: "pending_activation", balance: 0 }, { onConflict: "user_id", ignoreDuplicates: true });
    if (error) throw dbError(error, "Não foi possível abrir a conta");
  }

  async linkAccount(userId: string, data: { providerAccountId: string; agency: string | null; accountNumber: string | null }) {
    await this.ensureAccount(userId);
    const { error } = await this.db
      .from("bank_accounts")
      .update({ provider: "asaas", provider_account_id: data.providerAccountId, agency: data.agency, account_number: data.accountNumber, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    if (error) throw dbError(error, "Não foi possível vincular a conta ao banco parceiro");
  }

  async resetAccount(userId: string) {
    const { error } = await this.db
      .from("bank_accounts")
      .update({ status: "pending_activation", balance: 0, agency: null, account_number: null, provider: null, provider_account_id: null, card_last4: null, card_expiry: null, card_locked: false, activated_at: null, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    if (error) throw dbError(error, "Não foi possível reiniciar a conta");
  }

  async setAccountStatus(userId: string, status: AccountStatus, activatedAt?: string) {
    await this.ensureAccount(userId);
    const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    // Conta em ativação é sempre zero (bank_accounts_pending_is_zero).
    if (status === "pending_activation") patch.balance = 0;
    if (activatedAt) patch.activated_at = activatedAt;
    const { error } = await this.db.from("bank_accounts").update(patch).eq("user_id", userId);
    if (error) throw dbError(error, "Não foi possível atualizar a conta");
  }

  async cacheBalance(userId: string, balance: number) {
    const { error } = await this.db.from("bank_accounts").update({ balance: money(balance) }).eq("user_id", userId).eq("status", "active");
    if (error) console.warn("[bank] saldo em cache não gravado:", error.code, error.message);
  }

  async upsertTransaction(userId: string, tx: MirrorTransaction) {
    await this.ensureAccount(userId);
    const { error } = await this.db.from("bank_transactions").upsert(
      {
        user_id: userId,
        kind: tx.kind,
        direction: tx.direction,
        amount: money(tx.amount),
        counterparty: tx.counterparty.slice(0, 140),
        description: tx.description.slice(0, 140),
        status: tx.status ?? "settled",
        provider_ref: tx.providerRef,
        created_at: tx.createdAt,
      },
      { onConflict: "provider_ref", ignoreDuplicates: true }
    );
    if (error) throw dbError(error, "Não foi possível registrar o lançamento");
  }

  async reverseTransaction(providerRef: string) {
    const { error } = await this.db.from("bank_transactions").update({ status: "reversed" }).eq("provider_ref", providerRef);
    if (error) throw dbError(error, "Não foi possível estornar o lançamento");
  }

  async categorizeTransaction(providerRef: string, data: { categoryId: string; partnerId: string | null; counterparty: string }) {
    const { error } = await this.db
      .from("bank_transactions")
      .update({ category_id: data.categoryId, partner_id: data.partnerId, counterparty: data.counterparty.slice(0, 140) })
      .eq("provider_ref", providerRef);
    if (error) console.warn("[bank] nicho do Pix não gravado:", error.code, error.message);
  }

  async saveCharge(userId: string, charge: MirrorCharge) {
    const { error } = await this.db.from("bank_pix_charges").insert({
      user_id: userId,
      amount: money(charge.amount),
      description: charge.description.slice(0, 140),
      payload: charge.payload,
      provider_ref: charge.providerRef,
    });
    if (error) throw dbError(error, "Não foi possível guardar a cobrança");
  }

  async markChargePaid(providerRef: string, paidAt: string) {
    const { data, error } = await this.db.from("bank_pix_charges").update({ paid_at: paidAt }).eq("provider_ref", providerRef).select("user_id");
    if (error) throw dbError(error, "Não foi possível marcar a cobrança como paga");
    const rows = data as Array<{ user_id: string }>;
    return rows[0]?.user_id ?? null;
  }
}

/** Espelho em memória para os testes. */
export class MemoryBankMirror implements BankMirror {
  accounts = new Map<string, { status: AccountStatus; balance: number; agency: string | null; accountNumber: string | null; providerAccountId: string | null; activatedAt: string | null }>();
  transactions: Array<MirrorTransaction & { userId: string; id: string }> = [];
  charges: Array<MirrorCharge & { userId: string; paidAt: string | null }> = [];

  private account(userId: string) {
    let found = this.accounts.get(userId);
    if (!found) {
      found = { status: "pending_activation", balance: 0, agency: null, accountNumber: null, providerAccountId: null, activatedAt: null };
      this.accounts.set(userId, found);
    }
    return found;
  }

  async linkAccount(userId: string, data: { providerAccountId: string; agency: string | null; accountNumber: string | null }) {
    Object.assign(this.account(userId), data);
  }

  async resetAccount(userId: string) {
    Object.assign(this.account(userId), { status: "pending_activation", balance: 0, agency: null, accountNumber: null, providerAccountId: null, activatedAt: null });
  }

  async setAccountStatus(userId: string, status: AccountStatus, activatedAt?: string) {
    const account = this.account(userId);
    account.status = status;
    if (status === "pending_activation") account.balance = 0;
    if (activatedAt) account.activatedAt = activatedAt;
  }

  async cacheBalance(userId: string, balance: number) {
    const account = this.account(userId);
    if (account.status === "active") account.balance = money(balance);
  }

  async upsertTransaction(userId: string, tx: MirrorTransaction) {
    if (this.transactions.some((t) => t.providerRef === tx.providerRef)) return;
    this.transactions.unshift({ ...tx, amount: money(tx.amount), userId, id: crypto.randomUUID() });
  }

  async reverseTransaction(providerRef: string) {
    for (const t of this.transactions) if (t.providerRef === providerRef) t.status = "reversed";
  }

  categories = new Map<string, { categoryId: string; partnerId: string | null }>();

  async categorizeTransaction(providerRef: string, data: { categoryId: string; partnerId: string | null; counterparty: string }) {
    this.categories.set(providerRef, { categoryId: data.categoryId, partnerId: data.partnerId });
    for (const t of this.transactions) if (t.providerRef === providerRef) t.counterparty = data.counterparty;
  }

  async saveCharge(userId: string, charge: MirrorCharge) {
    this.charges.unshift({ ...charge, userId, paidAt: null });
  }

  async markChargePaid(providerRef: string, paidAt: string) {
    const charge = this.charges.find((c) => c.providerRef === providerRef);
    if (!charge) return null;
    charge.paidAt ??= paidAt;
    return charge.userId;
  }
}

export function getBankMirror(): BankMirror {
  return supabaseAdmin ? new SupabaseBankMirror(supabaseAdmin) : new MemoryBankMirror();
}
