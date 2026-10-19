// Hello World
import { columnReady } from "@/lib/db-features";
import { PartnerError } from "@/lib/partners/errors";
import { BADGES_MIGRATION } from "@/lib/badges/catalog";

export const BADGES_MIGRATION_HINT = `Falta aplicar a migração supabase/migrations/${BADGES_MIGRATION} no Supabase para salvar selos.`;

/**
 * Antes da migração dos selos, benefícios e parceiros continuam sendo salvos:
 * lista vazia sai da gravação; com selo escolhido, o admin recebe o aviso.
 */
export async function prepareBadgesWrite(table: "benefits" | "partners", row: Record<string, unknown>): Promise<void> {
  if (!("badges" in row) || (await columnReady(table, "badges"))) return;
  if (Array.isArray(row.badges) && row.badges.length > 0) throw new PartnerError(BADGES_MIGRATION_HINT, 503);
  delete row.badges;
}
