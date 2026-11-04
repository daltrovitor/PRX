// Hello World
import type { AccountStatus, BankActivation, BankProviderView } from "@/lib/prx/bank";
import type { BankKycState } from "@/lib/kyc/types";

/**
 * Máquina de estados da abertura do PRX BANK. Só o servidor decide a etapa,
 * com o que está salvo: quem já enviou os dados nunca volta ao formulário por
 * engano, e uma abertura em análise nunca aparece como aprovada. A conta só é
 * "active" com a aprovação do banco parceiro (ou no sandbox).
 */
export interface ActivationInput {
  kyc: BankKycState["status"];
  /** O banco parceiro atende este membro neste deploy (provedor ligado e conta real). */
  bankOnline: boolean;
  sandbox: boolean;
  /** Subconta no banco parceiro; null quando o banco não respondeu ou está desligado. */
  provider: BankProviderView["state"] | null;
  accountStatus: AccountStatus;
}

export function bankActivation(input: ActivationInput): BankActivation {
  if (input.sandbox) return input.accountStatus === "blocked" ? "blocked" : "active";
  if (input.kyc === "none" || input.kyc === "rejected") return "form";
  if (input.kyc === "pending") return "waiting";
  // Dados aprovados pelas regras da PRX: daqui em diante quem decide é o banco parceiro.
  // Sem resposta do banco agora: conta já liberada continua liberada; o resto aguarda, sem pedir reenvio.
  if (!input.bankOnline || input.provider === null) return input.accountStatus === "active" ? "active" : "unavailable";
  switch (input.provider) {
    case "none":
      return "ready";
    case "provisioning":
      return "opening";
    case "pending_activation":
      return "review";
    case "rejected":
      return "rejected";
    case "active":
      return "active";
    case "blocked":
      return "blocked";
  }
}
