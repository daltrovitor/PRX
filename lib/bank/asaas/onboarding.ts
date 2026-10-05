// Hello World
import { PartnerError } from "@/lib/partners/errors";
import { AsaasError, toPartnerError } from "@/lib/asaas/errors";
import { webhookAuthToken, webhookUrls } from "@/lib/asaas/config";
import { emailConfig } from "@/lib/notifications/config";
import { encryptSecret, decryptSecret } from "@/lib/asaas/secrets";
import { SUBACCOUNT_WEBHOOK_EVENTS, createSubaccount, getAccountStatus, type CreatedSubaccount, type NewSubaccount, type SubaccountWebhook } from "@/lib/asaas/accounts";
import { assertCanHoldMoney } from "@/lib/family/guards";
import type { IncomeRange } from "@/lib/family/types";
import { KYC_PENDING_MESSAGE, KYC_REQUIRED_MESSAGE, type BankKycApplication } from "@/lib/kyc/types";
import type { AsaasDeps } from "@/lib/bank/asaas/deps";
import { bankMessage } from "@/lib/bank/asaas/messages";
import { ACTIVATION_REQUIRED } from "@/lib/prx/bank";
import type { Subaccount, SubaccountKycStatus, SubaccountStatus } from "@/lib/bank/asaas/types";
import { createCustomer } from "@/lib/asaas/pix";
import { ageOn } from "@/lib/family/age";
import { getFamilyRepository } from "@/lib/family/repository";
import { ensureDefaultPixKey } from "@/lib/bank/asaas/cash-in";
import type { AsaasClient } from "@/lib/asaas/client";
import { asaasDeps } from "@/lib/bank/asaas/deps";

/**
 * Abertura da conta no Asaas (subconta white label) com os dados da abertura
 * enviada pelo membro. O PRX não analisa documentos: quem aprova é o Asaas
 * (ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED), e só então a conta movimenta
 * dinheiro. A apiKey devolvida uma única vez é cifrada antes de ir ao banco.
 */

/** Renda mensal declarada no KYC (faixa) convertida no valor que o Asaas pede. */
export const INCOME_VALUE: Record<IncomeRange, number> = {
  ate_3k: 1500,
  "3k_6k": 4500,
  "6k_10k": 8000,
  "10k_20k": 15000,
  acima_20k: 25000,
};

/** Trava de abertura esquecida (queda no meio da criação) pode ser retomada depois disto. */
const PROVISIONING_STALE_MS = 10 * 60_000;

export interface SubaccountView {
  state: "none" | "provisioning" | SubaccountStatus;
  kycStatus: SubaccountKycStatus | null;
  rejectReason: string | null;
}

export function subaccountView(sub: Subaccount | null): SubaccountView {
  if (!sub) return { state: "none", kycStatus: null, rejectReason: null };
  if (!sub.asaasAccountId) return { state: sub.provisioningStartedAt ? "provisioning" : "none", kycStatus: null, rejectReason: null };
  return { state: sub.status, kycStatus: sub.kycStatus, rejectReason: sub.rejectReason };
}

/** E-mail que recebe os alertas do Asaas sobre falhas na fila de webhooks. */
function opsEmail(): string | null {
  const raw = (process.env.ASAAS_WEBHOOK_EMAIL ?? "").trim() || emailConfig().replyTo;
  return raw.match(/<([^>\s]+@[^>\s]+)>/)?.[1] ?? (/^[^\s@]+@[^\s@]+$/.test(raw) ? raw : null);
}

export function subaccountWebhook(): SubaccountWebhook {
  const urls = webhookUrls();
  const token = webhookAuthToken();
  const email = opsEmail();
  if (!urls || !token || !email) {
    throw new PartnerError("Integração bancária incompleta neste ambiente (URL, token ou e-mail do webhook do Asaas).", 503);
  }
  return { name: "PRX BANK", url: urls.events, email, sendType: "SEQUENTIALLY", interrupted: false, enabled: true, apiVersion: 3, authToken: token, events: SUBACCOUNT_WEBHOOK_EVENTS };
}

export function subaccountInput(app: BankKycApplication, webhook: SubaccountWebhook): NewSubaccount {
  return {
    name: app.fullName,
    email: app.email,
    cpfCnpj: app.cpf,
    birthDate: app.birthDate,
    mobilePhone: app.phone,
    incomeValue: INCOME_VALUE[app.incomeRange],
    address: app.address.street,
    addressNumber: app.address.number,
    complement: app.address.complement || undefined,
    province: app.address.district,
    postalCode: app.address.cep,
    webhooks: [webhook],
  };
}

function formatAccount(number: CreatedSubaccount["accountNumber"]): { agency: string | null; accountNumber: string | null } {
  if (!number?.account) return { agency: number?.agency ?? null, accountNumber: null };
  return { agency: number.agency, accountNumber: number.accountDigit ? `${number.account}-${number.accountDigit}` : number.account };
}

/**
 * Subconta deste ambiente do Asaas. Uma aberta em outro ambiente (o sandbox,
 * antes da produção) não vale aqui: o membro abre outra, e ela é substituída.
 */
export async function currentSubaccount(userId: string, deps: AsaasDeps): Promise<Subaccount | null> {
  const sub = await deps.store.getSubaccount(userId);
  return sub && sub.environment !== deps.client.environment ? null : sub;
}

/** Só vale o que aconteceu depois da subconta deste ambiente existir (antes, era dinheiro de teste). */
export function sinceSubaccount(sub: Subaccount, iso: string): boolean {
  return Date.parse(iso) >= Date.parse(sub.createdAt);
}

/** Dados reais da abertura enviada pelo membro. Sem ela não existe subconta. */
async function approvedKyc(userId: string, deps: AsaasDeps): Promise<BankKycApplication> {
  const app = await deps.latestKyc(userId);
  if (app?.status === "approved") return app;
  if (!app) throw new PartnerError(KYC_REQUIRED_MESSAGE, 403);
  if (app.status === "pending") throw new PartnerError(KYC_PENDING_MESSAGE, 403);
  throw new PartnerError("Sua abertura de conta não foi aprovada. Revise os dados na aba PRX BANK e envie de novo.", 403);
}

export const MINOR_NEEDS_EMANCIPATION =
  "Contas de menores de 18 anos só podem ser abertas com emancipação (a partir dos 16 anos). Enquanto isso, sua conta fica em ativação.";

/** Cria a subconta no Asaas (idempotente: quem já tem conta recebe a situação atual). */
export async function openSubaccount(userId: string, deps: AsaasDeps): Promise<SubaccountView> {
  await assertCanHoldMoney(userId);
  const app = await approvedKyc(userId, deps);
  const existing = await currentSubaccount(userId, deps);
  if (existing?.asaasAccountId) return subaccountView(existing);
  // O banco parceiro só abre conta de menor emancipado (e pede a certidão de emancipação).
  if (ageOn(app.birthDate, deps.now()) < 18 && app.minorPath !== "emancipated") throw new PartnerError(MINOR_NEEDS_EMANCIPATION, 409);

  const webhook = subaccountWebhook();
  // Sem como cifrar a chave, nem chama o Asaas: a apiKey só vem uma vez.
  encryptSecret("probe");

  const staleBefore = new Date(deps.now().getTime() - PROVISIONING_STALE_MS).toISOString();
  if (!(await deps.store.reserveSubaccount(userId, deps.client.environment, staleBefore))) {
    throw new PartnerError("A abertura da sua conta já está em andamento. Aguarde alguns instantes.", 409);
  }

  let created: CreatedSubaccount;
  try {
    created = await createSubaccount(deps.client, subaccountInput(app, webhook));
  } catch (err) {
    // Recusa clara libera para tentar de novo; resultado incerto mantém a trava (nada de conta dupla).
    if (!(err instanceof AsaasError && err.ambiguous)) await deps.store.releaseSubaccount(userId);
    throw toPartnerError(err, "Não foi possível abrir sua conta no banco parceiro.");
  }

  const { agency, accountNumber } = formatAccount(created.accountNumber);
  try {
    const saved = await deps.store.saveSubaccount(userId, {
      asaasAccountId: created.id,
      walletId: created.walletId,
      apiKeySealed: encryptSecret(created.apiKey),
      agency,
      accountNumber,
      status: "pending_activation",
      kycStatus: "PENDING",
      rejectReason: null,
      provisioningStartedAt: null,
    });
    await deps.mirror.linkAccount(userId, { providerAccountId: created.id, agency, accountNumber });
    return subaccountView(saved);
  } catch (err) {
    // A chave não volta mais: o id da conta vai para o log para o suporte gerar uma nova no Asaas.
    console.error("[bank] subconta criada no Asaas mas não gravada no PRX:", created.id, userId);
    throw err;
  }
}

/** Subconta já criada no Asaas, com a apiKey aberta só para a chamada. */
export async function requireSubaccount(userId: string, deps: AsaasDeps): Promise<{ sub: Subaccount; apiKey: string }> {
  const sub = await currentSubaccount(userId, deps);
  if (!sub?.asaasAccountId || !sub.apiKeySealed) throw new PartnerError("Abra sua conta no banco parceiro primeiro.", 409);
  return { sub, apiKey: decryptSecret(sub.apiKeySealed) };
}

/** Subconta aprovada pelo Asaas: só ela movimenta dinheiro. */
export async function requireActiveSubaccount(userId: string, deps: AsaasDeps): Promise<{ sub: Subaccount; apiKey: string }> {
  const found = await requireSubaccount(userId, deps);
  if (found.sub.status === "blocked") throw new PartnerError("Conta bloqueada. Fale com o suporte PRX.", 403);
  if (found.sub.status !== "active") throw new PartnerError(ACTIVATION_REQUIRED, 409);
  return found;
}

type GeneralStatus = "APPROVED" | "REJECTED" | "PENDING" | "AWAITING_APPROVAL";

/**
 * Menor emancipado cuja conta o banco parceiro aprovou (ele conferiu a certidão
 * de emancipação): vira conta comum no PRX, sem os limites de menor.
 */
async function liftEmancipatedMinor(userId: string, deps: AsaasDeps): Promise<void> {
  const app = await deps.latestKyc(userId);
  if (app?.minorPath !== "emancipated") return;
  const family = getFamilyRepository();
  const request = await family.latestEmancipation(userId).catch(() => null);
  if (request?.status === "pending") await family.decideEmancipation(request.id, "approved", "Certidão aprovada pelo banco parceiro.", "banco parceiro");
  await family.updateIdentity(userId, { accountType: "member", status: "active" });
}

/**
 * Aplica a aprovação geral do Asaas: aprovada ativa a conta (e o extrato,
 * Pix e boletos); reprovada pede novo envio de documentos. Avisa o membro uma
 * vez por mudança.
 */
export async function applyGeneralApproval(sub: Subaccount, status: GeneralStatus, reason: string | null, deps: AsaasDeps): Promise<Subaccount> {
  if (!sub.asaasAccountId) return sub;
  if (status === "APPROVED") {
    if (sub.status === "active" || sub.status === "blocked") return sub;
    const now = deps.now().toISOString();
    const saved = await deps.store.saveSubaccount(sub.userId, { status: "active", kycStatus: "APPROVED", rejectReason: null });
    await deps.mirror.setAccountStatus(sub.userId, "active", now);
    await liftEmancipatedMinor(sub.userId, deps).catch((err: unknown) => console.warn("[bank] emancipação não atualizada:", err instanceof Error ? err.message : err));
    const msg = bankMessage("account_approved");
    await deps.store.insertNotification({ userId: sub.userId, eventType: "ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED", ...msg, amount: null, eventId: `account:${sub.asaasAccountId}:approved` });
    return saved;
  }
  if (status === "REJECTED") {
    if (sub.status === "rejected" && sub.rejectReason === reason) return sub;
    const saved = await deps.store.saveSubaccount(sub.userId, { status: "rejected", kycStatus: "REJECTED", rejectReason: reason?.slice(0, 500) ?? null });
    await deps.mirror.setAccountStatus(sub.userId, "pending_activation");
    const msg = bankMessage("account_rejected", { reason });
    await deps.store.insertNotification({ userId: sub.userId, eventType: "ACCOUNT_STATUS_GENERAL_APPROVAL_REJECTED", ...msg, amount: null, eventId: `account:${sub.asaasAccountId}:rejected:${(reason ?? "").slice(0, 40)}` });
    return saved;
  }
  if (sub.status === "rejected") return deps.store.saveSubaccount(sub.userId, { status: "pending_activation", kycStatus: "PENDING" });
  return sub;
}

/** Consulta a situação no Asaas (reforço caso um webhook tenha se perdido). */
export async function refreshSubaccountStatus(userId: string, deps: AsaasDeps): Promise<SubaccountView> {
  const { sub, apiKey } = await requireSubaccount(userId, deps);
  try {
    const status = await getAccountStatus(deps.client, apiKey);
    const general = (status.general ?? "PENDING").toUpperCase();
    const known: GeneralStatus = general === "APPROVED" || general === "REJECTED" || general === "AWAITING_APPROVAL" ? general : "PENDING";
    return subaccountView(await applyGeneralApproval(sub, known, known === "REJECTED" ? sub.rejectReason : null, deps));
  } catch (err) {
    throw toPartnerError(err, "Não foi possível consultar sua conta no banco parceiro.");
  }
}

/**
 * Leva ao Asaas quem já tem a abertura aprovada: cria a subconta (uma vez) e
 * envia a frente e o verso do documento, que o Asaas analisa. No sandbox do
 * Asaas a subconta é ativada na hora para os testes de Pix.
 */
export async function ensureAsaasCustomerAndAccount(userId: string, deps: AsaasDeps = asaasDeps()): Promise<SubaccountView> {
  let sub = await currentSubaccount(userId, deps);
  let view: SubaccountView;

  if (sub?.asaasAccountId) {
    view = subaccountView(sub);
  } else {
    view = await openSubaccount(userId, deps);
    sub = await currentSubaccount(userId, deps);
    const { forwardKycDocuments } = await import("@/lib/bank/asaas/documents");
    // Falha aqui não desfaz a conta: o membro reenvia pela tela de documentos.
    await forwardKycDocuments(userId, deps).catch((err: unknown) => console.warn("[bank] documentos do KYC não enviados ao Asaas:", err instanceof Error ? err.message : err));
  }

  if (sub && deps.client.environment === "sandbox" && sub.status !== "active") {
    sub = await applyGeneralApproval(sub, "APPROVED", null, deps);
    view = subaccountView(sub);
  }
  if (sub?.status === "active") await ensureDefaultPixKey(userId, deps).catch(() => {});
  return view;
}

export interface SandboxChecklistResult {
  customer: { id: string };
  payment: { id: string; value: number };
  confirmed: boolean;
}

/**
 * Executa as 3 ações exigidas pelo checklist do painel Asaas Sandbox:
 * 1. Criar um cliente via API (/v3/customers)
 * 2. Criar uma cobrança via API (/v3/payments)
 * 3. Confirmar um pagamento via API (/v3/payments/{id}/receiveInCash)
 */
export async function completeAsaasSandboxChecklist(
  client: AsaasClient
): Promise<SandboxChecklistResult> {
  // Em produção isso criaria cliente e cobrança reais e daria baixa em dinheiro.
  if (client.environment !== "sandbox") throw new PartnerError("O checklist de homologação só roda no sandbox do Asaas.", 409);
  const customer = await createCustomer(client, undefined, {
    name: "PRX Homologação Sandbox",
    cpfCnpj: "52998224725",
    email: "sandbox@prx.app.br",
    mobilePhone: "11987654321",
  });

  const today = new Date().toISOString().slice(0, 10);
  const payment = await client.post<{ id: string; value: number }>("/payments", {
    customer: customer.id,
    billingType: "PIX",
    value: 5.0,
    dueDate: today,
    description: "Homologação API Asaas PRX",
  });

  let confirmed = false;
  try {
    await client.post(`/payments/${payment.id}/receiveInCash`, {
      paymentDate: today,
      value: 5.0,
    });
    confirmed = true;
  } catch (err) {
    console.warn("[asaas] Aviso ao confirmar pagamento de teste no sandbox:", err instanceof Error ? err.message : err);
  }

  return { customer: { id: customer.id }, payment: { id: payment.id, value: 5.0 }, confirmed };
}

