// Hello World
import { beforeEach, describe, expect, it } from "vitest";
import { ageGroup, ageOn, maskCpf, nextAllowanceRun } from "@/lib/family/age";
import { allowanceSchema, identityInputSchema, limitsSchema, missingParentDocuments } from "@/lib/family/types";
import { resetFamilyMemory, getFamilyRepository } from "@/lib/family/repository";
import {
  assertMinorSpend,
  childDetail,
  createChildAccount,
  familyOverview,
  familyState,
  registerIdentity,
  registerParent,
  respondLink,
  reviewParentApplication,
  runDueAllowances,
  sendToChild,
  setAllowance,
  setLimits,
  submitEmancipation,
  submitParentApplication,
  reviewEmancipation,
} from "@/lib/family/service";
import { activateSandbox, accountView } from "@/lib/bank/service";
import { resetKycMemory } from "@/lib/kyc/repository";
import { autoApproveBankKyc, reviewBankKyc, submitBankKyc } from "@/lib/kyc/service";
import type { BankKycInput } from "@/lib/kyc/types";

const CONSENT = { relationship: "mae" as const, guardianshipDeclared: true as const, consentAccepted: true as const };
const TUTELA = { relationship: "mae" as const, guardianshipDeclared: true as const };
const IP = "203.0.113.7";

/** Abertura do PRX BANK com os dados mínimos válidos; documentos na pasta do próprio usuário. */
function kycInput(userId: string, cpf: string, birthDate: string, extra: Partial<BankKycInput> = {}): BankKycInput {
  return {
    fullName: "Pessoa Teste Silva",
    cpf,
    birthDate,
    motherName: "Maria Teste Silva",
    phone: "11988887777",
    occupation: "Estudante",
    incomeRange: "ate_3k",
    pep: false,
    address: { cep: "01310100", street: "Avenida Paulista", number: "1000", complement: "", district: "Bela Vista", city: "São Paulo", state: "SP" },
    documents: [
      { kind: "id_front", path: `${userId}/f.jpg`, name: "" },
      { kind: "id_back", path: `${userId}/b.jpg`, name: "" },
    ],
    termsAccepted: true,
    ...extra,
  };
}

// 2026-09-28 12:00 UTC = 09:00 em Brasília.
const NOW = new Date("2026-09-28T12:00:00Z");
let seq = 0;
const cpfFrom = (base: string) => {
  const d = base.split("").map(Number);
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += d[i] * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  d.push(calc(9));
  d.push(calc(10));
  return d.join("");
};
const nextCpf = () => cpfFrom(String(100000000 + Date.now() % 100000 * 1000 + ++seq).slice(0, 9));
const uniq = () => `${Date.now().toString(36)}${++seq}`;

describe("idade e CPF", () => {
  it("calcula a idade em Brasília, com o aniversário à meia-noite local", () => {
    // 02:59 UTC do dia 28 ainda é dia 27 em Brasília.
    expect(ageOn("2010-09-28", new Date("2026-09-28T02:59:00Z"))).toBe(15);
    expect(ageOn("2010-09-28", new Date("2026-09-28T03:00:00Z"))).toBe(16);
    expect(ageGroup("2011-01-01", NOW)).toBe("child");
    expect(ageGroup("2009-10-01", NOW)).toBe("teen");
    expect(ageGroup("2008-09-28", NOW)).toBe("adult");
    expect(ageGroup("1990-01-01", NOW)).toBe("over");
  });

  it("valida CPF e data de nascimento", () => {
    expect(identityInputSchema.safeParse({ cpf: "529.982.247-25", birthDate: "2000-01-01" }).success).toBe(true);
    expect(identityInputSchema.safeParse({ cpf: "111.111.111-11", birthDate: "2000-01-01" }).success).toBe(false);
    expect(identityInputSchema.safeParse({ cpf: "529.982.247-25", birthDate: "2000-02-30" }).success).toBe(false);
    expect(maskCpf("52998224725")).toBe("***.982.247-**");
  });

  it("exige RG e CPF (ou CNH) e a certidão do filho na Conta Pai", () => {
    expect(missingParentDocuments([])).toEqual(["rg", "cpf", "child_certificate"]);
    expect(missingParentDocuments([{ kind: "cnh" }, { kind: "child_certificate" }])).toEqual([]);
    expect(missingParentDocuments([{ kind: "rg" }, { kind: "child_certificate" }])).toEqual(["cpf"]);
  });

  it("valida mesada e limites", () => {
    expect(allowanceSchema.safeParse({ amount: 50, frequency: "weekly", weekday: 5 }).success).toBe(true);
    expect(allowanceSchema.safeParse({ amount: 0, frequency: "weekly" }).success).toBe(false);
    expect(limitsSchema.safeParse({ perTransaction: 200, daily: 100, monthly: 500 }).success).toBe(false);
    expect(limitsSchema.safeParse({ perTransaction: 50, daily: 100, monthly: 500 }).success).toBe(true);
  });

  it("agenda a próxima mesada às 09:00 de Brasília", () => {
    // Segunda, 28/09/2026, 09:00 BRT → próxima sexta (5) = 02/10.
    expect(nextAllowanceRun("weekly", 5, 1, NOW).toISOString()).toBe("2026-10-02T12:00:00.000Z");
    // Mesmo dia e mesma hora não conta: vai para a semana seguinte.
    expect(nextAllowanceRun("weekly", 1, 1, NOW).toISOString()).toBe("2026-10-05T12:00:00.000Z");
    expect(nextAllowanceRun("monthly", 1, 5, NOW).toISOString()).toBe("2026-10-05T12:00:00.000Z");
    expect(nextAllowanceRun("monthly", 1, 28, new Date("2026-09-01T00:00:00Z")).toISOString()).toBe("2026-09-28T12:00:00.000Z");
  });
});

describe("cadastro com verificação de idade (memória)", () => {
  beforeEach(() => resetFamilyMemory());
  const member = () => ({ id: `usr_${uniq()}`, email: `m${uniq()}@prx.dev`, fullName: "Jovem Teste" });

  it("menor de 16 só com o responsável (vínculo com a Conta Pai)", async () => {
    await expect(registerIdentity(member(), { cpf: nextCpf(), birthDate: "2012-05-01" }, NOW)).rejects.toMatchObject({ code: "PARENT_REQUIRED", status: 403 });
    await expect(registerIdentity(member(), { cpf: nextCpf(), birthDate: "2012-05-01", teenPath: "emancipated" }, NOW)).rejects.toMatchObject({ code: "PARENT_REQUIRED" });
    const kid = await registerIdentity(member(), { cpf: nextCpf(), birthDate: "2012-05-01", teenPath: "linked", parentEmail: "mae@prx.dev" }, NOW);
    expect(kid).toMatchObject({ accountType: "minor", status: "link_pending" });
  });

  it("16–17 precisa escolher o caminho; adulto entra como conta comum", async () => {
    await expect(registerIdentity(member(), { cpf: nextCpf(), birthDate: "2009-10-10" }, NOW)).rejects.toMatchObject({ code: "TEEN_PATH_REQUIRED" });
    const adult = await registerIdentity(member(), { cpf: nextCpf(), birthDate: "2000-01-01" }, NOW);
    expect(adult).toMatchObject({ accountType: "member", status: "active" });
  });

  it("CPF já cadastrado é recusado", async () => {
    const cpf = nextCpf();
    await registerIdentity(member(), { cpf, birthDate: "2000-01-01" }, NOW);
    await expect(registerIdentity(member(), { cpf, birthDate: "2001-01-01" }, NOW)).rejects.toMatchObject({ code: "CPF_TAKEN", status: 409 });
  });

  it("emancipação: documentos obrigatórios e aprovação vira conta comum", async () => {
    const teen = member();
    await registerIdentity(teen, { cpf: nextCpf(), birthDate: "2009-10-10", teenPath: "emancipated" }, NOW);
    await expect(submitEmancipation(teen, [{ kind: "emancipation_certificate", path: `${teen.id}/a.pdf`, name: "" }])).rejects.toThrow(/Documento com foto/);
    await expect(submitEmancipation(teen, [{ kind: "emancipation_certificate", path: `outro/a.pdf`, name: "" }])).rejects.toThrow(/inválido/);
    const req = await submitEmancipation(teen, [
      { kind: "emancipation_certificate", path: `${teen.id}/a.pdf`, name: "" },
      { kind: "id_document", path: `${teen.id}/b.jpg`, name: "" },
    ]);
    expect((await familyState(teen)).identity).toMatchObject({ accountType: "minor", status: "emancipation_pending" });
    await reviewEmancipation(req.id, "approve", "", "admin@prx.dev");
    expect((await familyState(teen)).identity).toMatchObject({ accountType: "member", status: "active" });
  });
});

describe("Conta Pai: aprovação, filhos, mesada e limites (memória + sandbox)", () => {
  beforeEach(() => {
    resetFamilyMemory();
    resetKycMemory();
  });

  async function approvedParent() {
    const { user } = await registerParent({ fullName: "Maria Responsável", email: `pai${uniq()}@prx.dev`, password: "Senha1234", cpf: nextCpf(), birthDate: "1985-03-10", phone: "11988887777" }, NOW);
    const parent = { id: user.id, email: user.email, fullName: user.fullName };
    await expect(createChildAccount(parent, { fullName: "Filho", email: `f${uniq()}@prx.dev`, password: "Senha1234", cpf: nextCpf(), birthDate: "2013-01-01", ...CONSENT }, IP, NOW)).rejects.toThrow(/análise/);
    await expect(
      submitParentApplication(
        parent,
        { ...TUTELA, profession: "Engenheira", incomeRange: "6k_10k", childName: "Filho", childBirthDate: "2013-01-01", documents: [{ kind: "rg", path: `${user.id}/rg.jpg`, name: "" }] },
        NOW
      )
    ).rejects.toThrow(/Faltam documentos/);
    const app = await submitParentApplication(
      parent,
      {
        ...TUTELA,
        profession: "Engenheira",
        incomeRange: "6k_10k",
        childName: "Filho",
        childBirthDate: "2013-01-01",
        documents: [
          { kind: "cnh", path: `${user.id}/cnh.jpg`, name: "" },
          { kind: "child_certificate", path: `${user.id}/cert.pdf`, name: "" },
        ],
      },
      NOW
    );
    await reviewParentApplication(app.id, "approve", "", "admin@prx.dev");
    return parent;
  }

  it("responsável menor de idade não abre Conta Pai; CPF único vale para pais também", async () => {
    const cpf = nextCpf();
    await expect(registerParent({ fullName: "Jovem", email: `j${uniq()}@prx.dev`, password: "Senha1234", cpf, birthDate: "2010-01-01", phone: "11988887777" }, NOW)).rejects.toThrow(/maiores de 18/);
    await registerParent({ fullName: "Maria", email: `a${uniq()}@prx.dev`, password: "Senha1234", cpf, birthDate: "1980-01-01", phone: "11988887777" }, NOW);
    await expect(registerParent({ fullName: "João", email: `b${uniq()}@prx.dev`, password: "Senha1234", cpf, birthDate: "1981-01-01", phone: "11988887777" }, NOW)).rejects.toMatchObject({ code: "CPF_TAKEN" });
  });

  it("cria a conta do filho, envia Pix, paga a mesada uma única vez e aplica limites", async () => {
    const parent = await approvedParent();
    const childCpf = nextCpf();
    const { child, link } = await createChildAccount(parent, { fullName: "Lucas Filho", email: `lucas${uniq()}@prx.dev`, password: "Senha1234", cpf: childCpf, birthDate: "2013-06-01", ...CONSENT }, IP, NOW);
    expect(link).toMatchObject({ status: "active", relationship: "mae", consentVersion: "2026-09-28" });
    expect(link.consentAt).toBeTruthy();

    const overview = await familyOverview(parent);
    expect(overview.children.map((c) => c.id)).toContain(child.id);
    expect(overview.children[0].limits).toEqual({ perTransaction: 100, daily: 150, monthly: 600 });

    // A Conta Pai não guarda dinheiro: sem conta sandbox própria.
    await expect(activateSandbox(parent.id)).rejects.toThrow(/Conta Pai não guarda dinheiro/);

    // Conta do filho ainda não ativa: o envio explica o motivo.
    await expect(sendToChild(parent, child.id, { amount: 20, note: "" })).rejects.toThrow(/ainda não foi ativada/);
    // Sem abertura de conta (KYC) aprovada, o PRX BANK não existe.
    await expect(activateSandbox(child.id)).rejects.toThrow(/Abra sua conta PRX BANK/);
    const childRef = { id: child.id, email: child.email, fullName: child.fullName };
    const kyc = await submitBankKyc(childRef, kycInput(child.id, childCpf, "2013-06-01", { minorPath: "linked", parentEmail: parent.email }), { ip: IP, userAgent: "vitest" }, NOW);
    expect(kyc.riskFlags).toContain("minor");
    expect(kyc).toMatchObject({ status: "approved", reviewedBy: "auto" });
    await activateSandbox(child.id);
    await sendToChild(parent, child.id, { amount: 25.5, note: "Lanche" });
    expect((await accountView(child.id)).balance).toBe(1025.5);

    const allowance = await setAllowance(parent, child.id, { amount: 40, frequency: "weekly", weekday: 5, monthDay: 5, active: true }, NOW);
    expect(allowance.nextRunAt).toBe("2026-10-02T12:00:00.000Z");
    expect(await runDueAllowances(new Date("2026-10-01T12:00:00Z"))).toBe(0);
    expect(await runDueAllowances(new Date("2026-10-02T12:05:00Z"))).toBe(1);
    expect(await runDueAllowances(new Date("2026-10-02T12:06:00Z"))).toBe(0);
    expect((await accountView(child.id)).balance).toBe(1065.5);
    expect((await getFamilyRepository().getAllowance(child.id))?.nextRunAt).toBe("2026-10-09T12:00:00.000Z");

    await setLimits(parent, child.id, { perTransaction: 30, daily: 50, monthly: 100 });
    const txs = (await accountView(child.id)).transactions;
    await expect(assertMinorSpend(child.id, 31, txs, NOW)).rejects.toThrow(/limite por compra/);
    await expect(assertMinorSpend(child.id, 30, [...txs, { id: "x", kind: "pix_out", direction: "out", amount: 30, counterparty: "", description: "", createdAt: NOW.toISOString() }], NOW)).rejects.toThrow(/limite diário/);
    await expect(assertMinorSpend(child.id, 20, txs, NOW)).resolves.toBeUndefined();

    const detail = await childDetail(parent, child.id);
    expect(detail.transactions.some((t) => t.description === "Mesada semanal")).toBe(true);
    expect(detail.transactions.some((t) => t.description === "Lanche")).toBe(true);
  });

  it("Conta Filho de 16–17: pedido pelo e-mail do responsável, liberado quando ele aceita", async () => {
    const parent = await approvedParent();
    const teen = { id: `usr_${uniq()}`, email: `t${uniq()}@prx.dev`, fullName: "Ana Jovem" };
    await registerIdentity(teen, { cpf: nextCpf(), birthDate: "2009-11-11", teenPath: "linked", parentEmail: parent.email }, NOW);
    expect((await familyState(teen)).identity?.status).toBe("link_pending");
    await expect(assertMinorSpend(teen.id, 10, [], NOW)).rejects.toThrow(/liberada pelo responsável/);

    const overview = await familyOverview(parent);
    expect(overview.pendingLinks).toHaveLength(1);
    await expect(respondLink(parent, overview.pendingLinks[0].id, "approve")).rejects.toThrow(/consentimento parental/);
    await respondLink(parent, overview.pendingLinks[0].id, "approve", CONSENT, IP);
    expect((await familyState(teen)).identity?.status).toBe("active");
    await expect(assertMinorSpend(teen.id, 10, [], NOW)).resolves.toBeUndefined();

    // Outro responsável não vê o filho.
    const other = await approvedParent();
    await expect(childDetail(other, teen.id)).rejects.toThrow(/não encontrado/);
  });
});

describe("abertura do PRX BANK (KYC bancário)", () => {
  beforeEach(() => {
    resetFamilyMemory();
    resetKycMemory();
  });
  const person = () => ({ id: `usr_${uniq()}`, email: `k${uniq()}@prx.dev`, fullName: "Pessoa Teste Silva" });

  it("exige frente e verso do documento, da própria pasta", async () => {
    const u = person();
    const cpf = nextCpf();
    await expect(submitBankKyc(u, kycInput(u.id, cpf, "2000-01-01", { documents: [{ kind: "id_front", path: `${u.id}/f.jpg`, name: "" }] }), { ip: IP, userAgent: "" }, NOW)).rejects.toThrow(/verso/);
    await expect(
      submitBankKyc(u, kycInput(u.id, cpf, "2000-01-01", { documents: [{ kind: "id_front", path: "outro/f.jpg", name: "" }, { kind: "id_back", path: `${u.id}/b.jpg`, name: "" }] }), { ip: IP, userAgent: "" }, NOW)
    ).rejects.toThrow(/inválido/);
  });

  it("aprova adulto, registra CPF único e trilha antifraude; recusa segundo pedido e CPF divergente", async () => {
    const u = person();
    const cpf = nextCpf();
    // Sem análise do PRX: aprovada na hora, os documentos seguem para o Asaas.
    const app = await submitBankKyc(u, kycInput(u.id, cpf, "2000-01-01", { pep: true }), { ip: IP, userAgent: "Mozilla/5.0" }, NOW);
    expect(app).toMatchObject({ status: "approved", reviewedBy: "auto", ip: IP, riskFlags: ["pep"] });
    await expect(submitBankKyc(u, kycInput(u.id, cpf, "2000-01-01"), { ip: IP, userAgent: "" }, NOW)).rejects.toThrow(/já foi aberta/);
    // Antes de a conta existir no banco parceiro, dá para trocar dados e documentos (ex.: fotos de teste), mas não o CPF.
    await expect(submitBankKyc(u, kycInput(u.id, nextCpf(), "2000-01-01"), { ip: IP, userAgent: "" }, NOW, { allowRedo: true })).rejects.toThrow(/CPF informado é diferente/);
    const redone = await submitBankKyc(u, kycInput(u.id, cpf, "2000-01-01"), { ip: IP, userAgent: "" }, NOW, { allowRedo: true });
    expect(redone).toMatchObject({ status: "approved", reviewedBy: "auto" });
    // O admin ainda pode recusar (ex.: fraude): o membro reenvia com os mesmos CPF e nascimento.
    await reviewBankKyc(redone.id, "reject", "Documento ilegível", "admin@prx.dev");
    await expect(submitBankKyc(u, kycInput(u.id, nextCpf(), "2000-01-01"), { ip: IP, userAgent: "" }, NOW)).rejects.toThrow(/CPF informado é diferente/);
    await expect(submitBankKyc(u, kycInput(u.id, cpf, "2000-01-01"), { ip: IP, userAgent: "" }, NOW)).resolves.toMatchObject({ status: "approved" });
    const other = person();
    await expect(submitBankKyc(other, kycInput(other.id, cpf, "2001-01-01"), { ip: IP, userAgent: "" }, NOW)).rejects.toMatchObject({ code: "CPF_TAKEN" });
  });

  it("menor só é aprovado depois do vínculo com consentimento parental", async () => {
    const { user } = await registerParent({ fullName: "Ana Responsável", email: `r${uniq()}@prx.dev`, password: "Senha1234", cpf: nextCpf(), birthDate: "1980-02-02", phone: "11988887777" }, NOW);
    const parent = { id: user.id, email: user.email, fullName: user.fullName };
    const app = await submitParentApplication(
      parent,
      { ...TUTELA, profession: "Médica", incomeRange: "10k_20k", childName: "Teen", childBirthDate: "2009-10-10", documents: [{ kind: "cnh", path: `${user.id}/c.jpg`, name: "" }, { kind: "child_certificate", path: `${user.id}/d.pdf`, name: "" }] },
      NOW
    );
    await reviewParentApplication(app.id, "approve", "", "admin@prx.dev");

    const teen = person();
    const kyc = await submitBankKyc(teen, kycInput(teen.id, nextCpf(), "2009-10-10", { minorPath: "linked", parentEmail: parent.email }), { ip: IP, userAgent: "" }, NOW);
    expect(kyc.status).toBe("pending");
    await expect(autoApproveBankKyc(teen.id)).resolves.toMatchObject({ status: "pending" });
    await expect(reviewBankKyc(kyc.id, "approve", "", "admin@prx.dev")).rejects.toThrow(/responsável aceitar o vínculo/);
    const link = (await familyOverview(parent)).pendingLinks[0];
    await respondLink(parent, link.id, "approve", CONSENT, IP);
    // Com o vínculo aceito, a abertura segue sozinha na próxima visita ao PRX BANK.
    await expect(autoApproveBankKyc(teen.id)).resolves.toMatchObject({ status: "approved", reviewedBy: "auto" });
  });

  it("menor emancipado tem a abertura aprovada na hora: a certidão segue para o banco parceiro, não para o PRX", async () => {
    const teen = person();
    const input = kycInput(teen.id, nextCpf(), "2009-10-10", {
      minorPath: "emancipated",
      documents: [
        { kind: "id_front", path: `${teen.id}/f.jpg`, name: "" },
        { kind: "id_back", path: `${teen.id}/b.jpg`, name: "" },
        { kind: "emancipation_certificate", path: `${teen.id}/e.pdf`, name: "" },
      ],
    });
    const app = await submitBankKyc(teen, input, { ip: IP, userAgent: "" }, NOW);
    expect(app).toMatchObject({ status: "approved", reviewedBy: "auto", minorPath: "emancipated", riskFlags: expect.arrayContaining(["minor", "emancipation"]) });
  });

  it("Conta Pai não abre conta bancária", async () => {
    const { user } = await registerParent({ fullName: "Pai Teste", email: `p${uniq()}@prx.dev`, password: "Senha1234", cpf: nextCpf(), birthDate: "1979-03-03", phone: "11988887777" }, NOW);
    const parent = { id: user.id, email: user.email, fullName: user.fullName };
    await expect(submitBankKyc(parent, kycInput(parent.id, nextCpf(), "1979-03-03"), { ip: IP, userAgent: "" }, NOW)).rejects.toThrow(/Conta Pai não guarda dinheiro/);
  });
});

describe("validação do KYC no servidor (zod)", () => {
  it("recusa CPF com dígito errado, DDD inexistente, nome sem sobrenome, nome da mãe igual e CEP inválido", async () => {
    const { bankKycSchema } = await import("@/lib/kyc/types");
    const base = kycInput("usr_x", "52998224725", "2000-01-01");
    expect(bankKycSchema.safeParse(base).success).toBe(true);
    expect(bankKycSchema.safeParse({ ...base, cpf: "529.982.247-26" }).success).toBe(false);
    expect(bankKycSchema.safeParse({ ...base, phone: "(10) 98888-7777" }).success).toBe(false);
    expect(bankKycSchema.safeParse({ ...base, phone: "(11) 8888-7777" }).success).toBe(false);
    expect(bankKycSchema.safeParse({ ...base, fullName: "Pessoa" }).success).toBe(false);
    expect(bankKycSchema.safeParse({ ...base, fullName: "Pessoa <script>" }).success).toBe(false);
    expect(bankKycSchema.safeParse({ ...base, motherName: "Pessoa Teste Silva" }).success).toBe(false);
    expect(bankKycSchema.safeParse({ ...base, address: { ...base.address, cep: "00000000" } }).success).toBe(false);
    expect(bankKycSchema.safeParse({ ...base, address: { ...base.address, state: "XX" } }).success).toBe(false);
    expect(bankKycSchema.safeParse({ ...base, termsAccepted: false }).success).toBe(false);
  });
});
