// Hello World
import crypto from "crypto";
import { z } from "zod";
import { PartnerError } from "@/lib/partners/errors";
import { errorMessage } from "@/lib/errors";
import { getBankRepository, isSandboxMode, repoSendPix, sandboxActivate, sandboxCategorize, sandboxSendPix, usesSupabaseBank } from "@/lib/bank/repository";
import { ACTIVATION_REQUIRED, MAX_PIX_KEYS, type BankAccountView, type CardRequest, type PixCharge, type PixKey, type VirtualCard } from "@/lib/prx/bank";
import { detectPixKeyType, isValidCpf } from "@/lib/prx/pix";
import { DEMO_ACCOUNTS_ENABLED } from "@/lib/server-secrets";
import { processPartnerPixTransfer, type PartnerPixResult } from "@/lib/points/service";
import { assertCanHoldMoney, assertMinorSpend } from "@/lib/family/guards";
import { assertBankKycApproved, bankKycState } from "@/lib/kyc/guards";
import { asaasActiveFor, asaasDeps } from "@/lib/bank/asaas/deps";
import { providerSnapshot } from "@/lib/bank/asaas/view";
import { createProviderCharge, createProviderPixKey } from "@/lib/bank/asaas/cash-in";
import { assertNightLimit } from "@/lib/bank/asaas/limits";

/**
 * Regras do PRX BANK antes da ativação do banco parceiro: a conta existe,
 * zerada; chaves Pix e o cartão físico ficam pré-cadastrados para seguir ao
 * banco na ativação. Operações que movem dinheiro respondem 409.
 */

/** Conta marcada como ativa sem a integração do BaaS publicada nesta versão. */
const BAAS_PENDING = "A integração com o banco parceiro ainda não foi publicada nesta versão do app.";

/**
 * Sandbox do banco parceiro: simula aprovação da conta, saldo fictício e Pix
 * liquidado na hora, para exercitar o motor de compras em parceiros antes do
 * BaaS.
 */
export function sandboxEnabled(userId?: string): boolean {
  if (isSandboxMode()) return true;
  if (userId && usesSupabaseBank(userId)) return false;
  return DEMO_ACCOUNTS_ENABLED;
}

export async function accountView(userId: string): Promise<BankAccountView> {
  const repo = getBankRepository(userId);
  let account = await repo.getOrCreateAccount(userId);
  const isAsaas = asaasActiveFor(userId);

  if (isAsaas) {
    try {
      // Pedidos que ficaram "em análise" antes da aprovação automática seguem agora.
      const { autoApproveBankKyc } = await import("@/lib/kyc/service");
      const app = await autoApproveBankKyc(userId);
      const deps = asaasDeps();
      if (app?.status === "approved") {
        const { ensureAsaasCustomerAndAccount } = await import("@/lib/bank/asaas/onboarding");
        await ensureAsaasCustomerAndAccount(userId, deps);
      }
      const { reconcileLegacyAccount } = await import("@/lib/bank/asaas/legacy");
      if (await reconcileLegacyAccount(userId, account, deps)) account = await repo.getOrCreateAccount(userId);
    } catch (err) {
      console.warn("[bank] Aviso ao sincronizar Asaas no accountView:", errorMessage(err));
    }
  }
  const kyc = await bankKycState(userId);

  const isSandbox = !isAsaas && sandboxEnabled(userId);
  const [transactions, localKeys, cardRequest, charges, live] = await Promise.all([
    repo.listTransactions(userId, 200),
    repo.listPixKeys(userId),
    repo.getOpenCardRequest(userId),
    repo.listCharges(userId, 20),
    isAsaas ? providerSnapshot(userId) : Promise.resolve(null),
  ]);

  // Chave guardada antes da conta real (sandbox) só vale depois de registrada no Asaas.
  const pixKeys = live?.pixKeys ?? (isAsaas ? localKeys.map((k) => ({ ...k, status: "pending_activation" as const })) : localKeys);
  const provider = isAsaas ? (live?.provider ?? null) : null;
  const status = isSandbox && account.status === "pending_activation" ? "active" : (live?.provider?.state === "active" ? "active" : account.status);
  const virtualCard = account.virtualCard ?? (isSandbox ? { last4: "4242", expiry: "12/30", locked: false } : null);
  const kycState = isSandbox && kyc.status !== "approved" ? { ...kyc, status: "approved" as const } : kyc;

  return {
    status,
    balance: live?.balance ?? account.balance,
    agency: account.agency || (isSandbox ? "0001" : null),
    accountNumber: account.accountNumber || (isSandbox ? `1000${userId.replace(/\D/g, "").slice(-4) || "0101"}` : null),
    activatedAt: account.activatedAt || (isSandbox ? new Date().toISOString() : null),
    transactions,
    pixKeys,
    virtualCard,
    cardRequest,
    charges,
    sandbox: isSandbox,
    kyc: kycState,
    provider,
  };
}

export async function activateSandbox(userId: string): Promise<void> {
  if (!sandboxEnabled(userId)) throw new PartnerError("A conta sandbox só existe no ambiente de testes.", 403);
  await assertCanHoldMoney(userId);
  await assertBankKycApproved(userId);
  sandboxActivate(userId);
}

export const sendPixSchema = z.object({
  key: z.string().trim().min(1, "Informe a chave Pix.").max(140),
  amount: z.coerce.number().positive("Informe o valor do Pix.").max(50_000, "Limite de R$ 50.000 por Pix."),
  description: z.string().trim().max(60).default(""),
  recipientName: z.string().trim().max(80).nullish(),
});

/**
 * Pix pela conta PRX. No sandbox o Pix liquida na hora e passa pelo motor de
 * compras em parceiros (coins, XP e nicho no PRX Map). Fora dele, a operação
 * depende do banco parceiro.
 */
export async function sendPix(userId: string, input: z.output<typeof sendPixSchema>): Promise<{ partner: PartnerPixResult | null }> {
  // Defesa em profundidade: movimentação só com abertura aprovada e conta ativa.
  await assertBankKycApproved(userId);
  await assertAccountActive(userId);
  // Com o banco parceiro, o Pix sai por /api/bank/outgoing (revisão + biometria ou senha).
  if (asaasActiveFor(userId)) throw new PartnerError("Atualize o app para enviar Pix com confirmação por biometria.", 409);
  if (!sandboxEnabled(userId)) return assertBankOperational(userId);
  const keyType = detectPixKeyType(input.key);
  if (!keyType) throw new PartnerError("Chave Pix inválida.", 422);
  // Menor de idade: conta liberada pelo responsável e dentro dos limites que ele definiu.
  const recent = await getBankRepository(userId).listTransactions(userId, 500);
  await assertMinorSpend(userId, input.amount, recent);
  // Limite noturno do Banco Central, também no sandbox: soma os Pix enviados no período.
  await assertNightLimit(input.amount, new Date(), async (since) => recent.filter((t) => t.kind === "pix_out" && t.createdAt >= since).reduce((sum, t) => sum + t.amount, 0));

  const recipient = input.recipientName?.trim() || input.key;
  const settled = await repoSendPix(userId, { key: input.key, amount: input.amount, recipient, description: input.description });
  const partner = await processPartnerPixTransfer(userId, {
    endToEndId: settled.endToEndId,
    key: input.key,
    recipientName: input.recipientName,
    amount: settled.transaction.amount,
    source: "sandbox",
  });
  if (partner) sandboxCategorize(userId, settled.transaction.id, partner.purchase.categoryId, partner.purchase.partnerId, partner.purchase.partnerName);
  return { partner };
}

export const pixKeyInputSchema = z
  .object({
    type: z.enum(["cpf", "email", "phone", "random"]),
    value: z.string().trim().max(120).default(""),
  })
  .transform((input, ctx) => {
    const digits = input.value.replace(/\D/g, "");
    switch (input.type) {
      case "random":
        return { type: input.type, value: crypto.randomUUID() };
      case "cpf":
        if (!isValidCpf(digits)) {
          ctx.addIssue({ code: "custom", message: "CPF inválido." });
          return z.NEVER;
        }
        return { type: input.type, value: digits };
      case "email": {
        const email = input.value.toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 77) {
          ctx.addIssue({ code: "custom", message: "E-mail inválido." });
          return z.NEVER;
        }
        return { type: input.type, value: email };
      }
      case "phone": {
        const local = digits.replace(/^55(?=\d{10,11}$)/, "");
        if (local.length < 10 || local.length > 11) {
          ctx.addIssue({ code: "custom", message: "Celular inválido. Use DDD + número." });
          return z.NEVER;
        }
        return { type: input.type, value: `+55${local}` };
      }
    }
  });

export async function addPixKey(userId: string, input: z.output<typeof pixKeyInputSchema>): Promise<PixKey> {
  await assertCanHoldMoney(userId);
  await assertBankKycApproved(userId);
  const repo = getBankRepository(userId);
  const account = await repo.getOrCreateAccount(userId);
  if (account.status === "blocked") throw new PartnerError("Conta bloqueada. Fale com o suporte PRX.", 403);
  // Conta aprovada no banco parceiro: a chave é registrada no DICT pelo Asaas.
  if (account.status === "active" && asaasActiveFor(userId)) return createProviderPixKey(userId, input.type, asaasDeps());
  const keys = await repo.listPixKeys(userId);
  if (keys.length >= MAX_PIX_KEYS) throw new PartnerError(`Limite de ${MAX_PIX_KEYS} chaves Pix por conta.`, 409);
  if (keys.some((k) => k.value === input.value)) throw new PartnerError("Esta chave já está cadastrada.", 409);
  // No sandbox ou conta ativa, a chave já fica ativa
  const status = sandboxEnabled(userId) || account.status === "active" ? "active" : "pending_activation";
  return repo.insertPixKey(userId, { ...input, status });
}

export const chargeSchema = z.object({
  amount: z.number().positive("Informe o valor da cobrança.").max(50_000, "Limite de R$ 50.000 por cobrança.").nullish(),
  description: z.string().trim().max(40).default(""),
});

/** Cobrança Pix com QR Code dinâmico, gerada pelo banco parceiro ou simulada no sandbox. */
export async function createCharge(userId: string, input: z.output<typeof chargeSchema>): Promise<PixCharge> {
  await assertBankKycApproved(userId);
  await assertAccountActive(userId);
  if (asaasActiveFor(userId)) return createProviderCharge(userId, { amount: input.amount ?? null, description: input.description }, asaasDeps());
  if (!sandboxEnabled(userId)) return assertBankOperational(userId);
  const repo = getBankRepository(userId);
  const amt = input.amount ? input.amount.toFixed(2) : "";
  const payload = `00020126580014br.gov.bcb.pix0136${crypto.randomUUID()}520400005303986${amt ? `54${String(amt.length).padStart(2, "0")}${amt}` : ""}5802BR5913PRX ECOSYSTEM6009SAO PAULO62070503***6304ABCD`;
  return repo.insertCharge(userId, { amount: input.amount ?? null, description: input.description, payload });
}

export async function toggleCardLock(userId: string): Promise<VirtualCard> {
  return getBankRepository(userId).toggleCardLock(userId);
}

export async function removePixKey(userId: string, keyId: string): Promise<void> {
  const removed = await getBankRepository(userId).deletePixKey(userId, keyId);
  if (!removed) throw new PartnerError("Chave não encontrada.", 404);
}

export const cardAddressSchema = z.object({
  cep: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length === 8, "CEP precisa de 8 dígitos."),
  street: z.string().trim().min(3, "Informe o endereço.").max(120),
  number: z.string().trim().min(1, "Informe o número.").max(20),
  complement: z.string().trim().max(60).default(""),
  city: z.string().trim().min(2, "Informe a cidade e UF.").max(80),
});

export async function requestPhysicalCard(userId: string, address: z.output<typeof cardAddressSchema>): Promise<CardRequest> {
  await assertBankKycApproved(userId);
  const repo = getBankRepository(userId);
  const account = await repo.getOrCreateAccount(userId);
  if (account.status === "blocked") throw new PartnerError("Conta bloqueada. Fale com o suporte PRX.", 403);
  if (await repo.getOpenCardRequest(userId)) throw new PartnerError("Você já pediu o cartão físico.", 409);
  const full = `${address.street}, ${address.number}${address.complement ? ` — ${address.complement}` : ""} · ${address.city} · CEP ${address.cep.replace(/(\d{5})(\d{3})/, "$1-$2")}`;
  return repo.insertCardRequest(userId, full);
}

export async function cancelPhysicalCard(userId: string, requestId: string): Promise<void> {
  const cancelled = await getBankRepository(userId).cancelCardRequest(userId, requestId);
  if (!cancelled) throw new PartnerError("Só pedidos que ainda aguardam a ativação podem ser cancelados.", 409);
}

/** Movimentação bancária só com a conta no status "active" (nunca em ativação ou bloqueada). */
export async function assertAccountActive(userId: string): Promise<void> {
  const account = await getBankRepository(userId).getOrCreateAccount(userId);
  if (account.status === "blocked") throw new PartnerError("Conta bloqueada. Fale com o suporte PRX.", 403);
  if (account.status !== "active" && !sandboxEnabled(userId)) throw new PartnerError(ACTIVATION_REQUIRED, 409);
}

/** Pix, cobrança e bloqueio de cartão dependem do banco parceiro. */
export async function assertBankOperational(userId: string): Promise<never> {
  const account = await getBankRepository(userId).getOrCreateAccount(userId);
  if (account.status === "blocked") throw new PartnerError("Conta bloqueada. Fale com o suporte PRX.", 403);
  if (account.status === "pending_activation") throw new PartnerError(ACTIVATION_REQUIRED, 409);
  throw new PartnerError(BAAS_PENDING, 503);
}
