// Hello World
import { ageOn } from "@/lib/family/age";

/**
 * Idade por evento e política legal para menores de 18 anos.
 * A idade mínima da conta PRX é 12 anos.
 * Quando o comprador é menor de idade (< 18 anos):
 * É obrigatório informar o e-mail do responsável legal, que recebe um link seguro
 * para assinar a liberação formal do filho(a) ao evento (conforme ECA - Lei 8.069/1990).
 * Evento classificado 18+ continua fechado para menores: nem a liberação do
 * responsável o abre. A liberação vale para eventos abaixo de 18.
 */

/** Faixas da classificação indicativa usadas no Brasil (0 = livre). */
export const AGE_OPTIONS = [0, 10, 12, 14, 16, 18] as const;

export function ageRatingLabel(minAge: number | null): string {
  if (minAge === null) return "Classificação a definir";
  if (minAge === 0) return "Livre";
  return `${minAge}+`;
}

export function ageRatingSentence(minAge: number | null): string {
  if (minAge === null) return "A classificação etária deste evento ainda não foi definida.";
  if (minAge === 0) return "Classificação livre.";
  if (minAge >= 18) return `Proibida a entrada de menores de ${minAge} anos.`;
  return `Classificação: ${minAge} anos (menores de 18 anos exigem liberação do responsável legal).`;
}

export function isMinorOn(birthDate: string, referenceDate: Date | string = new Date()): boolean {
  const ref = typeof referenceDate === "string" ? new Date(referenceDate) : referenceDate;
  return ageOn(birthDate, ref) < 18;
}

export type AgeCheck =
  | { ok: true; isMinor: boolean; requiresParentEmail: boolean }
  | { ok: false; code: "BIRTH_DATE_REQUIRED" | "UNDER_AGE"; reason: string };

/**
 * Avalia se o participante pode comprar o ingresso para o evento.
 * - Sem a data de nascimento não dá para saber se é menor: a data é pedida em qualquer evento.
 * - Menores de 12 anos não podem comprar.
 * - Menores de 18 anos (12 a 17 anos) podem adquirir ingressos mediante autorização
 *   expressa do responsável legal (que recebe o link para liberação formal), exceto em evento 18+.
 * - Maiores de 18 anos adquirem diretamente, respeitada a classificação mínima do evento.
 */
export function checkAgeEligibility(minAge: number | null, birthDate: string | null, eventStartsAt: string): AgeCheck {
  if (!birthDate) {
    return {
      ok: false,
      code: "BIRTH_DATE_REQUIRED",
      reason: minAge !== null && minAge > 0 ? `Este evento é ${ageRatingLabel(minAge)}. Confirme sua data de nascimento para continuar.` : "Confirme sua data de nascimento para continuar.",
    };
  }

  const age = ageOn(birthDate, new Date(eventStartsAt));
  if (age < 12) {
    return {
      ok: false,
      code: "UNDER_AGE",
      reason: "O ecossistema PRX é exclusivo para maiores de 12 anos.",
    };
  }

  if (age < 18) {
    // Evento 18+ não admite menor de idade, nem com a liberação do responsável.
    if (minAge !== null && minAge >= 18) {
      return {
        ok: false,
        code: "UNDER_AGE",
        reason: "Este evento é proibido para menores de 18 anos. Pela sua data de nascimento, a compra não pode ser concluída.",
      };
    }
    return { ok: true, isMinor: true, requiresParentEmail: true };
  }

  if (minAge !== null && minAge > 18 && age < minAge) {
    return {
      ok: false,
      code: "UNDER_AGE",
      reason: `Este evento é para maiores de ${minAge} anos. Pela sua data de nascimento, a compra não pode ser concluída.`,
    };
  }

  return { ok: true, isMinor: false, requiresParentEmail: false };
}
