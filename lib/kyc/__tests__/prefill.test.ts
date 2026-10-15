// Hello World
import { beforeEach, describe, expect, it } from "vitest";
import { resetFamilyMemory } from "@/lib/family/repository";
import { resetKycMemory } from "@/lib/kyc/repository";
import { submitBankKyc } from "@/lib/kyc/service";
import { kycPrefill, withAccountIdentity } from "@/lib/kyc/prefill";
import { seedFromPrefill } from "@/components/app/bank/kyc-prefill";
import { rememberBirthDate } from "@/lib/live/buyer";
import { bankKycSchema, type BankKycInput } from "@/lib/kyc/types";

/** CPF válido a partir de 9 dígitos. */
function cpf(base: string): string {
  const d = base.split("").map(Number);
  const digit = (len: number) => {
    const sum = d.slice(0, len).reduce((acc, n, i) => acc + n * (len + 1 - i), 0);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  d.push(digit(9));
  d.push(digit(10));
  return d.join("");
}

let seq = 100;
const member = (extra: { cpf?: string; phone?: string } = {}) => {
  seq += 1;
  return { id: `usr_prefill_${seq}`, email: `p${seq}@prx.dev`, fullName: "Pessoa Teste Silva", ...extra };
};

const input = (userId: string, cpfDigits: string, birthDate: string): BankKycInput =>
  bankKycSchema.parse({
    fullName: "Pessoa Teste Silva",
    cpf: cpfDigits,
    birthDate,
    phone: "11988887777",
    occupation: "Estudante",
    incomeRange: "ate_3k",
    pep: false,
    address: { cep: "01310100", street: "Avenida Paulista", number: "1000", complement: "", district: "Bela Vista", city: "São Paulo", state: "SP" },
    documents: [
      { kind: "id_front", path: `${userId}/f.jpg`, name: "frente.jpg" },
      { kind: "id_back", path: `${userId}/b.jpg`, name: "verso.jpg" },
      { kind: "selfie", path: `${userId}/s.jpg`, name: "selfie.jpg" },
    ],
    termsAccepted: true,
  });

beforeEach(() => {
  resetFamilyMemory();
  resetKycMemory();
});

describe("abertura do PRX BANK pede cada dado uma vez só", () => {
  it("CPF, celular e nascimento do cadastro vêm preenchidos e travados", async () => {
    const doc = cpf("529982247");
    const u = member({ cpf: doc, phone: "+5511977776666" });
    await rememberBirthDate(u.id, "2001-04-05", { source: "signup", verified: true });
    await expect(kycPrefill(u)).resolves.toMatchObject({
      fullName: "Pessoa Teste Silva",
      cpf: doc,
      birthDate: "2001-04-05",
      phone: "11977776666",
      cpfLocked: true,
      birthDateLocked: true,
      address: null,
      documents: [],
    });
  });

  it("refazer a abertura traz endereço, perfil e documentos da anterior", async () => {
    const doc = cpf("111444777");
    const u = member();
    await submitBankKyc(u, input(u.id, doc, "2000-01-01"), { ip: null, userAgent: "" });
    const prefill = await kycPrefill(u);
    expect(prefill).toMatchObject({ cpf: doc, birthDate: "2000-01-01", cpfLocked: true, birthDateLocked: true, occupation: "Estudante", incomeRange: "ate_3k", pep: false });
    expect(prefill.address).toMatchObject({ cep: "01310100", city: "São Paulo" });
    expect(prefill.documents.map((d) => d.kind)).toEqual(["id_front", "id_back", "selfie"]);
  });

  it("a tela recebe tudo já formatado: CPF, celular, CEP, perfil e documentos por tipo", async () => {
    const doc = cpf("111444777");
    const u = member();
    await submitBankKyc(u, input(u.id, doc, "2000-01-01"), { ip: null, userAgent: "" });
    const seed = seedFromPrefill(await kycPrefill(u), "");
    expect(seed.dados).toEqual({ fullName: "Pessoa Teste Silva", cpf: "111.444.777-35", birthDate: "2000-01-01", phone: "(11) 98888-7777" });
    expect(seed.address).toMatchObject({ cep: "01310-100", state: "SP" });
    expect(seed.perfil).toEqual({ occupation: "Estudante", incomeRange: "ate_3k", pep: "no" });
    expect(Object.keys(seed.docs).sort()).toEqual(["id_back", "id_front", "selfie"]);
  });

  it("o servidor usa o CPF e o nascimento da conta, não os digitados na tela", async () => {
    const doc = cpf("529982247");
    const typed = input("u", cpf("111444777"), "1999-09-09");
    const known = { cpf: doc, birthDate: "2001-04-05", cpfLocked: true, birthDateLocked: true };
    expect(withAccountIdentity(typed, known)).toMatchObject({ cpf: doc, birthDate: "2001-04-05" });
    // Sem dado na conta, vale o da tela.
    expect(withAccountIdentity(typed, { ...known, cpfLocked: false, birthDateLocked: false })).toMatchObject({ cpf: typed.cpf, birthDate: "1999-09-09" });
  });
});
