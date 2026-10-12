// Hello World
import { planRank } from "@/lib/partners/plans";
import type { Benefit } from "@/lib/pass-data";

/**
 * Quem aparece no banner de parceiro em destaque da Home. Vence o maior plano de
 * visibilidade da campanha (Takeover > Prime > Spotlight, ver lib/partners/plans.ts);
 * empatado, vale a ordem do catálogo. Enquanto ninguém contrata destaque, sai o
 * primeiro benefício do catálogo, para a vitrine rodar. Para vender o banner só
 * a plano pago, troque o `planRank` abaixo por um filtro `isPaidPlan`.
 *
 * O catálogo (/api/pass/data) já entrega só campanhas na vigência e de parceiros
 * ativos, então aqui não se filtra de novo.
 */
export function pickFeaturedBenefit(benefits: ReadonlyArray<Benefit>): Benefit | null {
  let best: Benefit | null = null;
  for (const benefit of benefits) {
    if (!best || planRank(benefit.visibilityPlan) > planRank(best.visibilityPlan)) best = benefit;
  }
  return best;
}
