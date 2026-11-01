// Hello World
import { PartnerError } from "@/lib/partners/errors";
import { getLiveRepository } from "@/lib/live/repository";
import { ticketsWithExpiry, toPublicEvent, type PublicEvent } from "@/lib/live/service";
import type { LiveEvent } from "@/lib/live/types";
import { findMemberById } from "@/lib/members/member-code";
import { sendPushToUser } from "@/lib/push/send";
import { getResenhaRepository } from "@/lib/resenha/repository";
import { listInvites } from "@/lib/resenha/invites-repository";
import { inviteMember, ownParticipation, passesUsed } from "@/lib/resenha/invites";
import { getInviteRequest, insertInviteRequest, inviteRequestsReady, listInviteRequests, settleInviteRequest, type InviteRequest, type InviteRequestStatus } from "@/lib/resenha/invite-requests-repository";
import { MIN_AGE, ageAt, editionHeadline, editionTitle, type Insider, type InsiderKind, type ResenhaEdition } from "@/lib/resenha/types";

/**
 * Pedido de convite pelo app. Na aba Resenha, quem ainda não foi convidado vê o
 * catálogo de Insiders da edição, escolhe um e pede autorização para comprar o
 * ingresso. O Insider aprova (vira convite: ocupa um PASS e libera a compra) ou
 * recusa. Um pedido por pessoa e edição: recusado, não pede a outro Insider.
 */

const repo = () => getResenhaRepository();
const live = () => getLiveRepository();

export interface CatalogInsider {
  participationId: string;
  name: string;
  kind: InsiderKind;
  avatarUrl: string;
  /** Ainda tem PASS para liberar. */
  available: boolean;
}

/** "cancelled": aprovado, mas o Insider cancelou o convite depois. */
export type CatalogRequestState = "pending" | "rejected" | "cancelled";

export interface ResenhaCatalogEntry {
  editionId: string;
  slug: string;
  title: string;
  headline: string;
  event: PublicEvent;
  insiders: CatalogInsider[];
  request: { status: CatalogRequestState; insiderName: string; createdAt: string } | null;
}

export interface MemberResenhaCatalog {
  entries: ResenhaCatalogEntry[];
  /** Menor de idade: a Resenha é 18+, sem catálogo. */
  minor: boolean;
}

export interface InsiderInviteRequestView {
  id: string;
  memberName: string;
  memberCode: string;
  avatarUrl: string;
  status: InviteRequestStatus;
  createdAt: string;
  decidedAt: string | null;
}

const started = (event: LiveEvent) => new Date(event.startsAt).getTime() <= Date.now();

/** Edição aceitando pedidos: lista aberta, evento publicado e ainda não começou. */
async function openEdition(edition: ResenhaEdition | null): Promise<{ edition: ResenhaEdition; event: LiveEvent } | null> {
  if (!edition || edition.status !== "open") return null;
  const event = await live().getEvent(edition.eventId);
  if (!event || event.status === "draft" || event.status === "cancelled" || started(event)) return null;
  return { edition, event };
}

async function catalogInsiders(editionId: string, exceptUserId: string): Promise<CatalogInsider[] | null> {
  const insiders: CatalogInsider[] = [];
  for (const participation of await repo().listParticipations({ editionId })) {
    if (!participation.active) continue;
    const insider = await repo().getInsider(participation.insiderId);
    if (!insider?.active) continue;
    // Insider desta edição não pede convite: ele já está na Resenha.
    if (insider.userId === exceptUserId) return null;
    const [profile, used] = await Promise.all([findMemberById(insider.userId), passesUsed(participation.id)]);
    insiders.push({ participationId: participation.id, name: insider.name, kind: participation.kind, avatarUrl: profile?.avatarUrl ?? "", available: used.approved + used.invited < participation.quota });
  }
  return insiders.sort((a, b) => Number(b.available) - Number(a.available) || a.name.localeCompare(b.name, "pt-BR"));
}

async function insiderNameOf(participationId: string): Promise<string> {
  const participation = await repo().getParticipation(participationId);
  const insider = participation ? await repo().getInsider(participation.insiderId) : null;
  return insider?.name ?? "Insider";
}

/** Resenhas abertas em que o membro ainda não tem convite, com os Insiders para pedir. */
export async function memberResenhaCatalog(userId: string): Promise<MemberResenhaCatalog> {
  // Sem a migração não dá para registrar pedidos: o catálogo nem aparece.
  if (!(await inviteRequestsReady())) return { entries: [], minor: false };
  const member = await findMemberById(userId);
  const [editions, invites, requests] = await Promise.all([repo().listEditions(), listInvites({ userId, status: "invited" }), listInviteRequests({ userId })]);
  const invited = new Set(invites.map((i) => i.editionId));
  const entries: ResenhaCatalogEntry[] = [];
  let minor = false;

  for (const candidate of editions) {
    if (invited.has(candidate.id)) continue;
    const open = await openEdition(candidate);
    if (!open) continue;
    const { edition, event } = open;
    if (member?.birthDate && ageAt(member.birthDate, new Date(event.startsAt)) < MIN_AGE) {
      minor = true;
      continue;
    }
    const insiders = await catalogInsiders(edition.id, userId);
    if (!insiders || insiders.length === 0) continue;
    const mine = requests.find((r) => r.editionId === edition.id);
    entries.push({
      editionId: edition.id,
      slug: edition.slug,
      title: editionTitle(edition),
      headline: editionHeadline(edition),
      event: toPublicEvent(event, await ticketsWithExpiry(event)),
      insiders,
      request: mine ? { status: mine.status === "approved" ? "cancelled" : mine.status, insiderName: await insiderNameOf(mine.editionInsiderId), createdAt: mine.createdAt } : null,
    });
  }
  entries.sort((a, b) => a.event.startsAt.localeCompare(b.event.startsAt));
  return { entries, minor };
}

/** O membro pede ao Insider autorização para comprar o ingresso desta edição. */
export async function requestInvite(userId: string, participationId: string): Promise<{ request: InviteRequest; insiderName: string }> {
  const participation = await repo().getParticipation(participationId);
  const insider = participation?.active ? await repo().getInsider(participation.insiderId) : null;
  const open = participation && insider?.active ? await openEdition(await repo().getEdition(participation.editionId)) : null;
  if (!participation || !insider || !open) throw new PartnerError("Esta Resenha não está recebendo pedidos agora.", 409);
  const { edition, event } = open;

  const member = await findMemberById(userId);
  if (!member) throw new PartnerError("Não encontramos a sua conta. Entre de novo e tente outra vez.", 404);
  if (member.userId === insider.userId) throw new PartnerError("Você já está na Resenha como Insider.", 409);
  if (member.birthDate && ageAt(member.birthDate, new Date(event.startsAt)) < MIN_AGE) throw new PartnerError("A Resenha é só para maiores de 18 anos.", 422);
  if ((await listInvites({ editionId: edition.id, userId, status: "invited" })).length > 0) throw new PartnerError("Você já foi convidado para esta Resenha. Garanta seu ingresso.", 409);

  const used = await passesUsed(participation.id);
  if (used.approved + used.invited >= participation.quota) throw new PartnerError(`${insider.name} não tem mais convites para esta Resenha. Escolha outro Insider.`, 409);

  const request = await insertInviteRequest({ editionId: edition.id, editionInsiderId: participation.id, userId, memberName: member.name, memberCode: member.memberCode });
  return { request, insiderName: insider.name };
}

/** Fila do Insider: pedidos que chegaram pelo app nesta Resenha (mais novos primeiro). */
export async function insiderInviteRequests(insider: Insider, participationId: string): Promise<InsiderInviteRequestView[]> {
  await ownParticipation(insider, participationId);
  const requests = await listInviteRequests({ editionInsiderId: participationId });
  return Promise.all(
    requests
      .slice()
      .reverse()
      .map(async (r) => ({ id: r.id, memberName: r.memberName, memberCode: r.memberCode, avatarUrl: (await findMemberById(r.userId))?.avatarUrl ?? "", status: r.status, createdAt: r.createdAt, decidedAt: r.decidedAt }))
  );
}

/** Aprovar = convidar (ocupa um PASS, libera a compra e avisa no celular). Recusar encerra o pedido desta edição. */
export async function decideInviteRequest(insider: Insider, requestId: string, action: "approve" | "reject"): Promise<InviteRequest> {
  const request = await getInviteRequest(requestId);
  if (!request) throw new PartnerError("Pedido não encontrado.", 404);
  const { edition } = await ownParticipation(insider, request.editionInsiderId);
  if (request.status !== "pending") throw new PartnerError("Este pedido já foi decidido.", 409);

  if (action === "approve") {
    // O convite fecha o pedido como aprovado (ver inviteMember).
    await inviteMember(insider, request.editionInsiderId, request.memberCode);
    return (await getInviteRequest(request.id)) ?? request;
  }

  const rejected = await settleInviteRequest(request.id, "rejected", `insider:${insider.email}`);
  if (!rejected) throw new PartnerError("Este pedido já foi decidido.", 409);
  await sendPushToUser(request.userId, {
    title: "Seu pedido para a Resenha não foi aprovado",
    body: `${insider.name} não aprovou a compra do convite para a ${editionHeadline(edition)} desta vez.`,
    url: "/#live/resenha",
    tag: `resenha-${edition.id}`,
  });
  return rejected;
}
