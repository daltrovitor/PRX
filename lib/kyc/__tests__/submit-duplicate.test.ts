// Hello World
import { beforeEach, describe, expect, it } from "vitest";
import { resetFamilyMemory } from "@/lib/family/repository";
import { registerIdentity } from "@/lib/family/service";
import { getKycRepository, resetKycMemory } from "@/lib/kyc/repository";
import { bankKycState, reviewBankKyc, submitBankKyc } from "@/lib/kyc/service";
import { approveReceivedDocuments } from "@/lib/kyc/identity";
import { bankKycSchema, type BankKycInput } from "@/lib/kyc/types";

/*
 * "Registro duplicado" na abertura do PRX BANK: o Supabase tem um pedido em
 * análise por pessoa e um CPF aprovado por vez. Um envio repetido (toque duplo,
 * rede lenta) ou uma reabertura batia nessas regras e a tela mostrava erro,
 * embora a abertura já estivesse salva. Envio repetido agora é o mesmo envio.
 * Desde 15/10/2026 toda abertura espera a análise da PRX (admin) em "pending".
 */

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

let seq = 500;
const member = () => {
  seq += 1;
  return { id: `usr_dup_${seq}`, email: `dup${seq}@prx.dev`, fullName: "Pessoa Teste Silva" };
};

const input = (userId: string, cpfDigits: string): BankKycInput =>
  bankKycSchema.parse({
    fullName: "Pessoa Teste Silva",
    cpf: cpfDigits,
    birthDate: "2000-02-10",
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

const meta = { ip: "203.0.113.7", userAgent: "vitest" };
/** O que a rota usa quando a conta ainda não existe no banco parceiro. */
const routeOptions = { allowRedo: true };

/** O admin confere os documentos e aprova a identidade. */
async function adminApproves(id: string) {
  await approveReceivedDocuments(id, "admin@prx.dev");
  return reviewBankKyc(id, "approve", "", "admin@prx.dev");
}

beforeEach(() => {
  resetFamilyMemory();
  resetKycMemory();
});

async function approvedForCpf(doc: string) {
  return (await getKycRepository().list("approved")).filter((a) => a.cpf === doc);
}

describe("abertura do PRX BANK sem 'Registro duplicado'", () => {
  it("toque duplo no primeiro envio (sem CPF na conta): os dois envios terminam bem, num único pedido em análise", async () => {
    const u = member();
    const doc = cpf("123456780");
    const results = await Promise.allSettled([submitBankKyc(u, input(u.id, doc), meta, new Date(), routeOptions), submitBankKyc(u, input(u.id, doc), meta, new Date(), routeOptions)]);
    expect(results.map((r) => (r.status === "rejected" ? String((r.reason as Error).message) : "ok"))).toEqual(["ok", "ok"]);
    expect((await bankKycState(u.id)).status).toBe("pending");
    expect((await getKycRepository().list("pending")).filter((a) => a.cpf === doc)).toHaveLength(1);
    expect(await approvedForCpf(doc)).toHaveLength(0);
  });

  it("toque duplo com o CPF já registrado no cadastro: nada de erro e um único pedido aprovado", async () => {
    const u = member();
    const doc = cpf("223456780");
    await registerIdentity(u, { cpf: doc, birthDate: "2000-02-10" });
    const results = await Promise.allSettled([submitBankKyc(u, input(u.id, doc), meta, new Date(), routeOptions), submitBankKyc(u, input(u.id, doc), meta, new Date(), routeOptions)]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect((await bankKycState(u.id)).status).toBe("pending");
    expect((await getKycRepository().list("pending")).filter((a) => a.cpf === doc)).toHaveLength(1);
  });

  it("refazer a abertura (conta ainda não criada no banco parceiro) troca a aprovada anterior pela nova", async () => {
    const u = member();
    const doc = cpf("323456780");
    const first = await submitBankKyc(u, input(u.id, doc), meta, new Date(), routeOptions);
    expect(first.status).toBe("pending");
    expect((await adminApproves(first.id)).status).toBe("approved");
    const second = await submitBankKyc(u, input(u.id, doc), meta, new Date(), routeOptions);
    expect(second.status).toBe("pending");
    expect(second.id).not.toBe(first.id);
    expect((await adminApproves(second.id)).status).toBe("approved");
    const approved = await approvedForCpf(doc);
    expect(approved.map((a) => a.id)).toEqual([second.id]);
    expect((await getKycRepository().get(first.id))?.reviewNote).toMatch(/Substituída/);
  });

  it("reenviar com a abertura já em análise devolve a mesma abertura, sem erro", async () => {
    const u = member();
    const doc = cpf("423456780");
    const first = await submitBankKyc(u, input(u.id, doc), meta, new Date(), routeOptions);
    expect(first.status).toBe("pending");
    const again = await submitBankKyc(u, input(u.id, doc), meta, new Date(), routeOptions);
    expect(again.id).toBe(first.id);
    expect((await bankKycState(u.id)).status).toBe("pending");
  });

  it("CPF de outra pessoa continua barrado com a mensagem clara (não 'Registro duplicado')", async () => {
    const owner = member();
    const doc = cpf("523456780");
    await adminApproves((await submitBankKyc(owner, input(owner.id, doc), meta, new Date(), routeOptions)).id);
    const intruder = member();
    await expect(submitBankKyc(intruder, input(intruder.id, doc), meta, new Date(), routeOptions)).rejects.toThrow(/CPF/);
  });
});
