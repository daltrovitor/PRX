import { describe, expect, it } from "vitest";
import { partnerInputSchema } from "@/lib/partners/types";

describe("cadastro mínimo de parceiro", () => {
  it("aceita somente o nome e normaliza os campos ausentes", () => {
    const result = partnerInputSchema.parse({ tradeName: "Marca nova" });
    expect(result.document).toBe("");
    expect(result.legalName).toBe("");
    expect(result.categoryId).toBe("");
    expect(result.location).toBe("");
    expect(result.representative.email).toBe("");
  });

  it("aceita os campos opcionais vazios enviados pelo formulário", () => {
    expect(partnerInputSchema.safeParse({ tradeName: "Marca nova", legalName: "", document: "", categoryId: "", location: "" }).success).toBe(true);
  });

  it("ainda exige nome e valida documento e e-mail quando preenchidos", () => {
    expect(partnerInputSchema.safeParse({ tradeName: " " }).success).toBe(false);
    expect(partnerInputSchema.safeParse({ tradeName: "Marca", document: "11111111111" }).success).toBe(false);
    expect(partnerInputSchema.safeParse({ tradeName: "Marca", representative: { email: "errado" } }).success).toBe(false);
    expect(partnerInputSchema.safeParse({ tradeName: "Marca", document: "52998224725" }).success).toBe(true);
  });
});
