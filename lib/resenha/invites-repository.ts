// Hello World
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/client";
import { PartnerError, dbError } from "@/lib/partners/errors";
import { tableReady } from "@/lib/db-features";
import { getResenhaRepository } from "@/lib/resenha/repository";

/**
 * Convites da Resenha para membros do app: o Insider escolhe a pessoa (nome ou
 * ID PRX) e a Resenha passa a aparecer no app dela, que compra o ingresso no
 * PRX LIVE. Cada convite ativo ocupa um PASS da cota do Insider.
 */

export const INVITES_MIGRATION = "20261019_prx_resenha_convites_push.sql";

export type InviteStatus = "invited" | "revoked";

export interface MemberInvite {
  id: string;
  editionId: string;
  editionInsiderId: string;
  userId: string;
  memberName: string;
  memberCode: string;
  status: InviteStatus;
  createdAt: string;
  revokedAt: string | null;
}

export type NewInvite = Pick<MemberInvite, "editionId" | "editionInsiderId" | "userId" | "memberName" | "memberCode">;
type Filter = { editionId?: string; editionInsiderId?: string; userId?: string; status?: InviteStatus };

type Row = Record<string, unknown>;
const mapRow = (r: Row): MemberInvite => ({
  id: String(r.id),
  editionId: String(r.edition_id),
  editionInsiderId: String(r.edition_insider_id),
  userId: String(r.user_id),
  memberName: String(r.member_name ?? ""),
  memberCode: String(r.member_code ?? ""),
  status: r.status === "revoked" ? "revoked" : "invited",
  createdAt: String(r.created_at),
  revokedAt: (r.revoked_at as string | null) ?? null,
});

const memory = (): MemberInvite[] => ((globalThis as unknown as { __prxResenhaInvites?: MemberInvite[] }).__prxResenhaInvites ??= []);
const matches = (i: MemberInvite, f: Filter) =>
  (!f.editionId || i.editionId === f.editionId) && (!f.editionInsiderId || i.editionInsiderId === f.editionInsiderId) && (!f.userId || i.userId === f.userId) && (!f.status || i.status === f.status);

/** Sem a migração, a lista é vazia (o app segue igual e o Insider recebe o aviso ao convidar). */
export async function invitesReady(): Promise<boolean> {
  return tableReady("resenha_member_invites");
}

export async function listInvites(filter: Filter): Promise<MemberInvite[]> {
  if (!supabaseAdmin) return structuredClone(memory().filter((i) => matches(i, filter)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  if (!(await invitesReady())) return [];
  let q = supabaseAdmin.from("resenha_member_invites").select("*").order("created_at", { ascending: true });
  if (filter.editionId) q = q.eq("edition_id", filter.editionId);
  if (filter.editionInsiderId) q = q.eq("edition_insider_id", filter.editionInsiderId);
  if (filter.userId) q = q.eq("user_id", filter.userId);
  if (filter.status) q = q.eq("status", filter.status);
  const { data, error } = await q;
  if (error) throw dbError(error, "Não foi possível listar os convites");
  return ((data ?? []) as Row[]).map(mapRow);
}

/** 409 se a pessoa já tem convite ativo nesta edição (índice único no banco). */
export async function insertInvite(invite: NewInvite): Promise<MemberInvite> {
  if (!supabaseAdmin) {
    if (memory().some((i) => i.editionId === invite.editionId && i.userId === invite.userId && i.status === "invited")) throw new PartnerError("Esta pessoa já foi convidada para esta Resenha.", 409);
    const row: MemberInvite = { ...invite, id: crypto.randomUUID(), status: "invited", createdAt: new Date().toISOString(), revokedAt: null };
    memory().push(row);
    return structuredClone(row);
  }
  if (!(await invitesReady())) throw new PartnerError(`Falta aplicar a migração supabase/migrations/${INVITES_MIGRATION} no Supabase.`, 503);
  const { data, error } = await supabaseAdmin
    .from("resenha_member_invites")
    .insert({ edition_id: invite.editionId, edition_insider_id: invite.editionInsiderId, user_id: invite.userId, member_name: invite.memberName, member_code: invite.memberCode })
    .select("*")
    .single();
  if (error?.code === "23505") throw new PartnerError("Esta pessoa já foi convidada para esta Resenha.", 409);
  if (error) throw dbError(error, "Não foi possível registrar o convite");
  return mapRow(data as Row);
}

/** Cancela um convite ainda ativo (devolve o PASS). null = já tinha sido cancelado. */
export async function revokeInvite(id: string, by: string): Promise<MemberInvite | null> {
  const at = new Date().toISOString();
  if (!supabaseAdmin) {
    const row = memory().find((i) => i.id === id && i.status === "invited");
    if (!row) return null;
    Object.assign(row, { status: "revoked", revokedAt: at });
    return structuredClone(row);
  }
  const { data, error } = await supabaseAdmin
    .from("resenha_member_invites")
    .update({ status: "revoked", revoked_at: at, revoked_by: by })
    .eq("id", id)
    .eq("status", "invited")
    .select("*")
    .maybeSingle();
  if (error?.code === "22P02") return null;
  if (error) throw dbError(error, "Não foi possível cancelar o convite");
  return data ? mapRow(data as Row) : null;
}

export async function getInvite(id: string): Promise<MemberInvite | null> {
  if (!supabaseAdmin) return structuredClone(memory().find((i) => i.id === id) ?? null);
  const { data, error } = await supabaseAdmin.from("resenha_member_invites").select("*").eq("id", id).maybeSingle();
  if (error) return null;
  return data ? mapRow(data as Row) : null;
}

/** O membro foi convidado (convite ativo) para a Resenha deste evento? Libera a compra no PRX LIVE. */
export async function hasActiveInvite(userId: string, eventId: string): Promise<boolean> {
  const edition = (await getResenhaRepository().listEditions()).find((e) => e.eventId === eventId);
  if (!edition) return false;
  return (await listInvites({ editionId: edition.id, userId, status: "invited" })).length > 0;
}

/** Só para testes. */
export function resetInvitesMemory(): void {
  (globalThis as unknown as { __prxResenhaInvites?: MemberInvite[] }).__prxResenhaInvites = [];
}
