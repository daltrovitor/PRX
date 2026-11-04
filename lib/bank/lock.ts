// Hello World
import { getBankRepository, isBankProduction, isSandboxMode, usesSupabaseBank } from "@/lib/bank/repository";

/**
 * A conta PRX BANK está aberta, confirmada e funcionando (nem pendente, nem bloqueada)?
 * A partir daí o app exige senha ou biometria a cada entrada (lib/lock.ts). Só lê a linha
 * da conta: roda a cada abertura do app, então nunca cria a conta nem fala com o banco parceiro.
 * Com dinheiro real (produção do banco parceiro, ou conta no Supabase fora do sandbox), só vale a conta ligada ao banco parceiro;
 * "ativa" sem vínculo é resto do sandbox. Qualquer falha de leitura conta como "não ativa": o app abre como antes.
 */
export async function bankAccountIsActive(userId: string): Promise<boolean> {
  try {
    const account = await getBankRepository(userId).findAccount(userId);
    if (!account || account.status !== "active") return false;
    const realMoney = isBankProduction() || (usesSupabaseBank(userId) && !isSandboxMode());
    return realMoney ? Boolean(account.providerAccountId) : true;
  } catch {
    return false;
  }
}
