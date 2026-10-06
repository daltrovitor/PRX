// Hello World
import { getBankRepository, isAsaasProduction } from "@/lib/bank/repository";

/**
 * A conta PRX BANK está aberta, confirmada e funcionando (nem pendente, nem bloqueada)?
 * A partir daí o app exige senha ou biometria a cada entrada (lib/lock.ts). Só lê a linha
 * da conta: roda a cada abertura do app, então nunca cria a conta nem fala com o banco parceiro.
 * Em produção com o Asaas, só vale a conta ligada à subconta do parceiro; "ativa" sem vínculo é
 * resto do sandbox. Qualquer falha de leitura conta como "não ativa": o app abre como antes.
 */
export async function bankAccountIsActive(userId: string): Promise<boolean> {
  try {
    const account = await getBankRepository(userId).findAccount(userId);
    if (!account || account.status !== "active") return false;
    return isAsaasProduction() ? Boolean(account.providerAccountId) : true;
  } catch {
    return false;
  }
}
