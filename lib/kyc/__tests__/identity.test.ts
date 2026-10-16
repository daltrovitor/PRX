// Hello World
import { beforeEach, describe, expect, it } from "vitest";
import { resetFamilyMemory } from "@/lib/family/repository";
import { getKycRepository, resetKycMemory } from "@/lib/kyc/repository";
import { submitBankKyc, reviewBankKyc } from "@/lib/kyc/service";
import { documentForReview, identityChecklist, purgeRejectedDocuments, requestResubmission, reviewDocument } from "@/lib/kyc/identity";
import { identityDetail, identityQueue } from "@/lib/kyc/identity-admin";
import { bankKycSchema, type BankKycInput } from "@/lib/kyc/types";

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

let seq = 900;
const member = (name = "Pessoa Teste Silva") => {
  seq += 1;
  return { id: `usr_id_${seq}`, email: `id${seq}@prx.dev`, fullName: name };
};

const input = (userId: string, doc: string, name = "Pessoa Teste Silva"): BankKycInput =>
  bankKycSchema.parse({
    fullName: name,
    cpf: doc,
    birthDate: "2001-03-04",
    phone: "11988887777",
    occupation: "Estudante",
    incomeRange: "ate_3k",
    pep: false,
    address: { cep: "01310100", street: "Avenida Paulista", number: "1000", complement: "", district: "Bela Vista", city: "São Paulo", state: "SP" },
    documents: [
      { kind: "id_front", path: `${userId}/f.jpg`, name: "" },
      { kind: "id_back", path: `${userId}/b.jpg`, name: "" },
      { kind: "selfie", path: `${userId}/s.jpg`, name: "" },
    ],
    termsAccepted: true,
  });

const meta = { ip: "203.0.113.9", userAgent: "vitest" };

beforeEach(() => {
  resetFamilyMemory();
  resetKycMemory();
});

describe("análise de identidade da PRX", () => {
  it("fila do admin: busca por nome ou CPF, filtro de reenvio e ficha sem caminho de arquivo", async () => {
    const ana = member("Ana Clara Souza");
    const bia = member("Beatriz Lima Rocha");
    const anaApp = await submitBankKyc(ana, input(ana.id, cpf("111444777"), "Ana Clara Souza"), meta);
    await submitBankKyc(bia, input(bia.id, cpf("222555888"), "Beatriz Lima Rocha"), meta);

    expect((await identityQueue("pending", "", 1, 20)).total).toBe(2);
    expect((await identityQueue("pending", "beatriz", 1, 20)).items.map((r) => r.fullName)).toEqual(["Beatriz Lima Rocha"]);
    expect((await identityQueue("pending", cpf("111444777").slice(0, 6), 1, 20)).items.map((r) => r.fullName)).toEqual(["Ana Clara Souza"]);
    // CPF mascarado na lista; na ficha, os arquivos só aparecem como tipo (o caminho nunca sai do servidor).
    expect((await identityQueue("pending", "ana", 1, 20)).items[0].cpfMasked).toMatch(/^\*\*\*\./);
    const detail = await identityDetail(anaApp.id);
    expect(JSON.stringify(detail)).not.toContain("/f.jpg");

    await reviewDocument(anaApp.id, "id_back", "reject", "Verso cortado", "admin@prx.dev");
    await requestResubmission(anaApp.id, "Mande de novo", "admin@prx.dev");
    expect((await identityQueue("resubmission", "", 1, 20)).items.map((r) => r.id)).toEqual([anaApp.id]);

    // Abrir um documento entra no histórico.
    await documentForReview(anaApp.id, "selfie", "admin@prx.dev");
    const actions = (await identityDetail(anaApp.id))!.events.map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["submitted", "document_rejected", "resubmission_requested", "document_viewed"]));
  });

  it("checklist: abertura aprovada antes da análise por documento conta como aprovada", () => {
    const items = identityChecklist({
      minorPath: null,
      status: "approved",
      reviewedBy: "auto",
      documentReviews: {},
      documents: [
        { kind: "id_front", path: "u/f.jpg", name: "" },
        { kind: "id_back", path: "u/b.jpg", name: "" },
      ],
    });
    expect(items.map((i) => [i.kind, i.status])).toEqual([
      ["id_front", "approved"],
      ["id_back", "approved"],
      ["selfie", "missing"],
    ]);
  });

  it("retenção: arquivos de abertura recusada há mais de 180 dias são apagados; a decisão fica", async () => {
    const u = member();
    const app = await submitBankKyc(u, input(u.id, cpf("333666999")), meta);
    await reviewBankKyc(app.id, "reject", "Documento de outra pessoa", "admin@prx.dev");
    // Ainda dentro do prazo: nada sai.
    expect(await purgeRejectedDocuments(new Date())).toEqual({ purged: 0 });
    const later = new Date(Date.now() + 181 * 86_400_000);
    expect(await purgeRejectedDocuments(later)).toEqual({ purged: 1 });
    const saved = await getKycRepository().get(app.id);
    expect(saved).toMatchObject({ status: "rejected", documents: [], reviewNote: "Documento de outra pessoa" });
    expect(saved?.documentsPurgedAt).not.toBeNull();
    await expect(documentForReview(app.id, "selfie", "admin@prx.dev")).rejects.toThrow(/não encontrado/);
  });
});
