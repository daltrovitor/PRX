// Hello World
import { ageOn } from "@/lib/family/age";

/**
 * Idade por evento (função pura). A idade mínima para usar o PRX (12 anos) é
 * uma regra da conta; a de cada evento é outra, definida pelo admin no evento
 * e conferida no servidor na compra e, com documento, na portaria.
 * Não há exceção: quem não tem a idade do evento não compra, nem com cupom,
 * convite ou acompanhante (essa possibilidade depende de parecer jurídico).
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
  return `Proibida a entrada de menores de ${minAge} anos.`;
}

export type AgeCheck =
  | { ok: true }
  | { ok: false; code: "BIRTH_DATE_REQUIRED" | "UNDER_AGE"; reason: string };

/**
 * A pessoa terá a idade mínima no dia do evento (horário de Brasília)?
 * minAge null = evento antigo sem a regra: não restringe (a prontidão do
 * evento aponta a pendência e impede publicar eventos novos assim).
 */
export function checkAgeEligibility(minAge: number | null, birthDate: string | null, eventStartsAt: string): AgeCheck {
  if (minAge === null || minAge === 0) return { ok: true };
  if (!birthDate) {
    return { ok: false, code: "BIRTH_DATE_REQUIRED", reason: `Este evento é para maiores de ${minAge} anos. Confirme sua data de nascimento para continuar.` };
  }
  const age = ageOn(birthDate, new Date(eventStartsAt));
  if (age < minAge) {
    return { ok: false, code: "UNDER_AGE", reason: `Este evento é proibido para menores de ${minAge} anos. Pela sua data de nascimento, a compra não pode ser concluída.` };
  }
  return { ok: true };
}
