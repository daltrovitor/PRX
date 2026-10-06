// Hello World
import { isValidCpf } from "@/lib/partners/documents";

/**
 * Quem conta como membro no painel admin. O Supabase cria o acesso (e o gatilho do banco
 * cria o perfil) assim que alguém entra com o Google, antes de qualquer CPF: esse perfil
 * vazio não é membro. Só conta quem tem CPF válido, no perfil ou na identidade de família
 * (a Conta Pai e os filhos guardam o CPF lá). Contas de equipe (parceiro, staff, admin) são
 * criadas pelo admin e não precisam de CPF.
 */
export function isRegisteredMember(account: { role?: string | null; cpf?: string | null }, familyCpf?: string | null): boolean {
  if (account.role && account.role !== "user") return true;
  return isValidCpf(account.cpf ?? "") || isValidCpf(familyCpf ?? "");
}
