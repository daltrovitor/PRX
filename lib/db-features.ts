// Hello World
import { supabaseAdmin } from "@/lib/supabase/client";
import { PartnerError, isMissingColumn, isMissingTable } from "@/lib/partners/errors";

/**
 * O código vai para produção antes de a migração ser aplicada no Supabase.
 * Este módulo descobre (uma vez a cada minuto por instância) se a migração do
 * lançamento já está no banco, para as consultas antigas continuarem funcionando
 * e as telas novas avisarem que falta aplicá-la, em vez de quebrar.
 */

export const LAUNCH_MIGRATION = "20261011_prx_launch.sql";
export const LAUNCH_MIGRATION_HINT = `Falta aplicar a migração supabase/migrations/${LAUNCH_MIGRATION} no Supabase.`;

const TTL_MS = 60_000;
let cached: { at: number; ready: boolean } | null = null;

/** true quando o banco já tem as colunas e tabelas do lançamento (memória: sempre true). */
export async function launchSchemaReady(): Promise<boolean> {
  if (!supabaseAdmin) return true;
  if (cached && Date.now() - cached.at < TTL_MS) return cached.ready;
  const [column, table] = await Promise.all([
    supabaseAdmin.from("live_tickets").select("is_test").limit(1),
    supabaseAdmin.from("validation_log").select("id").limit(1),
  ]);
  const missing = isMissingColumn(column.error) || isMissingTable(table.error);
  // Outro erro (rede): não marca como pronta nem guarda em cache.
  if (!missing && (column.error || table.error)) return false;
  cached = { at: Date.now(), ready: !missing };
  return cached.ready;
}

/** Para recursos que só existem com a migração: 503 com a orientação. */
export async function requireLaunchSchema(): Promise<void> {
  if (!(await launchSchemaReady())) throw new PartnerError(LAUNCH_MIGRATION_HINT, 503);
}

/** Só para testes. */
export function resetLaunchSchemaCache(): void {
  cached = null;
}
