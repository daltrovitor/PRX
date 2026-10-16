// Hello World
import { ADULT_AGE, EMANCIPATION_AGE, MAX_MEMBER_AGE, MIN_ACCOUNT_AGE, UNDER_AGE_MESSAGE, birthDateSchema, type AgeGroup, type AllowanceFrequency } from "@/lib/family/types";

const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Data de hoje em Brasília (AAAA-MM-DD) — aniversário conta a partir da meia-noite de Brasília. */
export function todayInBrasilia(now = new Date()): { y: number; m: number; d: number } {
  const local = new Date(now.getTime() - BRT_OFFSET_MS);
  return { y: local.getUTCFullYear(), m: local.getUTCMonth() + 1, d: local.getUTCDate() };
}

/** Idade completa em anos na data de hoje (Brasília). */
export function ageOn(birthDate: string, now = new Date()): number {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const { y, m, d } = todayInBrasilia(now);
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age -= 1;
  return age;
}

/** <12 sem conta · 12–15 só pela Conta Pai · 16–17 Conta Filho ou emancipação · 18–29 conta comum · 30+ fora do público do app. */
export function ageGroup(birthDate: string, now = new Date()): AgeGroup {
  const age = ageOn(birthDate, now);
  if (age < MIN_ACCOUNT_AGE) return "under";
  if (age < EMANCIPATION_AGE) return "child";
  if (age < ADULT_AGE) return "teen";
  if (age <= MAX_MEMBER_AGE) return "adult";
  return "over";
}

/** Data de nascimento de quem se cadastra: real, no passado e com a idade mínima da PRX (12 anos). */
export const signupBirthDateSchema = birthDateSchema.refine((value) => ageOn(value) >= MIN_ACCOUNT_AGE, UNDER_AGE_MESSAGE);

/**
 * Próxima execução da mesada, sempre às 09:00 de Brasília (12:00 UTC):
 * semanal no dia da semana escolhido; mensal no dia do mês (até 28, existe em todo mês).
 * Estritamente depois de `after`.
 */
export function nextAllowanceRun(frequency: AllowanceFrequency, weekday: number, monthDay: number, after: Date): Date {
  const RUN_HOUR_UTC = 12;
  const start = new Date(after.getTime());
  if (frequency === "weekly") {
    const candidate = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), RUN_HOUR_UTC));
    const brtDay = new Date(candidate.getTime() - BRT_OFFSET_MS).getUTCDay();
    let delta = (weekday - brtDay + 7) % 7;
    if (delta === 0 && candidate.getTime() <= after.getTime()) delta = 7;
    candidate.setUTCDate(candidate.getUTCDate() + delta);
    return candidate;
  }
  let candidate = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), monthDay, RUN_HOUR_UTC));
  if (candidate.getTime() <= after.getTime()) candidate = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, monthDay, RUN_HOUR_UTC));
  return candidate;
}

/** Chave do período de uma execução (evita pagar a mesma mesada duas vezes). */
export function allowancePeriodKey(runAt: Date): string {
  return runAt.toISOString().slice(0, 10);
}

/** CPF com máscara, para exibição: 123.456.789-09. */
export function formatCpf(digits: string): string {
  const d = digits.replace(/\D/g, "").padEnd(11, "•").slice(0, 11);
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** CPF parcialmente oculto (LGPD): ***.456.789-** */
export function maskCpf(digits: string): string {
  const d = digits.replace(/\D/g, "");
  if (d.length !== 11) return "***.***.***-**";
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}
