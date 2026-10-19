// Hello World
import { PartnerError } from "@/lib/partners/errors";
import { getLiveRepository } from "@/lib/live/repository";
import { ticketsWithExpiry, toPublicEvent, type PublicEvent } from "@/lib/live/service";
import { isRealActiveTicket } from "@/lib/live/rules";
import type { LiveEvent, TicketStatus } from "@/lib/live/types";
import { findMemberByCode, findMemberById, searchMembers, type MemberMatch } from "@/lib/members/member-code";
import { sendPushToUser } from "@/lib/push/send";
import { getResenhaRepository } from "@/lib/resenha/repository";
import { getInvite, insertInvite, listInvites, revokeInvite, type InviteStatus, type MemberInvite } from "@/lib/resenha/invites-repository";
import { MIN_AGE, ageAt, editionHeadline, editionTitle, type EditionInsider, type Insider, type ResenhaEdition } from "@/lib/resenha/types";

/**
 * O Insider convida membros do app (busca por nome ou ID PRX). Convidado, a
 * Resenha aparece na Home e no PRX LIVE da pessoa, que recebe uma notificação no
 * celular e compra (ou garante, se gratuito) o ingresso. Cada convite ativo
 * ocupa um PASS da cota; cancelar devolve.
 */

const repo = () => getResenhaRepository();
const live = () => getLiveRepository();

export type CandidateStatus = "available" | "invited" | "minor" | "self";

export interface InviteCandidate {
  memberCode: string;
  name: string;
  avatarUrl: string;
  status: CandidateStatus;
}

export type InviteTicketState = "none" | TicketStatus;

export interface InsiderInviteView {
  id: string;
  memberName: string;
  memberCode: string;
  status: InviteStatus;
  createdAt: string;
  ticket: InviteTicketState;
}

export interface MemberResenhaView {
  inviteId: string;
  slug: string;
  title: string;
  headline: string;
  insiderName: string;
  event: PublicEvent;
  ticket: InviteTicketState;
}

async function ownParticipation(insider: Insider, participationId: string): Promise<{ participation: EditionInsider; edition: ResenhaEdition; event: LiveEvent }> {
  const participation = await repo().getParticipation(participationId);
  if (!participation || participation.insiderId !== insider.id || !participation.active) throw new PartnerError("Resenha não encontrada.", 404);
  const edition = await repo().getEdition(participation.editionId);
  const event = edition ? await live().getEvent(edition.eventId) : null;
  if (!edition || !event) throw new PartnerError("Resenha não encontrada.", 404);
  return { participation, edition, event };
}

/** PASSes ocupados pelo link: pedidos liberados + convites ativos. */
export async function passesUsed(participationId: string): Promise<{ approved: number; invited: number }> {
  const [requests, invites] = await Promise.all([repo().listRequests({ editionInsiderId: participationId }), listInvites({ editionInsiderId: participationId, status: "invited" })]);
  return { approved: requests.filter((r) => r.status === "approved").length, invited: invites.length };
}

/** Situação do ingresso do convidado neste evento (o mais recente que não foi cancelado). */
async function ticketState(event: LiveEvent, userId: string): Promise<InviteTicketState> {
  const mine = (await live().listTickets({ eventId: event.id, userId })).filter((t) => !t.isTest).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const active = mine.find((t) => isRealActiveTicket(t) || t.status === "used");
  return active?.status ?? "none";
}

function isMinor(member: MemberMatch, event: LiveEvent): boolean {
  return member.birthDate !== null && ageAt(member.birthDate, new Date(event.startsAt)) < MIN_AGE;
}

export async function searchCandidates(insider: Insider, participationId: string, query: string): Promise<InviteCandidate[]> {
  const { edition, event } = await ownParticipation(insider, participationId);
  const [members, invites] = await Promise.all([searchMembers(query), listInvites({ editionId: edition.id, status: "invited" })]);
  const invited = new Set(invites.map((i) => i.userId));
  return members
    // Menores de idade nem aparecem: a Resenha é 18+.
    .filter((m) => !isMinor(m, event))
    .map((m) => ({
      memberCode: m.memberCode,
      name: m.name,
      avatarUrl: m.avatarUrl,
      status: m.userId === insider.userId ? "self" : invited.has(m.userId) ? "invited" : "available",
    }));
}

export async function inviteMember(insider: Insider, participationId: string, memberCode: string): Promise<MemberInvite> {
  const { participation, edition, event } = await ownParticipation(insider, participationId);
  if (edition.status === "draft") throw new PartnerError("Esta Resenha ainda não abriu.", 409);
  if (edition.status === "closed") throw new PartnerError("A lista fechou: não dá para convidar mais ninguém.", 409);
  if (event.status === "cancelled") throw new PartnerError("A equipe cancelou este evento.", 409);
  if (new Date(event.startsAt).getTime() <= Date.now()) throw new PartnerError("A Resenha já começou.", 409);

  const member = await findMemberByCode(memberCode);
  if (!member) throw new PartnerError("Nenhum membro com este ID PRX.", 404);
  if (member.userId === insider.userId) throw new PartnerError("Você já está na Resenha como Insider.", 409);
  if (isMinor(member, event)) throw new PartnerError("A Resenha é só para maiores de 18 anos.", 422);

  const before = await passesUsed(participation.id);
  if (before.approved + before.invited >= participation.quota) throw new PartnerError(`Seus PASSes acabaram (${participation.quota}/${participation.quota}).`, 409);

  const invite = await insertInvite({ editionId: edition.id, editionInsiderId: participation.id, userId: member.userId, memberName: member.name, memberCode: member.memberCode });
  // Dois convites no último PASS ao mesmo tempo: o que passou da cota é desfeito.
  const after = await passesUsed(participation.id);
  if (after.approved + after.invited > participation.quota) {
    await revokeInvite(invite.id, "sistema:cota");
    throw new PartnerError(`Seus PASSes acabaram (${participation.quota}/${participation.quota}).`, 409);
  }

  await sendPushToUser(member.userId, {
    title: "Você foi convidado para a Resenha",
    body: `${insider.name} te colocou na ${editionHeadline(edition)}. Garanta seu ingresso no app.`,
    url: "/#live/resenha",
    tag: `resenha-${edition.id}`,
  });
  return invite;
}

/** Cancela o convite e devolve o PASS. Quem já garantiu o ingresso sai pelo admin (cancelando o ingresso). */
export async function cancelInvite(insider: Insider, inviteId: string): Promise<MemberInvite> {
  const invite = await getInvite(inviteId);
  if (!invite) throw new PartnerError("Convite não encontrado.", 404);
  const { event } = await ownParticipation(insider, invite.editionInsiderId);
  const state = await ticketState(event, invite.userId);
  if (state === "valid" || state === "used") throw new PartnerError("Esta pessoa já garantiu o ingresso. Para tirar da lista, fale com a equipe PRX.", 409);
  if (state === "pending_payment") throw new PartnerError("Esta pessoa está pagando o ingresso agora. Tente de novo em alguns minutos.", 409);
  const revoked = await revokeInvite(invite.id, `insider:${insider.email}`);
  if (!revoked) throw new PartnerError("Este convite já tinha sido cancelado.", 409);
  return revoked;
}

export async function insiderInvites(insider: Insider, participationId: string): Promise<InsiderInviteView[]> {
  const { event } = await ownParticipation(insider, participationId);
  const invites = await listInvites({ editionInsiderId: participationId });
  return Promise.all(
    invites
      .slice()
      .reverse()
      .map(async (i) => ({ id: i.id, memberName: i.memberName, memberCode: i.memberCode, status: i.status, createdAt: i.createdAt, ticket: i.status === "invited" ? await ticketState(event, i.userId) : "none" }))
  );
}

/** Resenhas para as quais o membro está convidado (só elas aparecem no app dele). */
export async function memberResenhas(userId: string): Promise<MemberResenhaView[]> {
  const invites = await listInvites({ userId, status: "invited" });
  const views = await Promise.all(
    invites.map(async (invite): Promise<MemberResenhaView | null> => {
      const edition = await repo().getEdition(invite.editionId);
      const event = edition ? await live().getEvent(edition.eventId) : null;
      if (!edition || !event || edition.status === "draft" || event.status === "draft") return null;
      const publicEvent = toPublicEvent(event, await ticketsWithExpiry(event));
      if (publicEvent.ended) return null;
      const participation = await repo().getParticipation(invite.editionInsiderId);
      const insider = participation ? await repo().getInsider(participation.insiderId) : null;
      return { inviteId: invite.id, slug: edition.slug, title: editionTitle(edition), headline: editionHeadline(edition), insiderName: insider?.name ?? "Insider", event: publicEvent, ticket: await ticketState(event, userId) };
    })
  );
  return views.filter((v): v is MemberResenhaView => v !== null).sort((a, b) => a.event.startsAt.localeCompare(b.event.startsAt));
}

/** Nome do membro para a tela do Insider (convite feito pelo id interno, ex.: testes). */
export async function memberLabel(userId: string): Promise<string> {
  return (await findMemberById(userId))?.name ?? "Membro PRX";
}
