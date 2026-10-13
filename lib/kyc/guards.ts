// Hello World
import { PartnerError } from "@/lib/partners/errors";
import { getKycRepository } from "@/lib/kyc/repository";
import { getFamilyRepository } from "@/lib/family/repository";
import { isSandboxMode } from "@/lib/bank/repository";
import { KYC_PENDING_MESSAGE, KYC_REQUIRED_MESSAGE, type BankKycState } from "@/lib/kyc/types";

/*
 * Trava do PRX BANK: nada de conta, chave Pix, cartão ou movimentação sem a
 * abertura aprovada (KYC). Módulo leve, importado pelo banco sem ciclo.
 */
export async function assertBankKycApproved(userId: string): Promise<void> {
  if (isSandboxMode()) return;
  const app = await getKycRepository().latestForUser(userId);
  if (!app) throw new PartnerError(KYC_REQUIRED_MESSAGE, 403);
  if (app.status === "pending") throw new PartnerError(KYC_PENDING_MESSAGE, 403);
  if (app.status === "rejected") throw new PartnerError("Sua abertura de conta não foi aprovada. Revise os dados na aba PRX BANK e envie de novo.", 403);
}

/** Situação da abertura de conta para a aba PRX BANK (sem dados pessoais). */
export async function bankKycState(userId: string): Promise<BankKycState> {
  if (isSandboxMode()) {
    return {
      status: "approved",
      reviewNote: "",
      awaitingGuardian: false,
      awaitingEmancipation: false,
      submittedAt: null,
    };
  }
  const [app, identity] = await Promise.all([getKycRepository().latestForUser(userId), getFamilyRepository().getIdentity(userId)]);
  const minor = identity?.accountType === "minor";
  return {
    status: app?.status ?? "none",
    reviewNote: app?.reviewNote ?? "",
    awaitingGuardian: minor && identity?.status === "link_pending",
    awaitingEmancipation: minor && identity?.status === "emancipation_pending",
    submittedAt: app?.createdAt ?? null,
  };
}
