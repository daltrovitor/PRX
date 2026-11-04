// Hello World
import { PartnerError } from "@/lib/partners/errors";
import { brl } from "@/lib/bank/messages";

/**
 * Limite de Pix no período noturno (Res. BCB 142/2021): entre 20h e 6h,
 * horário de Brasília, pessoa física movimenta até R$ 1.000 somados no período.
 * Limites de menores (Conta Família) são aplicados à parte, por assertMinorSpend.
 */

export const NIGHT_PIX_LIMIT = 1000;
const NIGHT_START_HOUR = 20;
const NIGHT_END_HOUR = 6;
/** Brasília não tem horário de verão desde 2019: UTC−3 fixo. */
const BRT_OFFSET_HOURS = -3;

/** Início do período noturno em curso (ISO), ou null durante o dia. */
export function nightWindowStart(now: Date): string | null {
  const local = new Date(now.getTime() + BRT_OFFSET_HOURS * 3_600_000);
  const hour = local.getUTCHours();
  if (hour >= NIGHT_END_HOUR && hour < NIGHT_START_HOUR) return null;
  const start = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), NIGHT_START_HOUR - BRT_OFFSET_HOURS));
  // De madrugada, o período começou às 20h do dia anterior.
  if (hour < NIGHT_END_HOUR) start.setUTCDate(start.getUTCDate() - 1);
  return start.toISOString();
}

/** Recusa o Pix que passaria do limite noturno, somando o que já saiu no período. */
export async function assertNightLimit(amount: number, now: Date, spentSince: (sinceIso: string) => Promise<number>): Promise<void> {
  const since = nightWindowStart(now);
  if (!since) return;
  const spent = await spentSince(since);
  if (spent + amount > NIGHT_PIX_LIMIT) {
    const left = Math.max(0, Math.round((NIGHT_PIX_LIMIT - spent) * 100) / 100);
    throw new PartnerError(`Entre 20h e 6h o limite de Pix é ${brl(NIGHT_PIX_LIMIT)} por noite (exigência do Banco Central). Disponível agora: ${brl(left)}.`, 403);
  }
}
