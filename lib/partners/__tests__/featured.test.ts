// Hello World
import { describe, expect, it } from "vitest";
import { pickFeaturedBenefit } from "@/lib/partners/featured";
import type { Benefit } from "@/lib/pass-data";
import type { VisibilityPlan } from "@/lib/partners/plans";

function benefit(id: string, visibilityPlan?: VisibilityPlan): Benefit {
  return {
    id,
    partnerId: `partner-${id}`,
    partnerName: `Parceiro ${id}`,
    partnerLogo: "",
    partnerBanner: "",
    partnerLocation: "São Paulo",
    categoryId: "food",
    title: `Oferta ${id}`,
    description: "",
    discountLabel: "10% OFF",
    minPrxLevel: 1,
    terms: [],
    visibilityPlan,
    sponsored: visibilityPlan !== undefined && visibilityPlan !== "basico",
  };
}

describe("parceiro em destaque na Home", () => {
  it("catálogo vazio não tem destaque", () => {
    expect(pickFeaturedBenefit([])).toBeNull();
  });

  it("sem plano pago, sai o primeiro benefício do catálogo", () => {
    const featured = pickFeaturedBenefit([benefit("a"), benefit("b", "basico"), benefit("c")]);
    expect(featured?.id).toBe("a");
  });

  it("o plano de visibilidade mais alto vence, mesmo vindo depois na lista", () => {
    const featured = pickFeaturedBenefit([benefit("a", "basico"), benefit("b", "spotlight"), benefit("c", "takeover"), benefit("d", "prime")]);
    expect(featured?.id).toBe("c");
  });

  it("empate no mesmo plano mantém a ordem do catálogo", () => {
    const featured = pickFeaturedBenefit([benefit("a", "prime"), benefit("b", "prime")]);
    expect(featured?.id).toBe("a");
  });
});
