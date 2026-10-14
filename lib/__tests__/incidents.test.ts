// Hello World
import { describe, expect, it } from "vitest";
import { areaOf, findIncident, incidentCode, reportIncident } from "@/lib/incidents";
import { errorResponse } from "@/lib/partners/http";
import { familyErrorResponse } from "@/lib/family/http";
import { PartnerError } from "@/lib/partners/errors";
import { FamilyError } from "@/lib/family/service";
import { TechnicalError, technicalErrorMessage } from "@/lib/error-messages";
import { reportClientIncident } from "@/lib/client-errors";

const CODE = /^[A-Z]{3}-[2-9A-HJ-NP-Z]{6}$/;

describe("códigos de erro técnico", () => {
  it("código curto, fácil de ditar, com a área da rota", () => {
    expect(incidentCode("BNK")).toMatch(CODE);
    expect(areaOf("/api/bank/accounts/documents")).toBe("BNK");
    expect(areaOf("/api/auth/login")).toBe("AUT");
    expect(areaOf("/qualquer")).toBe("PRX");
    expect(areaOf(null)).toBe("PRX");
  });

  it("a frase da tela tem só o código; o motivo fica no registro, sem dados pessoais", async () => {
    const { code, message } = await reportIncident(new Error("CPF 529.982.247-25 recusado com $aact_prod_segredo"), "Enviar documento", { path: "/api/bank/accounts/documents" });
    expect(code).toMatch(/^BNK-/);
    expect(message).toBe(technicalErrorMessage(code));
    expect(message).toBe(`Deu um erro ao fazer isso. Fale com o suporte e informe o código ${code}.`);
    const stored = await findIncident(code.toLowerCase());
    expect(stored).toMatchObject({ code, action: "Enviar documento", path: "/api/bank/accounts/documents", status: 500 });
    expect(stored?.detail).not.toContain("529.982.247-25");
    expect(stored?.detail).not.toContain("$aact_prod_segredo");
    await expect(findIncident("nada")).resolves.toBeNull();
  });
});

describe("respostas de erro das rotas", () => {
  const read = async (res: Response) => ({ status: res.status, body: (await res.json()) as { error: string; code?: string | null } });

  it("erro que a pessoa resolve: a frase simples do próprio erro", async () => {
    await expect(read(await errorResponse(new PartnerError("Saldo insuficiente para esta operação.", 422), "Enviar Pix"))).resolves.toEqual({
      status: 422,
      body: { error: "Saldo insuficiente para esta operação." },
    });
    await expect(read(await familyErrorResponse(new FamilyError("Este CPF já está cadastrado no PRX.", 409, "CPF_TAKEN"), "Abrir conta"))).resolves.toEqual({
      status: 409,
      body: { error: "Este CPF já está cadastrado no PRX.", code: "CPF_TAKEN" },
    });
  });

  it("erro técnico: \"Deu um erro ao fazer isso\" com código, nunca o motivo", async () => {
    for (const [error, status] of [
      [new Error("relation \"bank_x\" does not exist"), 500],
      [new PartnerError("A ativação de contas ainda não está disponível neste ambiente.", 503), 503],
      [new TechnicalError("Asaas 400 invalid_action: Esse tipo de documento não pode ser enviado via API.", 502), 502],
      [new TechnicalError("Corpo da requisição não é JSON válido.", 400), 400],
    ] as const) {
      const { status: got, body } = await read(await errorResponse(error, "Ação qualquer"));
      expect(got).toBe(status);
      expect(body.code).toMatch(CODE);
      expect(body.error).toBe(technicalErrorMessage(body.code!));
      expect(body.error).not.toContain(error.message);
    }
  });
});

describe("erros que só o navegador vê", () => {
  it("usa o código do registro; sem registro, o identificador da chamada na Vercel", async () => {
    const ok = (async () => new Response(JSON.stringify({ error: technicalErrorMessage("BNK-ABCDEF") }), { status: 200 })) as unknown as typeof fetch;
    await expect(reportClientIncident({ kind: "request", path: "/api/bank", status: 504 }, ok)).resolves.toBe(technicalErrorMessage("BNK-ABCDEF"));
    const down = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    await expect(reportClientIncident({ kind: "request", path: "/api/bank", status: 504, requestId: "gru1::iad1::2txq5-1791921659856-df65a922e300" }, down)).resolves.toBe(
      technicalErrorMessage("REQ-A922E300")
    );
  });
});
