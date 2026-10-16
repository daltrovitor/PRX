// Hello World
import { PartnerError } from "@/lib/partners/errors";
import { withAsaasAudit } from "@/lib/asaas/audit";
import { createSubaccountApiKey, findSubaccountsByCpf, type CreatedSubaccount } from "@/lib/asaas/accounts";
import { encryptSecret } from "@/lib/asaas/secrets";
import type { AsaasDeps } from "@/lib/bank/asaas/deps";
import { describeError, logProvisioning } from "@/lib/bank/asaas/provisioning-log";
import { currentSubaccount } from "@/lib/bank/asaas/subaccount";
import type { Subaccount } from "@/lib/bank/asaas/types";
import { getKycRepository } from "@/lib/kyc/repository";
import { KYC_RESTART_NOTE } from "@/lib/kyc/types";

/**
 * Quando a resposta da criação se perde (timeout, queda, formato inesperado),
 * a subconta pode existir no Asaas sem o PRX saber. Antes de criar outra, o
 * PRX procura pelo CPF (GET /v3/accounts?cpfCnpj=) e religa a que achar: nada
 * de segunda conta. A chave da subconta, se não veio, é gerada depois pelo
 * admin (POST /v3/accounts/{id}/accessTokens).
 */

export function formatAccount(number: CreatedSubaccount["accountNumber"]): { agency: string | null; accountNumber: string | null } {
  if (!number?.account) return { agency: number?.agency ?? null, accountNumber: null };
  return { agency: number.agency, accountNumber: number.accountDigit ? `${number.account}-${number.accountDigit}` : number.account };
}

export interface Adoption {
  sub: Subaccount;
  /** Outras subcontas com o mesmo CPF no Asaas (duplicadas por tentativas antigas). */
  duplicates: string[];
}

/** Religa a subconta deste CPF que já existe no Asaas. null quando não há nenhuma livre. Quem chama segura a trava de abertura. */
export async function adoptExistingSubaccount(userId: string, cpf: string, deps: AsaasDeps): Promise<Adoption | null> {
  const found = await findSubaccountsByCpf(deps.client, cpf);
  const free: typeof found = [];
  for (const account of found) {
    const owner = await deps.store.findSubaccountByAsaasId(account.id);
    if (!owner || owner.userId === userId) free.push(account);
  }
  if (free.length === 0) return null;
  // Cadastro excluído e refeito com o mesmo CPF: a subconta guardada no cofre volta com a chave.
  const vaulted = await Promise.all(free.map((a) => deps.store.vaultedSubaccount(a.id, deps.client.environment).catch(() => null)));
  const keyed = vaulted.findIndex((v) => Boolean(v?.apiKeySealed));
  const pick = keyed >= 0 ? keyed : 0;
  const chosen = free[pick];
  const others = free.filter((_, i) => i !== pick);
  const restoredKey = vaulted[pick]?.apiKeySealed ?? null;
  const { agency, accountNumber } = formatAccount(chosen.accountNumber);
  const now = deps.now().toISOString();
  const sub = await deps.store.saveSubaccount(userId, {
    asaasAccountId: chosen.id,
    walletId: chosen.walletId ?? vaulted[pick]?.walletId ?? null,
    apiKeySealed: restoredKey,
    agency,
    accountNumber,
    status: "pending_activation",
    kycStatus: "PENDING",
    rejectReason: null,
    provisioningStartedAt: null,
    accountCreatedAt: now,
    // Documentos do novo cadastro seguem de novo ao Asaas; o aviso do link também.
    documentsSyncedAt: null,
    onboardingNotifiedAt: null,
  });
  if (vaulted[pick]) await deps.store.markVaultAdopted(chosen.id, userId).catch(() => undefined);
  const duplicates = others.map((a) => a.id);
  const extra = duplicates.length ? ` Outras subcontas com o mesmo CPF no Asaas (duplicadas por tentativas anteriores): ${duplicates.join(", ")}.` : "";
  await logProvisioning(deps, {
    userId,
    step: "account",
    outcome: "recovered",
    asaasAccountId: chosen.id,
    detail: restoredKey
      ? `Subconta já existia no Asaas (cadastro anterior excluído) e foi religada ao membro com a chave guardada no cofre. Nada foi criado.${extra}`
      : `Subconta já existia no Asaas e foi religada ao membro (sem criar outra). Falta a chave da subconta: gere em Admin → Asaas.${extra}`,
  });
  await deps.mirror.linkAccount(userId, { providerAccountId: chosen.id, agency, accountNumber });
  return { sub, duplicates };
}

/**
 * Recomeça a abertura do PRX BANK sem apagar o cadastro (testes, abertura
 * travada): o último envio é encerrado e o membro volta ao formulário. A
 * subconta do Asaas, em análise ou aprovada, continua ligada com a chave e é
 * reaproveitada no próximo envio (nada de conta nova); os documentos desse
 * envio seguem de novo ao Asaas. Apagar o cadastro também não perde mais a
 * chave: o gatilho da migração 20261015 a guarda no cofre e o novo cadastro do
 * mesmo CPF religa a subconta com ela (sem a migração, a chave se perde e pela
 * Vercel não dá para gerar outra: whitelist de IP).
 */
export async function restartOpening(userId: string, deps: AsaasDeps, reviewer: string): Promise<{ retiredKyc: boolean; asaasAccountId: string | null }> {
  const app = await deps.latestKyc(userId);
  const retiredKyc = Boolean(app && app.status !== "rejected");
  if (app && retiredKyc) await getKycRepository().decide(app.id, "rejected", KYC_RESTART_NOTE, reviewer);

  const sub = await currentSubaccount(userId, deps);
  if (sub?.asaasAccountId) await deps.store.saveSubaccount(userId, { documentsSyncedAt: null, onboardingNotifiedAt: null });
  else if (sub) await deps.store.releaseSubaccount(userId);
  const asaasAccountId = sub?.asaasAccountId ?? null;
  await logProvisioning(deps, {
    userId,
    step: "account",
    outcome: "recovered",
    asaasAccountId,
    detail: `Abertura recomeçada pelo suporte (${reviewer}): membro volta ao formulário.${asaasAccountId ? ` Subconta ${asaasAccountId} mantida${sub?.apiKeySealed ? " com a chave" : " (sem chave guardada)"}; os documentos do próximo envio seguem ao Asaas.` : ""}`,
  });
  return { retiredKyc, asaasAccountId };
}

/**
 * Gera e guarda (cifrada) uma nova chave para a subconta do membro. Só para o
 * admin: exige o gerenciamento de chaves liberado no painel do Asaas (2 h) e o
 * IP do servidor na whitelist. Não substitui uma chave que já existe.
 */
export async function regenerateSubaccountKey(userId: string, deps: AsaasDeps): Promise<Subaccount> {
  return withAsaasAudit({ userId }, async () => {
    const sub = await currentSubaccount(userId, deps);
    if (!sub?.asaasAccountId) throw new PartnerError("Este membro ainda não tem subconta no Asaas.", 409);
    if (sub.apiKeySealed) throw new PartnerError("A subconta já tem chave guardada no PRX.", 409);
    encryptSecret("probe");
    try {
      const apiKey = await createSubaccountApiKey(deps.client, sub.asaasAccountId, "PRX BANK");
      const saved = await deps.store.saveSubaccount(userId, { apiKeySealed: encryptSecret(apiKey) });
      await logProvisioning(deps, { userId, step: "api_key", outcome: "sent", asaasAccountId: sub.asaasAccountId, detail: "Nova chave da subconta gerada e guardada cifrada." });
      return saved;
    } catch (err) {
      await logProvisioning(deps, { userId, step: "api_key", outcome: "failed", asaasAccountId: sub.asaasAccountId, detail: describeError(err) });
      throw err instanceof PartnerError ? err : new PartnerError(`O Asaas não gerou a chave: ${describeError(err)}. Libere o gerenciamento de chaves de subcontas no painel do Asaas (vale 2 h) e confira a whitelist de IPs.`, 503);
    }
  });
}
