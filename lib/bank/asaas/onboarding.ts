// Hello World
import { PartnerError } from "@/lib/partners/errors";
import { AsaasError, toPartnerError } from "@/lib/asaas/errors";
import { recordNotSent, withAsaasAudit } from "@/lib/asaas/audit";
import { webhookAuthToken, webhookUrls } from "@/lib/asaas/config";
import { emailConfig } from "@/lib/notifications/config";
import { encryptSecret } from "@/lib/asaas/secrets";
import { SUBACCOUNT_WEBHOOK_EVENTS, approveSandboxAccount, createSubaccount, type CreatedSubaccount, type NewSubaccount, type SubaccountWebhook } from "@/lib/asaas/accounts";
import { assertCanHoldMoney } from "@/lib/family/guards";
import type { IncomeRange } from "@/lib/family/types";
import { KYC_PENDING_MESSAGE, KYC_REQUIRED_MESSAGE, type BankKycApplication } from "@/lib/kyc/types";
import { ageOn } from "@/lib/family/age";
import type { AsaasDeps } from "@/lib/bank/asaas/deps";
import { asaasDeps } from "@/lib/bank/asaas/deps";
import { ensureDefaultPixKey } from "@/lib/bank/asaas/cash-in";
import { applyStatusUpdate, fetchStatusSnapshot, parseSnapshot } from "@/lib/bank/asaas/account-status";
import { syncOnboardingDocuments } from "@/lib/bank/asaas/documents";
import { describeError, logProvisioning } from "@/lib/bank/asaas/provisioning-log";
import { adoptExistingSubaccount, formatAccount } from "@/lib/bank/asaas/recovery";
import { currentSubaccount, requireSubaccount, subaccountView, type SubaccountView } from "@/lib/bank/asaas/subaccount";
import type { ProvisioningOutcome } from "@/lib/bank/asaas/types";

export { currentSubaccount, requireActiveSubaccount, requireSubaccount, sinceSubaccount, subaccountView, type SubaccountView } from "@/lib/bank/asaas/subaccount";
export { applyGeneralApproval } from "@/lib/bank/asaas/account-status";
export { completeAsaasSandboxChecklist, type SandboxChecklistResult } from "@/lib/bank/asaas/sandbox-checklist";

/**
 * Abertura da conta no Asaas (subconta BaaS) com os dados da abertura enviada
 * pelo membro (docs: criação-de-subcontas-baas). Criar a subconta NÃO é
 * aprová-la: depois vêm os documentos (15 s depois, pelo link do Asaas ou pela
 * API) e a análise do Asaas, que chega pelos eventos ACCOUNT_STATUS_*. Só com
 * general = APPROVED a conta movimenta dinheiro. A apiKey devolvida uma única
 * vez é cifrada antes de ir ao banco.
 */

/** Renda mensal declarada no KYC (faixa) convertida no valor que o Asaas pede. */
export const INCOME_VALUE: Record<IncomeRange, number> = {
  ate_3k: 1500,
  "3k_6k": 4500,
  "6k_10k": 8000,
  "10k_20k": 15000,
  acima_20k: 25000,
};

/**
 * Trava de abertura esquecida (queda no meio da criação) pode ser retomada depois
 * disto. A retomada procura a conta pelo CPF antes de criar: nada de conta dupla.
 */
const PROVISIONING_STALE_MS = 2 * 60_000;

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

/** Dados reais da abertura enviada pelo membro. Sem ela não existe subconta. */
async function approvedKyc(userId: string, deps: AsaasDeps): Promise<BankKycApplication> {
  const app = await deps.latestKyc(userId);
  if (app?.status === "approved") return app;
  if (!app) throw new PartnerError(KYC_REQUIRED_MESSAGE, 403);
  if (app.status === "pending") throw new PartnerError(KYC_PENDING_MESSAGE, 403);
  throw new PartnerError("Sua abertura de conta não foi aprovada. Revise os dados na aba PRX BANK e envie de novo.", 403);
}

/** O membro não vê o erro do Asaas: o detalhe fica em bank_provisioning_log e asaas_api_requests. */
export const ACCOUNT_OPEN_RETRY = "Não foi possível abrir sua conta agora. Seus dados estão salvos: tente de novo em alguns minutos.";

export const MINOR_NEEDS_EMANCIPATION =
  "Contas de menores de 18 anos só podem ser abertas com emancipação (a partir dos 16 anos). Enquanto isso, sua conta fica em ativação.";

/** Cria a subconta no Asaas (idempotente: quem já tem conta recebe a situação atual). */
export function openSubaccount(userId: string, deps: AsaasDeps): Promise<SubaccountView> {
  return withAsaasAudit({ userId }, () => open(userId, deps));
}

async function open(userId: string, deps: AsaasDeps): Promise<SubaccountView> {
  // Cada tentativa fica para o admin (Supabase + Vercel); o membro só vê mensagens genéricas.
  const log = (outcome: ProvisioningOutcome, detail: string | null, asaasAccountId: string | null = null) =>
    logProvisioning(deps, { userId, step: "account", outcome, detail, asaasAccountId });
  const notSent = async (reason: string) => {
    await log("blocked", reason);
    await recordNotSent(deps.client.audit, { environment: deps.client.environment, operation: "account.create", method: "POST", path: "/accounts", reason });
  };

  let app: BankKycApplication;
  try {
    await assertCanHoldMoney(userId);
    app = await approvedKyc(userId, deps);
  } catch (err) {
    await notSent(describeError(err));
    throw err;
  }
  const existing = await currentSubaccount(userId, deps);
  if (existing?.asaasAccountId) return subaccountView(existing);
  // O banco parceiro só abre conta de menor emancipado (e pede a certidão de emancipação).
  if (ageOn(app.birthDate, deps.now()) < 18 && app.minorPath !== "emancipated") {
    await notSent(MINOR_NEEDS_EMANCIPATION);
    throw new PartnerError(MINOR_NEEDS_EMANCIPATION, 409);
  }

  let webhook: SubaccountWebhook;
  try {
    webhook = subaccountWebhook();
    // Sem como cifrar a chave, nem chama o Asaas: a apiKey só vem uma vez.
    encryptSecret("probe");
  } catch (err) {
    await notSent(`Configuração do servidor incompleta: ${describeError(err)}`);
    throw new PartnerError(ACCOUNT_OPEN_RETRY, 503);
  }

  const staleBefore = new Date(deps.now().getTime() - PROVISIONING_STALE_MS).toISOString();
  if (!(await deps.store.reserveSubaccount(userId, deps.client.environment, staleBefore))) {
    await notSent("Outra abertura deste membro já está em andamento (trava de provisionamento ativa).");
    throw new PartnerError("A abertura da sua conta já está em andamento. Aguarde alguns instantes.", 409);
  }

  // Uma tentativa anterior pode ter criado a conta sem o PRX saber: procura pelo CPF antes de criar.
  try {
    const adopted = await adoptExistingSubaccount(userId, app.cpf, deps);
    if (adopted) return subaccountView(adopted.sub);
  } catch (err) {
    await deps.store.releaseSubaccount(userId);
    await log("failed", `Não deu para conferir se a subconta já existia (nada foi criado): ${describeError(err)}`);
    throw new PartnerError(ACCOUNT_OPEN_RETRY, 503);
  }

  let created: CreatedSubaccount;
  try {
    created = await createSubaccount(deps.client, subaccountInput(app, webhook));
  } catch (err) {
    // Recusa clara libera para tentar de novo; resultado incerto mantém a trava e a próxima tentativa procura pelo CPF.
    const uncertain = err instanceof AsaasError && err.ambiguous;
    if (!uncertain) await deps.store.releaseSubaccount(userId);
    await log(uncertain ? "uncertain" : "failed", `${describeError(err)}${uncertain ? " · A subconta pode ter sido criada: a próxima tentativa procura pelo CPF antes de criar outra." : ""}`);
    throw new PartnerError(ACCOUNT_OPEN_RETRY, 503);
  }

  const { agency, accountNumber } = formatAccount(created.accountNumber);
  try {
    const saved = await deps.store.saveSubaccount(userId, {
      asaasAccountId: created.id,
      walletId: created.walletId,
      apiKeySealed: created.apiKey ? encryptSecret(created.apiKey) : null,
      agency,
      accountNumber,
      status: "pending_activation",
      kycStatus: "PENDING",
      rejectReason: null,
      provisioningStartedAt: null,
      accountCreatedAt: deps.now().toISOString(),
    });
    await log(
      created.apiKey ? "sent" : "failed",
      created.apiKey
        ? "Subconta criada no Asaas (ainda não aprovada). Próximos passos: documentos (15 s depois) e análise do Asaas."
        : "Subconta criada, mas o Asaas não devolveu a apiKey. Gere uma nova chave em Admin → Asaas para enviar os documentos.",
      created.id
    );
    await deps.mirror.linkAccount(userId, { providerAccountId: created.id, agency, accountNumber });
    return subaccountView(saved);
  } catch (err) {
    // A chave não volta mais: o id fica no log para o suporte religar a conta (procura pelo CPF) e gerar uma nova chave.
    await log("failed", `Subconta ${created.id} criada no Asaas, mas falhou ao gravar no PRX: ${describeError(err)}`, created.id);
    throw err;
  }
}

/** Consulta a situação no Asaas (reforço caso um webhook tenha se perdido). */
export async function refreshSubaccountStatus(userId: string, deps: AsaasDeps): Promise<SubaccountView> {
  return withAsaasAudit({ userId }, async () => {
    const { sub, apiKey } = await requireSubaccount(userId, deps);
    try {
      const snapshot = await fetchStatusSnapshot(apiKey, deps);
      const { sub: saved } = await applyStatusUpdate(sub, { snapshot, at: deps.now() }, deps);
      if (saved.status === "active") await ensureDefaultPixKey(userId, deps);
      return subaccountView(saved);
    } catch (err) {
      throw toPartnerError(err, "Não foi possível consultar sua conta no PRX BANK.");
    }
  });
}

/** No sandbox, a aprovação simulada oficial do Asaas; a situação aplicada é a que ele devolve. */
async function approveInSandbox(userId: string, deps: AsaasDeps): Promise<void> {
  const { sub, apiKey } = await requireSubaccount(userId, deps);
  if (sub.status === "active") return;
  const status = await approveSandboxAccount(deps.client, apiKey);
  await applyStatusUpdate(sub, { snapshot: parseSnapshot(status), at: deps.now() }, deps);
}

/**
 * Leva ao Asaas quem já tem a abertura aprovada: cria a subconta (uma vez) e,
 * passados 15 s da criação, envia os documentos (antes disso, quem chamou agenda
 * o envio com `after`; a aba PRX BANK e a conciliação também enviam).
 */
export async function ensureAsaasCustomerAndAccount(userId: string, deps: AsaasDeps = asaasDeps()): Promise<SubaccountView> {
  return withAsaasAudit({ userId }, async () => {
    let sub = await currentSubaccount(userId, deps);
    if (!sub?.asaasAccountId) {
      await openSubaccount(userId, deps);
      sub = await currentSubaccount(userId, deps);
    }
    if (!sub?.apiKeySealed) return subaccountView(sub);

    await syncOnboardingDocuments(userId, deps).catch((err: unknown) => console.warn("[prx-bank:abertura] documentos adiados:", describeError(err)));
    if (deps.client.environment === "sandbox") {
      await approveInSandbox(userId, deps).catch((err: unknown) => logProvisioning(deps, { userId, step: "status", outcome: "failed", asaasAccountId: sub?.asaasAccountId ?? null, detail: `Aprovação simulada do sandbox: ${describeError(err)}` }));
    }
    sub = await currentSubaccount(userId, deps);
    if (sub?.status === "active") await ensureDefaultPixKey(userId, deps).catch(() => {});
    return subaccountView(sub);
  });
}
