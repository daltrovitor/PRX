// Hello World
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/client";
import { PartnerError, dbError } from "@/lib/partners/errors";
import { isUuid } from "@/lib/partners/catalog";
import {
  ACCOUNT_STATUSES,
  CARD_REQUEST_STATUSES,
  type AccountStatus,
  type BankTransaction,
  type CardRequest,
  type CardRequestStatus,
  type PixCharge,
  type PixKey,
  type PixKeyStatus,
  type TransactionKind,
  type VirtualCard,
} from "@/lib/prx/bank";
import type { PixKeyType } from "@/lib/prx/pix";

/**
 * Persistência do PRX BANK. Tabelas bank_* no Supabase (migração
 * 20260926_prx_live_staff_bank.sql); em desenvolvimento, memória.
 * A conta nasce zerada e em ativação: nada aqui fabrica saldo ou extrato.
 */

export interface BankAccountRecord {
  userId: string;
  status: AccountStatus;
  balance: number;
  agency: string | null;
  accountNumber: string | null;
  activatedAt: string | null;
  virtualCard: VirtualCard | null;
  /** Conta do banco parceiro a que o espelho está ligado (null = nunca ligado). */
  providerAccountId?: string | null;
  createdAt: string;
}

/** Asaas em produção: dinheiro real, então nenhum atalho do sandbox vale. */
export function isAsaasProduction(): boolean {
  return (process.env.ASAAS_ENVIRONMENT ?? "").trim().toLowerCase() === "production";
}

/**
 * Sandbox: conta ativa na hora, KYC dispensado e saldo ajustável pelo admin.
 * Nunca liga com ASAAS_ENVIRONMENT=production, mesmo com PRX_BAAS_MODE=sandbox esquecido.
 */
export function isSandboxMode(): boolean {
  if (isAsaasProduction()) return false;
  const provider = (process.env.BANK_PROVIDER ?? "").trim().toLowerCase();
  const env = (process.env.ASAAS_ENVIRONMENT ?? "").trim().toLowerCase();
  const baasMode = (process.env.PRX_BAAS_MODE ?? "").trim().toLowerCase();
  return provider === "sandbox" || env === "sandbox" || baasMode === "sandbox";
}

export interface BankRepository {
  getOrCreateAccount(userId: string): Promise<BankAccountRecord>;
  listTransactions(userId: string, limit: number): Promise<BankTransaction[]>;
  listPixKeys(userId: string): Promise<PixKey[]>;
  insertPixKey(userId: string, key: { type: PixKeyType; value: string; status: PixKeyStatus }): Promise<PixKey>;
  deletePixKey(userId: string, keyId: string): Promise<boolean>;
  getOpenCardRequest(userId: string): Promise<CardRequest | null>;
  insertCardRequest(userId: string, address: string): Promise<CardRequest>;
  cancelCardRequest(userId: string, requestId: string): Promise<boolean>;
  listCharges(userId: string, limit: number): Promise<PixCharge[]>;
  insertCharge(userId: string, charge: { amount: number | null; description: string; payload: string }): Promise<PixCharge>;
  toggleCardLock(userId: string): Promise<VirtualCard>;
}

const oneOf = <T extends string>(list: readonly T[], value: unknown, fallback: T): T => (list.includes(value as T) ? (value as T) : fallback);
const money = (value: unknown) => Math.round(Number(value ?? 0) * 100) / 100;

interface AccountRow {
  user_id: string;
  status: string;
  balance: number | string;
  agency: string | null;
  account_number: string | null;
  activated_at: string | null;
  card_last4: string | null;
  card_expiry: string | null;
  card_locked: boolean | null;
  provider_account_id?: string | null;
  created_at: string;
}

function mapAccount(r: AccountRow): BankAccountRecord {
  return {
    userId: r.user_id,
    status: oneOf(ACCOUNT_STATUSES, r.status, "pending_activation"),
    balance: money(r.balance),
    agency: r.agency,
    accountNumber: r.account_number,
    activatedAt: r.activated_at,
    virtualCard: r.card_last4 && r.card_expiry ? { last4: r.card_last4, expiry: r.card_expiry, locked: Boolean(r.card_locked) } : null,
    providerAccountId: r.provider_account_id ?? null,
    createdAt: r.created_at,
  };
}

interface TransactionRow {
  id: string;
  kind: string;
  direction: string;
  amount: number | string;
  counterparty: string | null;
  description: string | null;
  created_at: string;
  category_id?: string | null;
  partner_id?: string | null;
}

const TX_KINDS: readonly TransactionKind[] = ["pix_in", "pix_out", "card", "cashback", "ticket", "bill"];

function mapTransaction(r: TransactionRow): BankTransaction {
  return {
    id: r.id,
    kind: oneOf(TX_KINDS, r.kind, "card"),
    direction: r.direction === "in" ? "in" : "out",
    amount: money(r.amount),
    counterparty: r.counterparty ?? "",
    description: r.description ?? "",
    createdAt: r.created_at,
    categoryId: r.category_id ?? null,
    partnerId: r.partner_id ?? null,
  };
}

interface PixKeyRow {
  id: string;
  type: string;
  value: string;
  status: string;
  created_at: string;
}

const KEY_TYPES: readonly PixKeyType[] = ["cpf", "cnpj", "email", "phone", "random"];

function mapPixKey(r: PixKeyRow): PixKey {
  return {
    id: r.id,
    type: oneOf(KEY_TYPES, r.type, "random"),
    value: r.value,
    status: r.status === "active" ? "active" : "pending_activation",
    createdAt: r.created_at,
  };
}

interface CardRequestRow {
  id: string;
  address: string;
  status: string;
  tracking_code: string | null;
  created_at: string;
}

function mapCardRequest(r: CardRequestRow): CardRequest {
  return {
    id: r.id,
    address: r.address,
    status: oneOf<CardRequestStatus>(CARD_REQUEST_STATUSES, r.status, "waiting_activation"),
    trackingCode: r.tracking_code,
    createdAt: r.created_at,
  };
}

interface ChargeRow {
  id: string;
  amount: number | string | null;
  description: string | null;
  payload: string;
  paid_at: string | null;
  created_at: string;
}

function mapCharge(r: ChargeRow): PixCharge {
  return { id: r.id, amount: r.amount === null ? null : money(r.amount), description: r.description ?? "", payload: r.payload, paid: Boolean(r.paid_at), createdAt: r.created_at };
}

type SupabaseClient = NonNullable<typeof supabaseAdmin>;

class SupabaseBankRepository implements BankRepository {
  constructor(private readonly db: SupabaseClient) {}

  async getOrCreateAccount(userId: string) {
    const isSandbox = isSandboxMode();
    const found = await this.db.from("bank_accounts").select("*").eq("user_id", userId).maybeSingle();
    if (found.error) throw dbError(found.error, "Não foi possível consultar a conta");
    if (found.data) {
      const acc = mapAccount(found.data as AccountRow);
      if (isSandbox && acc.status === "pending_activation") {
        const agency = acc.agency || "0001";
        const accountNumber = acc.accountNumber || `1000${userId.replace(/\D/g, "").slice(-4) || "0101"}`;
        const cardLast4 = acc.virtualCard?.last4 || "4242";
        const cardExpiry = acc.virtualCard?.expiry || "12/30";
        const activatedAt = acc.activatedAt || new Date().toISOString();
        await this.db
          .from("bank_accounts")
          .update({
            status: "active",
            agency,
            account_number: accountNumber,
            card_last4: cardLast4,
            card_expiry: cardExpiry,
            activated_at: activatedAt,
          })
          .eq("user_id", userId);
        acc.status = "active";
        acc.agency = agency;
        acc.accountNumber = accountNumber;
        acc.virtualCard = { last4: cardLast4, expiry: cardExpiry, locked: Boolean(acc.virtualCard?.locked) };
        acc.activatedAt = activatedAt;
      }
      return acc;
    }
    // Conta nova: no modo sandbox/teste já nasce ativa com agência e cartão virtual
    const initialStatus = isSandbox ? "active" : "pending_activation";
    const initialAgency = isSandbox ? "0001" : null;
    const initialAccountNum = isSandbox ? `1000${userId.replace(/\D/g, "").slice(-4) || "0101"}` : null;
    const initialCardLast4 = isSandbox ? "4242" : null;
    const initialCardExpiry = isSandbox ? "12/30" : null;
    const initialActivatedAt = isSandbox ? new Date().toISOString() : null;

    const created = await this.db
      .from("bank_accounts")
      .upsert(
        {
          user_id: userId,
          status: initialStatus,
          balance: 0,
          agency: initialAgency,
          account_number: initialAccountNum,
          card_last4: initialCardLast4,
          card_expiry: initialCardExpiry,
          activated_at: initialActivatedAt,
        },
        { onConflict: "user_id", ignoreDuplicates: true }
      )
      .select("*")
      .maybeSingle();
    if (created.error) throw dbError(created.error, "Não foi possível abrir a conta");
    if (created.data) return mapAccount(created.data as AccountRow);
    const again = await this.db.from("bank_accounts").select("*").eq("user_id", userId).single();
    if (again.error) throw dbError(again.error, "Não foi possível consultar a conta");
    return mapAccount(again.data as AccountRow);
  }

  async listTransactions(userId: string, limit: number) {
    // Estornados (Pix devolvido, boleto recusado) não entram no extrato nem nos limites.
    let query = this.db.from("bank_transactions").select("*").eq("user_id", userId).neq("status", "reversed");
    // Com dinheiro real, só vale o que veio do Asaas: lançamentos do sandbox ficam de fora.
    if (isAsaasProduction()) query = query.not("provider_ref", "is", null);
    const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);
    if (error) throw dbError(error, "Não foi possível carregar o extrato");
    return (data as TransactionRow[]).map(mapTransaction);
  }

  async listPixKeys(userId: string) {
    const { data, error } = await this.db.from("bank_pix_keys").select("*").eq("user_id", userId).order("created_at", { ascending: true });
    if (error) throw dbError(error, "Não foi possível carregar as chaves Pix");
    return (data as PixKeyRow[]).map(mapPixKey);
  }

  async insertPixKey(userId: string, key: { type: PixKeyType; value: string; status: PixKeyStatus }) {
    const { data, error } = await this.db.from("bank_pix_keys").insert({ user_id: userId, ...key }).select("*").single();
    if (error) {
      if (error.code === "23505") throw new PartnerError("Esta chave já está cadastrada.", 409);
      throw dbError(error, "Não foi possível cadastrar a chave");
    }
    return mapPixKey(data as PixKeyRow);
  }

  async deletePixKey(userId: string, keyId: string) {
    if (!isUuid(keyId)) return false;
    const { data, error } = await this.db.from("bank_pix_keys").delete().eq("id", keyId).eq("user_id", userId).eq("status", "pending_activation").select("id");
    if (error) throw dbError(error, "Não foi possível excluir a chave");
    return (data as unknown[]).length > 0;
  }

  async getOpenCardRequest(userId: string) {
    const { data, error } = await this.db
      .from("bank_card_requests")
      .select("*")
      .eq("user_id", userId)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw dbError(error, "Não foi possível consultar o pedido do cartão");
    return data ? mapCardRequest(data as CardRequestRow) : null;
  }

  async insertCardRequest(userId: string, address: string) {
    const { data, error } = await this.db.from("bank_card_requests").insert({ user_id: userId, address, status: "waiting_activation" }).select("*").single();
    if (error) {
      if (error.code === "23505") throw new PartnerError("Você já pediu o cartão físico.", 409);
      throw dbError(error, "Não foi possível registrar o pedido");
    }
    return mapCardRequest(data as CardRequestRow);
  }

  async cancelCardRequest(userId: string, requestId: string) {
    if (!isUuid(requestId)) return false;
    const { data, error } = await this.db
      .from("bank_card_requests")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", requestId)
      .eq("user_id", userId)
      .eq("status", "waiting_activation")
      .select("id");
    if (error) throw dbError(error, "Não foi possível cancelar o pedido");
    return (data as unknown[]).length > 0;
  }

  async listCharges(userId: string, limit: number) {
    let query = this.db.from("bank_pix_charges").select("*").eq("user_id", userId);
    if (isAsaasProduction()) query = query.not("provider_ref", "is", null);
    const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);
    if (error) throw dbError(error, "Não foi possível carregar as cobranças");
    return (data as ChargeRow[]).map(mapCharge);
  }

  async insertCharge(userId: string, charge: { amount: number | null; description: string; payload: string }) {
    const { data, error } = await this.db
      .from("bank_pix_charges")
      .insert({
        user_id: userId,
        amount: charge.amount,
        description: charge.description,
        payload: charge.payload,
      })
      .select("*")
      .single();
    if (error) throw dbError(error, "Não foi possível gerar a cobrança");
    return mapCharge(data as ChargeRow);
  }

  async toggleCardLock(userId: string): Promise<VirtualCard> {
    const acc = await this.getOrCreateAccount(userId);
    const locked = !(acc.virtualCard?.locked ?? false);
    const { error } = await this.db.from("bank_accounts").update({ card_locked: locked }).eq("user_id", userId);
    if (error) throw dbError(error, "Não foi possível alterar o bloqueio do cartão");
    return { last4: acc.virtualCard?.last4 || "4242", expiry: acc.virtualCard?.expiry || "12/30", locked };
  }
}

/* -------------------------------------------------------------------------- */
/* Memória (desenvolvimento e contas de demonstração)                          */
/* -------------------------------------------------------------------------- */

interface MemoryBank {
  account: BankAccountRecord;
  transactions: BankTransaction[];
  pixKeys: PixKey[];
  cardRequests: CardRequest[];
  charges: PixCharge[];
}

const globalState = globalThis as unknown as { __prxBank?: Map<string, MemoryBank> };
const memory = (): Map<string, MemoryBank> => (globalState.__prxBank ??= new Map<string, MemoryBank>());
const newId = () => crypto.randomUUID();

function memoryBank(userId: string): MemoryBank {
  const store = memory();
  let bank = store.get(userId);
  if (!bank) {
    const isSandbox = isSandboxMode();
    const expiry = "12/30";
    bank = {
      account: {
        userId,
        status: isSandbox ? "active" : "pending_activation",
        balance: 0,
        agency: isSandbox ? "0001" : null,
        accountNumber: isSandbox ? `${digits(7)}-${digits(1)}` : null,
        activatedAt: isSandbox ? new Date().toISOString() : null,
        virtualCard: isSandbox ? { last4: digits(4), expiry, locked: false } : null,
        createdAt: new Date().toISOString(),
      },
      transactions: [],
      pixKeys: [],
      cardRequests: [],
      charges: [],
    };
    store.set(userId, bank);
  } else if (isSandboxMode() && bank.account.status === "pending_activation") {
    bank.account.status = "active";
    bank.account.agency ||= "0001";
    bank.account.accountNumber ||= `${digits(7)}-${digits(1)}`;
    bank.account.virtualCard ||= { last4: digits(4), expiry: "12/30", locked: false };
    bank.account.activatedAt ||= new Date().toISOString();
  }
  return bank;
}

class MemoryBankRepository implements BankRepository {
  async getOrCreateAccount(userId: string) {
    return structuredClone(memoryBank(userId).account);
  }

  async listTransactions(userId: string, limit: number) {
    return structuredClone(memoryBank(userId).transactions.slice(0, limit));
  }

  async listPixKeys(userId: string) {
    return structuredClone(memoryBank(userId).pixKeys);
  }

  async insertPixKey(userId: string, key: { type: PixKeyType; value: string; status: PixKeyStatus }) {
    const taken = [...memory().values()].some((b) => b.pixKeys.some((k) => k.value === key.value));
    if (taken) throw new PartnerError("Esta chave já está cadastrada.", 409);
    const created: PixKey = { id: newId(), ...key, createdAt: new Date().toISOString() };
    memoryBank(userId).pixKeys.push(created);
    return structuredClone(created);
  }

  async deletePixKey(userId: string, keyId: string) {
    const bank = memoryBank(userId);
    const before = bank.pixKeys.length;
    bank.pixKeys = bank.pixKeys.filter((k) => !(k.id === keyId && k.status === "pending_activation"));
    return bank.pixKeys.length < before;
  }

  async getOpenCardRequest(userId: string) {
    const open = memoryBank(userId).cardRequests.find((r) => r.status !== "cancelled");
    return open ? structuredClone(open) : null;
  }

  async insertCardRequest(userId: string, address: string) {
    const bank = memoryBank(userId);
    if (bank.cardRequests.some((r) => r.status !== "cancelled")) throw new PartnerError("Você já pediu o cartão físico.", 409);
    const created: CardRequest = { id: newId(), address, status: "waiting_activation", trackingCode: null, createdAt: new Date().toISOString() };
    bank.cardRequests.unshift(created);
    return structuredClone(created);
  }

  async cancelCardRequest(userId: string, requestId: string) {
    const request = memoryBank(userId).cardRequests.find((r) => r.id === requestId && r.status === "waiting_activation");
    if (!request) return false;
    request.status = "cancelled";
    return true;
  }

  async listCharges(userId: string, limit: number) {
    return structuredClone(memoryBank(userId).charges.slice(0, limit));
  }

  async insertCharge(userId: string, charge: { amount: number | null; description: string; payload: string }) {
    const created: PixCharge = {
      id: newId(),
      amount: charge.amount,
      description: charge.description,
      payload: charge.payload,
      paid: false,
      createdAt: new Date().toISOString(),
    };
    memoryBank(userId).charges.unshift(created);
    return structuredClone(created);
  }

  async toggleCardLock(userId: string): Promise<VirtualCard> {
    const bank = memoryBank(userId);
    if (!bank.account.virtualCard) {
      bank.account.virtualCard = { last4: "4242", expiry: "12/30", locked: false };
    }
    bank.account.virtualCard.locked = !bank.account.virtualCard.locked;
    return structuredClone(bank.account.virtualCard);
  }
}

/* -------------------------------------------------------------------------- */
/* Sandbox do banco parceiro (só memória)                                      */
/* -------------------------------------------------------------------------- */

/** Crédito fictício da conta sandbox: deixa claro no extrato que não é dinheiro real. */
export const SANDBOX_CREDIT = 1000;

const digits = (length: number) => Array.from({ length }, () => crypto.randomInt(0, 10)).join("");

/**
 * Ativa a conta em memória como se o banco parceiro tivesse aprovado:
 * agência/conta de teste, cartão virtual e crédito sandbox. Idempotente.
 */
export function sandboxActivate(userId: string): void {
  const bank = memoryBank(userId);
  if (bank.account.status === "active") return;
  if (bank.account.status === "blocked") throw new PartnerError("Conta bloqueada. Fale com o suporte PRX.", 403);
  const now = new Date();
  const expiry = `${String(now.getMonth() + 1).padStart(2, "0")}/${String((now.getFullYear() + 5) % 100).padStart(2, "0")}`;
  bank.account = {
    ...bank.account,
    status: "active",
    balance: SANDBOX_CREDIT,
    agency: "0001",
    accountNumber: `${digits(7)}-${digits(1)}`,
    activatedAt: now.toISOString(),
    virtualCard: { last4: digits(4), expiry, locked: false },
  };
  bank.pixKeys = bank.pixKeys.map((k) => ({ ...k, status: "active" }));
  bank.cardRequests = bank.cardRequests.map((r) => (r.status === "waiting_activation" ? { ...r, status: "requested" } : r));
  bank.transactions.unshift({
    id: newId(),
    kind: "pix_in",
    direction: "in",
    amount: SANDBOX_CREDIT,
    counterparty: "PRX Sandbox",
    description: "Crédito de teste (sandbox, não é dinheiro real)",
    createdAt: now.toISOString(),
  });
}

/** Identificador fim a fim no formato do SPI: E + ISPB (8) + AAAAMMDDHHmm + 11 caracteres. */
function endToEndId(now: Date): string {
  const stamp = now.toISOString().replace(/\D/g, "").slice(0, 12);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const tail = Array.from({ length: 11 }, () => alphabet[crypto.randomInt(0, alphabet.length)]).join("");
  return `E00000000${stamp}${tail}`;
}

/** Pix enviado e liquidado na hora pelo sandbox. Devolve o E2E e o lançamento no extrato. */
export function sandboxSendPix(userId: string, input: { key: string; amount: number; recipient: string; description: string }): { endToEndId: string; transaction: BankTransaction } {
  const bank = memoryBank(userId);
  if (bank.account.status !== "active") throw new PartnerError("Ative a conta sandbox para enviar Pix.", 409);
  const amount = Math.round(input.amount * 100) / 100;
  if (!(amount > 0)) throw new PartnerError("Informe o valor do Pix.", 422);
  if (amount > bank.account.balance) throw new PartnerError("Saldo insuficiente para esta transferência.", 409);
  const now = new Date();
  const transaction: BankTransaction = {
    id: newId(),
    kind: "pix_out",
    direction: "out",
    amount,
    counterparty: input.recipient.slice(0, 80) || input.key,
    description: input.description.slice(0, 60) || "Pix enviado",
    createdAt: now.toISOString(),
  };
  bank.account.balance = Math.round((bank.account.balance - amount) * 100) / 100;
  bank.transactions.unshift(transaction);
  return { endToEndId: endToEndId(now), transaction: structuredClone(transaction) };
}

/**
 * Crédito recebido na hora pelo sandbox (Pix e mesada do responsável). A conta
 * precisa estar ativa: sem banco parceiro não existe onde o dinheiro cair.
 */
export function sandboxCredit(userId: string, input: { amount: number; counterparty: string; description: string }): BankTransaction {
  const bank = memoryBank(userId);
  if (bank.account.status !== "active") throw new PartnerError("A conta PRX BANK do seu filho ainda não foi ativada. Assim que ativar, o envio fica disponível.", 409);
  const amount = Math.round(input.amount * 100) / 100;
  if (!(amount > 0)) throw new PartnerError("Informe o valor.", 422);
  const transaction: BankTransaction = {
    id: newId(),
    kind: "pix_in",
    direction: "in",
    amount,
    counterparty: input.counterparty.slice(0, 80),
    description: input.description.slice(0, 60),
    createdAt: new Date().toISOString(),
  };
  bank.account.balance = Math.round((bank.account.balance + amount) * 100) / 100;
  bank.transactions.unshift(transaction);
  return structuredClone(transaction);
}

/** Marca o nicho e o parceiro de um lançamento (PRX Map). */
export function sandboxCategorize(userId: string, transactionId: string, categoryId: string, partnerId: string | null, counterparty?: string): void {
  const tx = memoryBank(userId).transactions.find((t) => t.id === transactionId);
  if (!tx) return;
  tx.categoryId = categoryId;
  tx.partnerId = partnerId;
  if (counterparty) tx.counterparty = counterparty;
}

/** Supabase para contas reais (uuid); memória para as contas de demonstração locais. */
export function getBankRepository(userId: string): BankRepository {
  return usesSupabaseBank(userId) ? new SupabaseBankRepository(supabaseAdmin as SupabaseClient) : new MemoryBankRepository();
}

export function usesSupabaseBank(userId: string): boolean {
  return Boolean(supabaseAdmin && isUuid(userId));
}

/** Envio de Pix no modo sandbox / testes (Supabase ou memória). */
export async function repoSendPix(
  userId: string,
  input: { key: string; amount: number; recipient: string; description: string }
): Promise<{ endToEndId: string; transaction: BankTransaction }> {
  const amount = Math.round(input.amount * 100) / 100;
  if (!(amount > 0)) throw new PartnerError("Informe o valor do Pix.", 422);

  if (usesSupabaseBank(userId) && supabaseAdmin) {
    const acc = await supabaseAdmin.from("bank_accounts").select("balance, status").eq("user_id", userId).maybeSingle();
    const currentBalance = Number(acc.data?.balance || 0);
    if (amount > currentBalance) throw new PartnerError("Saldo insuficiente para esta transferência.", 409);
    const newBalance = Math.round((currentBalance - amount) * 100) / 100;

    await supabaseAdmin.from("bank_accounts").update({ balance: newBalance }).eq("user_id", userId);
    const now = new Date();
    const e2e = endToEndId(now);
    const { data, error } = await supabaseAdmin
      .from("bank_transactions")
      .insert({
        user_id: userId,
        kind: "pix_out",
        direction: "out",
        amount,
        counterparty: input.recipient.slice(0, 80) || input.key,
        description: input.description.slice(0, 60) || "Pix enviado",
        status: "settled",
      })
      .select("*")
      .single();
    if (error) throw dbError(error, "Não foi possível registrar a transação");
    return { endToEndId: e2e, transaction: mapTransaction(data as TransactionRow) };
  }

  return sandboxSendPix(userId, input);
}
