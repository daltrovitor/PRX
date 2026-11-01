// Hello World
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/client";
import { PartnerError, dbError } from "@/lib/partners/errors";
import { tableReady } from "@/lib/db-features";

/**
 * Pedidos de convite feitos pelo app: o membro escolhe um Insider no catálogo da
 * Resenha e pede autorização para comprar o ingresso. Um pedido por pessoa e
 * edição, para sempre: recusado, não dá para pedir a outro Insider na mesma edição.
 */

export const INVITE_REQUESTS_MIGRATION = "20261101_prx_resenha_pedidos_app.sql";

export type InviteRequestStatus = "pending" | "approved" | "rejected";

export interface InviteRequest {
  id: string;
  editionId: string;
  editionInsiderId: string;
  userId: string;
  memberName: string;
  memberCode: string;
  status: InviteRequestStatus;
  inviteId: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export type NewInviteRequest = Pick<InviteRequest, "editionId" | "editionInsiderId" | "userId" | "memberName" | "memberCode">;
type Filter = { editionId?: string; editionInsiderId?: string; userId?: string; status?: InviteRequestStatus };

type Row = Record<string, unknown>;
const STATUSES: readonly InviteRequestStatus[] = ["pending", "approved", "rejected"];
const mapRow = (r: Row): InviteRequest => ({
  id: String(r.id),
  editionId: String(r.edition_id),
  editionInsiderId: String(r.edition_insider_id),
  userId: String(r.user_id),
  memberName: String(r.member_name ?? ""),
  memberCode: String(r.member_code ?? ""),
  status: STATUSES.includes(r.status as InviteRequestStatus) ? (r.status as InviteRequestStatus) : "pending",
  inviteId: (r.invite_id as string | null) ?? null,
  createdAt: String(r.created_at),
  decidedAt: (r.decided_at as string | null) ?? null,
});

const memory = (): InviteRequest[] => ((globalThis as unknown as { __prxResenhaInviteRequests?: InviteRequest[] }).__prxResenhaInviteRequests ??= []);
const matches = (i: InviteRequest, f: Filter) =>
  (!f.editionId || i.editionId === f.editionId) && (!f.editionInsiderId || i.editionInsiderId === f.editionInsiderId) && (!f.userId || i.userId === f.userId) && (!f.status || i.status === f.status);

const ALREADY = "Você já pediu convite para esta Resenha. É um pedido por edição.";

/** Sem a migração, ninguém pede pelo app (o catálogo avisa) e o resto da Resenha segue igual. */
export async function inviteRequestsReady(): Promise<boolean> {
  return tableReady("resenha_invite_requests");
}

export async function listInviteRequests(filter: Filter): Promise<InviteRequest[]> {
  if (!supabaseAdmin) return structuredClone(memory().filter((i) => matches(i, filter)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  if (!(await inviteRequestsReady())) return [];
  let q = supabaseAdmin.from("resenha_invite_requests").select("*").order("created_at", { ascending: true });
  if (filter.editionId) q = q.eq("edition_id", filter.editionId);
  if (filter.editionInsiderId) q = q.eq("edition_insider_id", filter.editionInsiderId);
  if (filter.userId) q = q.eq("user_id", filter.userId);
  if (filter.status) q = q.eq("status", filter.status);
  const { data, error } = await q;
  if (error) throw dbError(error, "Não foi possível listar os pedidos");
  return ((data ?? []) as Row[]).map(mapRow);
}

export async function getInviteRequest(id: string): Promise<InviteRequest | null> {
  if (!supabaseAdmin) return structuredClone(memory().find((i) => i.id === id) ?? null);
  const { data, error } = await supabaseAdmin.from("resenha_invite_requests").select("*").eq("id", id).maybeSingle();
  if (error) return null;
  return data ? mapRow(data as Row) : null;
}

/** 409 se a pessoa já pediu nesta edição, a qualquer Insider (índice único no banco). */
export async function insertInviteRequest(request: NewInviteRequest): Promise<InviteRequest> {
  if (!supabaseAdmin) {
    if (memory().some((i) => i.editionId === request.editionId && i.userId === request.userId)) throw new PartnerError(ALREADY, 409);
    const row: InviteRequest = { ...request, id: crypto.randomUUID(), status: "pending", inviteId: null, createdAt: new Date().toISOString(), decidedAt: null };
    memory().push(row);
    return structuredClone(row);
  }
  if (!(await inviteRequestsReady())) throw new PartnerError(`Falta aplicar a migração supabase/migrations/${INVITE_REQUESTS_MIGRATION} no Supabase.`, 503);
  const { data, error } = await supabaseAdmin
    .from("resenha_invite_requests")
    .insert({ edition_id: request.editionId, edition_insider_id: request.editionInsiderId, user_id: request.userId, member_name: request.memberName, member_code: request.memberCode })
    .select("*")
    .single();
  if (error?.code === "23505") throw new PartnerError(ALREADY, 409);
  if (error) throw dbError(error, "Não foi possível registrar o pedido");
  return mapRow(data as Row);
}

/** Decide um pedido ainda pendente. null = já tinha sido decidido. */
export async function settleInviteRequest(id: string, status: Exclude<InviteRequestStatus, "pending">, by: string, inviteId: string | null = null): Promise<InviteRequest | null> {
  const at = new Date().toISOString();
  if (!supabaseAdmin) {
    const row = memory().find((i) => i.id === id && i.status === "pending");
    if (!row) return null;
    Object.assign(row, { status, inviteId, decidedAt: at });
    return structuredClone(row);
  }
  const { data, error } = await supabaseAdmin
    .from("resenha_invite_requests")
    .update({ status, invite_id: inviteId, decided_at: at, decided_by: by })
    .eq("id", id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (error?.code === "22P02") return null;
  if (error) throw dbError(error, "Não foi possível registrar a decisão");
  return data ? mapRow(data as Row) : null;
}

/** Só para testes. */
export function resetInviteRequestsMemory(): void {
  (globalThis as unknown as { __prxResenhaInviteRequests?: InviteRequest[] }).__prxResenhaInviteRequests = [];
}
