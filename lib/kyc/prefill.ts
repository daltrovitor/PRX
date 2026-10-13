// Hello World
import type { StoredUser } from "@/lib/auth";
import { getFamilyRepository } from "@/lib/family/repository";
import { onlyDigits, type DocumentRef, type IncomeRange } from "@/lib/family/types";
import { isValidCpf } from "@/lib/prx/pix";
import { getKycRepository } from "@/lib/kyc/repository";
import { buyerBirthDate } from "@/lib/live/buyer";
import type { BankKycInput, KycAddress } from "@/lib/kyc/types";

/**
 * O que a abertura do PRX BANK já sabe do membro, para não pedir de novo:
 *   - CPF e nascimento da conta (cadastro conferido na Receita, ou a identidade
 *     de uma abertura anterior) vêm travados: o servidor usa esses, não os da tela;
 *   - nome e celular vêm do cadastro (ou da última abertura);
 *   - endereço, perfil e documentos vêm da última abertura, para refazer só o
 *     que mudou (documentos não voltam de uma abertura recusada).
 * Só para o próprio membro (rota autenticada, sem cache).
 */
export interface KycPrefill {
  fullName: string;
  cpf: string;
  birthDate: string;
  phone: string;
  cpfLocked: boolean;
  birthDateLocked: boolean;
  address: KycAddress | null;
  occupation: string;
  incomeRange: IncomeRange | null;
  pep: boolean | null;
  documents: DocumentRef[];
}

type Member = Pick<StoredUser, "id" | "fullName" | "cpf" | "phone">;

export async function kycPrefill(user: Member): Promise<KycPrefill> {
  const [identity, latest, birth] = await Promise.all([
    getFamilyRepository().getIdentity(user.id),
    getKycRepository().latestForUser(user.id),
    buyerBirthDate(user.id).catch(() => null),
  ]);
  const profileCpf = onlyDigits(user.cpf ?? "");
  const accountCpf = identity?.cpf || (isValidCpf(profileCpf) ? profileCpf : "");
  const accountBirth = identity?.birthDate || birth?.birthDate || "";
  return {
    fullName: latest?.fullName || user.fullName || "",
    cpf: accountCpf || latest?.cpf || "",
    birthDate: accountBirth || latest?.birthDate || "",
    phone: latest?.phone || onlyDigits(user.phone ?? "").replace(/^55(?=\d{11}$)/, ""),
    cpfLocked: Boolean(accountCpf),
    birthDateLocked: Boolean(accountBirth),
    address: latest?.address ?? null,
    occupation: latest?.occupation ?? "",
    incomeRange: latest?.incomeRange ?? null,
    pep: latest ? latest.pep : null,
    documents: latest && latest.status !== "rejected" ? latest.documents : [],
  };
}

/** O que vale da conta ganha do que veio da tela: CPF e nascimento não mudam pela abertura. */
export function withAccountIdentity(input: BankKycInput, known: Pick<KycPrefill, "cpf" | "birthDate" | "cpfLocked" | "birthDateLocked">): BankKycInput {
  return { ...input, ...(known.cpfLocked ? { cpf: known.cpf } : {}), ...(known.birthDateLocked ? { birthDate: known.birthDate } : {}) };
}
