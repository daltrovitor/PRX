// Hello World
import { cn } from "@/lib/utils";

/** Limite noturno de Pix (Res. BCB 142/2021), aplicado no servidor em lib/bank/limits.ts. */
export const NIGHT_LIMIT_HINT = "Entre 20h e 6h (horário de Brasília), o Pix tem limite de R$ 1.000 por noite, regra do Banco Central.";

export function ProviderDisclosure({ className }: { className?: string }) {
  return null;
}
