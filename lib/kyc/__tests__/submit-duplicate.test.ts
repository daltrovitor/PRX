// Hello World
import { beforeEach, describe, expect, it } from "vitest";
import { resetFamilyMemory } from "@/lib/family/repository";
import { registerIdentity } from "@/lib/family/service";
import { getKycRepository, resetKycMemory } from "@/lib/kyc/repository";
import { bankKycState, submitBankKyc } from "@/lib/kyc/service";
import { bankKycSchema, type BankKycInput } from "@/lib/kyc/types";

/*
 * "Registro duplicado" na abertura do PRX BANK: o Supabase tem um pedido em
 * análise por pessoa e um CPF aprovado por vez. Um envio repetido (toque duplo,
 * rede lenta) ou uma reabertura batia nessas regras e a tela mostrava erro,
 * embora a abertura já estivesse salva. Envio repetido agora é o mesmo envio.
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
    ],
    termsAccepted: true,
  });

const meta = { ip: "203.0.113.7", userAgent: "vitest" };
/** O que a rota usa quando a conta ainda não existe no banco parceiro. */
const routeOptions = { allowRedo: true, forward: true };

beforeEach(() => {
  resetFamilyMemory();
  resetKycMemory();
});

async function approvedForCpf(doc: string) {
  return (await getKycRepository().list("approved")).filter((a) => a.cpf === doc);
}

describe("abertura do PRX BANK sem 'Registro duplicado'", () => {
  it("toque duplo no primeiro envio (sem CPF na conta): os dois envios terminam bem e a conta fica aprovada", async () => {
    const u = member();
    const doc = cpf("123456780");
    const results = await Promise.allSettled([submitBankKyc(u, input(u.id, doc), meta, new Date(), routeOptions), submitBankKyc(u, input(u.id, doc), meta, new Date(), routeOptions)]);
    expect(results.map((r) => (r.status === "rejected" ? String((r.reason as Error).message) : "ok"))).toEqual(["ok", "ok"]);
    expect((await bankKycState(u.id)).status).toBe("approved");
    expect(await approvedForCpf(doc)).toHaveLength(1);
  });

  it("toque duplo com o CPF já registrado no cadastro: nada de erro e um único pedido aprovado", async () => {
    const u = member();
    const doc = cpf("223456780");
    await registerIdentity(u, { cpf: doc, birthDate: "2000-02-10" });
    const results = await Promise.allSettled([submitBankKyc(u, input(u.id, doc), meta, new Date(), routeOptions), submitBankKyc(u, input(u.id, doc), meta, new Date(), routeOptions)]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect((await bankKycState(u.id)).status).toBe("approved");
    expect(await approvedForCpf(doc)).toHaveLength(1);
  });

  it("refazer a abertura (conta ainda não criada no banco parceiro) troca a aprovada anterior pela nova", async () => {
    const u = member();
    const doc = cpf("323456780");
    const first = await submitBankKyc(u, input(u.id, doc), meta, new Date(), routeOptions);
    expect(first.status).toBe("approved");
    const second = await submitBankKyc(u, input(u.id, doc), meta, new Date(), routeOptions);
    expect(second.status).toBe("approved");
    expect(second.id).not.toBe(first.id);
    const approved = await approvedForCpf(doc);
    expect(approved.map((a) => a.id)).toEqual([second.id]);
    expect((await getKycRepository().get(first.id))?.reviewNote).toMatch(/Substituída/);
  });

  it("reenviar com a abertura já em análise devolve a mesma abertura, sem erro", async () => {
    const u = member();
    const doc = cpf("423456780");
    // Banco parceiro desligado neste deploy: a abertura fica salva em análise.
    const first = await submitBankKyc(u, input(u.id, doc), meta, new Date(), { allowRedo: true, forward: false });
    expect(first.status).toBe("pending");
    const again = await submitBankKyc(u, input(u.id, doc), meta, new Date(), { allowRedo: true, forward: false });
    expect(again.id).toBe(first.id);
    expect((await bankKycState(u.id)).status).toBe("pending");
  });

  it("CPF de outra pessoa continua barrado com a mensagem clara (não 'Registro duplicado')", async () => {
    const owner = member();
    const doc = cpf("523456780");
    await submitBankKyc(owner, input(owner.id, doc), meta, new Date(), routeOptions);
    const intruder = member();
    await expect(submitBankKyc(intruder, input(intruder.id, doc), meta, new Date(), routeOptions)).rejects.toThrow(/CPF/);
  });
});
