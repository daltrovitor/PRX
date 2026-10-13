// Hello World
import { maskCpfInput } from "@/lib/cpf-mask";
import type { DocumentKind, DocumentRef, IncomeRange } from "@/lib/family/types";
import type { KycPrefill } from "@/lib/kyc/prefill";
import type { Uf } from "@/lib/kyc/types";

/**
 * Preenchimento da abertura do PRX BANK com o que a conta já sabe
 * (GET /api/bank/kyc): o membro não digita de novo CPF, nascimento, nome,
 * celular nem, ao refazer, endereço, perfil e documentos.
 */

export const maskPhone = (raw: string) => {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
};
export const maskCep = (raw: string) => raw.replace(/\D/g, "").slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2");

export interface KycFormSeed {
  dados: { fullName: string; cpf: string; birthDate: string; phone: string };
  address: { cep: string; street: string; number: string; complement: string; district: string; city: string; state: Uf | "" } | null;
  perfil: { occupation: string; incomeRange: IncomeRange | ""; pep: "no" | "yes" | "" } | null;
  docs: Partial<Record<DocumentKind, DocumentRef>>;
}

/** O que a conta sabe, ou null (sem sessão, sem rede): a tela segue vazia. */
export async function loadKycPrefill(): Promise<KycPrefill | null> {
  try {
    const res = await fetch("/api/bank/kyc", { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => ({}))) as { prefill?: KycPrefill };
    return json.prefill ?? null;
  } catch {
    return null;
  }
}

export function seedFromPrefill(p: KycPrefill, fallbackName: string): KycFormSeed {
  return {
    dados: { fullName: p.fullName || fallbackName, cpf: maskCpfInput(p.cpf), birthDate: p.birthDate, phone: maskPhone(p.phone) },
    address: p.address ? { ...p.address, cep: maskCep(p.address.cep), complement: p.address.complement ?? "", state: p.address.state as Uf } : null,
    perfil: p.occupation || p.incomeRange || p.pep !== null ? { occupation: p.occupation, incomeRange: p.incomeRange ?? "", pep: p.pep === null ? "" : p.pep ? "yes" : "no" } : null,
    docs: Object.fromEntries(p.documents.map((d) => [d.kind, d])) as Partial<Record<DocumentKind, DocumentRef>>,
  };
}
