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

/**
 * A liberação do responsável legal (menores de 18 anos) vem em outra migração.
 * Sem ela, a venda para maiores de idade segue normal e a de menores é recusada
 * com este aviso, em vez de perder o registro da liberação.
 */
export const GUARDIAN_MIGRATION = "20261012_prx_guardian_consent.sql";
export const GUARDIAN_MIGRATION_HINT = `Falta aplicar a migração supabase/migrations/${GUARDIAN_MIGRATION} no Supabase para vender ingressos a menores de idade.`;

const columnCache = new Map<string, { at: number; ready: boolean }>();

/** true quando a coluna já existe no banco (cache de 1 min; memória: sempre true). Serve a migrações que só acrescentam uma coluna. */
export async function columnReady(table: string, column: string): Promise<boolean> {
  if (!supabaseAdmin) return true;
  const key = `${table}.${column}`;
  const hit = columnCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.ready;
  const { error } = await supabaseAdmin.from(table).select(column).limit(1);
  const missing = isMissingColumn(error);
  // Outro erro (rede): não marca como pronta nem guarda em cache.
  if (!missing && error) return false;
  columnCache.set(key, { at: Date.now(), ready: !missing });
  return !missing;
}

/** true quando live_tickets já tem a coluna guardian_consent (memória: sempre true). */
export const guardianSchemaReady = () => columnReady("live_tickets", "guardian_consent");

/**
 * O banner da Home é um Destaque de imagem (partner_reels.placement = 'home').
 * Sem a migração, o feed de vídeos segue igual e o admin recebe este aviso ao
 * tentar criar um banner.
 */
export const HOME_BANNER_MIGRATION = "20261012_prx_home_banner.sql";
export const HOME_BANNER_MIGRATION_HINT = `Falta aplicar a migração supabase/migrations/${HOME_BANNER_MIGRATION} no Supabase para publicar banners na Home.`;

/** true quando partner_reels já tem a coluna placement (memória: sempre true). */
export const homeBannerSchemaReady = () => columnReady("partner_reels", "placement");

/** true quando a tabela já existe (cache de 1 min; memória: sempre true). Serve aos módulos novos, um por migração. */
export async function tableReady(table: string): Promise<boolean> {
  if (!supabaseAdmin) return true;
  const key = `table:${table}`;
  const hit = columnCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.ready;
  const { error } = await supabaseAdmin.from(table).select("*", { head: true, count: "exact" }).limit(1);
  const missing = isMissingTable(error);
  if (!missing && error) return false;
  columnCache.set(key, { at: Date.now(), ready: !missing });
  return !missing;
}

/** 503 com o nome da migração que falta aplicar (em vez de quebrar a tela). */
export async function requireTable(table: string, migration: string): Promise<void> {
  if (!(await tableReady(table))) throw new PartnerError(`Falta aplicar a migração supabase/migrations/${migration} no Supabase.`, 503);
}

/** Só para testes. */
export function resetLaunchSchemaCache(): void {
  cached = null;
  columnCache.clear();
}
