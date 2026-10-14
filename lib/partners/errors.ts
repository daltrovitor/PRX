// Hello World
import { TechnicalError } from "@/lib/error-messages";

/** Erro de regra de negócio do programa de parceiros, com o status HTTP adequado. */
export class PartnerError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 503 = 400
  ) {
    super(message);
    this.name = "PartnerError";
  }
}

const MISSING_TABLE_CODES = new Set(["PGRST205", "42P01"]);
const MISSING_COLUMN_CODES = new Set(["PGRST204", "42703"]);

export function isMissingTable(error: { code?: string } | null | undefined): boolean {
  return Boolean(error?.code && MISSING_TABLE_CODES.has(error.code));
}

export function isMissingColumn(error: { code?: string } | null | undefined): boolean {
  return Boolean(error?.code && MISSING_COLUMN_CODES.has(error.code));
}

export const MIGRATION_HINT =
  "Faltam tabelas no Supabase. Aplique as migrações de supabase/migrations (20260925_prx_partner_program.sql, 20260926_prx_live_staff_bank.sql, 20260927_prx_points_reels_finance.sql, 20260928_prx_family_passkeys.sql, 20260929_prx_bank_kyc_consent.sql, 20260930_prx_notifications.sql, 20261001_prx_admin_legal_checklist.sql, 20261001_prx_asaas_baas.sql e 20261005_prx_resenha.sql).";

/**
 * Converte erro do PostgREST em PartnerError. Tabela ausente vira 503 com a
 * instrução de migração; o detalhe técnico dos demais fica só no log do servidor.
 */
/**
 * Erro do banco de dados. Duplicidade (409) e tabela ausente (503, usado por
 * quem cai para a memória) seguem como PartnerError; o resto é técnico: a tela
 * mostra "Deu um erro ao fazer isso" com código e o motivo do banco vai para o
 * registro da ocorrência (antes ia para um console apagado no build).
 */
export function dbError(error: { code?: string; message?: string }, fallback: string): PartnerError | TechnicalError {
  if (isMissingTable(error)) return new PartnerError(MIGRATION_HINT, 503);
  if (error.code === "23505") return new PartnerError("Registro duplicado.", 409);
  return new TechnicalError(`${fallback} (banco ${error.code ?? "?"}: ${error.message ?? "sem mensagem"})`, 500);
}
