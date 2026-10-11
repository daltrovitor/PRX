// Hello World
import { PartnerError } from "@/lib/partners/errors";
import { withAsaasAudit } from "@/lib/asaas/audit";
import { createSubaccountApiKey, findSubaccountsByCpf, type CreatedSubaccount } from "@/lib/asaas/accounts";
import { encryptSecret } from "@/lib/asaas/secrets";
import type { AsaasDeps } from "@/lib/bank/asaas/deps";
import { describeError, logProvisioning } from "@/lib/bank/asaas/provisioning-log";
import { currentSubaccount } from "@/lib/bank/asaas/subaccount";
import type { Subaccount } from "@/lib/bank/asaas/types";

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
  const [chosen, ...others] = free;
  const { agency, accountNumber } = formatAccount(chosen.accountNumber);
  const now = deps.now().toISOString();
  const sub = await deps.store.saveSubaccount(userId, {
    asaasAccountId: chosen.id,
    walletId: chosen.walletId,
    apiKeySealed: null,
    agency,
    accountNumber,
    status: "pending_activation",
    kycStatus: "PENDING",
    rejectReason: null,
    provisioningStartedAt: null,
    accountCreatedAt: now,
  });
  const duplicates = others.map((a) => a.id);
  const extra = duplicates.length ? ` Outras subcontas com o mesmo CPF no Asaas (duplicadas por tentativas anteriores): ${duplicates.join(", ")}.` : "";
  await logProvisioning(deps, {
    userId,
    step: "account",
    outcome: "recovered",
    asaasAccountId: chosen.id,
    detail: `Subconta já existia no Asaas e foi religada ao membro (sem criar outra). Falta a chave da subconta: gere em Admin → Asaas.${extra}`,
  });
  await deps.mirror.linkAccount(userId, { providerAccountId: chosen.id, agency, accountNumber });
  return { sub, duplicates };
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
