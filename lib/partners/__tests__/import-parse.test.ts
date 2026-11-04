// Hello World
import { describe, expect, it } from "vitest";
import { draftIssues, parseBenefits, parseImport, parsePartner, suggestLabel } from "@/lib/partners/import-parse";

const PARTNER_TEXT = `Para darmos andamento ao seu cadastro como parceiro PRX, preciso que você me envie os dados abaixo:

Dados da empresa
• Nome fantasia CI GOIÂNIA
• Razão social MMC INTERCÂMBIO E TURISMO LTDA
• CNPJ 28784497000103

Quem assina o contrato
• Nome completo Marcelo Ferreira Carvalho
• CPF 04774640174
• Cargo Diretor
• E-mail marceloc@ci.com.br
• Telefone 62 39110100

Acesso ao Portal do Parceiro
• Qual e-mail você quer usar para fazer login: marceloc@ci.com.br`;

const BENEFITS_TEXT = `Travel Kit especial PRX: garrafa, almofada de pescoço ci + kit Ci padrão

Global cicle pra networking com outros clientes CI e Amaze que entrarem no programa e contato com o time da Austrália.



Welcome money: 250 reais convertido na moeda do país de destino via cartão pré pago ou wise.
Travel Kit especial PRX: garrafa, almofada de pescoço ci + kit Ci padrão
Lounge Aeroporto (1 acesso de Sala VIP) grátis ao comprar seguro viagem Ci
Departure club ao termos mais de 10 embarques no mesmo mês.
Global cicle pra networking com outros clientes CI e Amaze que entrarem no programa e contato com o time da Austrália.`;

describe("parsePartner", () => {
  it("lê o modelo de cadastro do parceiro", () => {
    const p = parsePartner(PARTNER_TEXT);
    expect(p.tradeName).toBe("CI GOIÂNIA");
    expect(p.legalName).toBe("MMC INTERCÂMBIO E TURISMO LTDA");
    expect(p.document).toBe("28.784.497/0001-03");
    expect(p.representative).toEqual({
      name: "Marcelo Ferreira Carvalho",
      document: "047.746.401-74",
      role: "Diretor",
      email: "marceloc@ci.com.br",
      phone: "62 39110100",
    });
    expect(p.loginEmail).toBe("marceloc@ci.com.br");
  });

  it("aceita dois-pontos, hífen e acentos soltos", () => {
    const p = parsePartner("- Nome fantasia: Café Central\n- Razao social - Central Ltda\n- CNPJ: 11.222.333/0001-81\n- Email: Dono@Central.com");
    expect(p.tradeName).toBe("Café Central");
    expect(p.legalName).toBe("Central Ltda");
    expect(p.document).toBe("11.222.333/0001-81");
    expect(p.representative.email).toBe("dono@central.com");
    expect(p.loginEmail).toBe("");
  });
});

describe("parseBenefits", () => {
  it("separa título e descrição, junta repetidas e mantém a ordem", () => {
    const list = parseBenefits(BENEFITS_TEXT);
    expect(list.map((b) => b.title)).toEqual([
      "Travel Kit especial PRX",
      "Global cicle",
      "Welcome money",
      "Lounge Aeroporto (1 acesso de Sala VIP) grátis ao comprar seguro viagem Ci",
      "Departure club ao termos mais de 10 embarques no mesmo mês.",
    ]);
    expect(list[0].description).toBe("Garrafa, almofada de pescoço ci + kit Ci padrão");
    expect(list[1].description).toMatch(/^Networking com outros clientes/);
    expect(list[2].description).toMatch(/^250 reais convertido/);
    expect(list.map((b) => b.key)).toEqual(["b0", "b1", "b2", "b3", "b4"]);
  });

  it("ignora linhas vazias, marcadores e títulos de seção", () => {
    const list = parseBenefits("Benefícios:\n\n• 10% de desconto no corte\n- Café grátis");
    expect(list.map((b) => b.title)).toEqual(["10% de desconto no corte", "Café grátis"]);
  });

  it("nunca passa do limite do servidor no título", () => {
    const [b] = parseBenefits("Uma oferta muito longa sem conector que continua e continua e continua até passar bastante do limite permitido");
    expect(b.title.length).toBeLessThanOrEqual(80);
    expect(b.description.length).toBeGreaterThan(b.title.length);
  });
});

describe("suggestLabel", () => {
  it("escolhe percentual, valor, grátis ou genérico", () => {
    expect(suggestLabel("25% de desconto")).toBe("25% OFF");
    expect(suggestLabel("250 reais convertido na moeda")).toBe("R$ 250");
    expect(suggestLabel("R$ 1.200,50.")).toBe("R$ 1.200,50");
    expect(suggestLabel("Sala VIP grátis")).toBe("Grátis");
    expect(suggestLabel("Kit de boas-vindas")).toBe("Exclusivo PRX");
  });

  it("cabe nos 24 caracteres do app", () => {
    expect(suggestLabel("R$ 99999999999999999999999999")).toHaveLength(24);
  });
});

describe("parseImport + draftIssues", () => {
  it("o exemplo completo vira rascunho válido na categoria Viagens", () => {
    const draft = parseImport(PARTNER_TEXT, BENEFITS_TEXT);
    expect(draft.categoryId).toBe("viagens");
    expect(draft.benefits).toHaveLength(5);
    expect(draft.benefits.map((b) => b.discountLabel)).toEqual(["Exclusivo PRX", "Exclusivo PRX", "R$ 250", "Grátis", "Exclusivo PRX"]);
    expect(draftIssues(draft)).toEqual([]);
  });

  it("aponta o que falta ou está inválido", () => {
    const draft = parseImport("Nome fantasia X\nCNPJ 11111111111111", "");
    const issues = draftIssues(draft);
    expect(issues).toContain("Informe a razão social.");
    expect(issues).toContain("CNPJ ou CPF inválido.");
    expect(issues).toContain("Escolha a categoria.");
  });
});
