// Hello World
import { describe, expect, it } from "vitest";
import { BADGES, BADGE_CODES, BADGE_LIST, MAX_BADGES_PER_ITEM, badgesSchema, mergeBadges, normalizeBadges } from "@/lib/badges/catalog";
import { partnerInputSchema } from "@/lib/partners/types";

describe("catálogo de selos", () => {
  it("tem os 20 selos, com 10 base", () => {
    expect(BADGE_CODES).toHaveLength(20);
    expect(BADGE_LIST.filter((b) => b.tier === "base").map((b) => b.name)).toEqual([
      "GREEN FLAG",
      "WELL MODE",
      "PAGE UP",
      "IRL",
      "MONEYWISE",
      "A+",
      "FIT CHECK",
      "MOVE",
      "BUILDER",
      "GOOD HUMAN",
    ]);
    for (const code of BADGE_CODES) expect(BADGES[code].code).toBe(code);
  });

  it("valida códigos, tira repetidos, ordena pelo catálogo e respeita o limite", () => {
    expect(badgesSchema.parse(["green_flag", "fit_check", "green_flag"])).toEqual(["green_flag", "fit_check"]);
    expect(badgesSchema.safeParse(["selo_inventado"]).success).toBe(false);
    expect(badgesSchema.safeParse(BADGE_CODES.slice(0, MAX_BADGES_PER_ITEM + 1)).success).toBe(false);
  });

  it("valor do banco ignora códigos desconhecidos; benefício soma os selos do parceiro", () => {
    expect(normalizeBadges(["irl", "x", 3, "move"])).toEqual(["irl", "move"]);
    expect(normalizeBadges(null)).toEqual([]);
    expect(mergeBadges(["green_flag"], ["fit_check", "green_flag"], undefined)).toEqual(["green_flag", "fit_check"]);
  });

  it("cadastro de parceiro aceita selos (padrão: nenhum)", () => {
    const base = { tradeName: "Osklen", legalName: "Osklen Ltda", document: "11.222.333/0001-81", categoryId: "moda", location: "Goiânia, GO" };
    expect(partnerInputSchema.parse(base).badges).toEqual([]);
    expect(partnerInputSchema.parse({ ...base, badges: ["fit_check", "green_flag"] }).badges).toEqual(["green_flag", "fit_check"]);
  });
});
