// Hello World
import crypto from "crypto";
import { PartnerError } from "@/lib/partners/errors";
import { getLiveRepository } from "@/lib/live/repository";
import { listInvites } from "@/lib/resenha/invites-repository";
import { eventHasEnded, ticketQrPayload } from "@/lib/live/rules";
import { issueTicketTo } from "@/lib/live/service";
import type { LiveEvent } from "@/lib/live/types";
import { insiderLink } from "@/lib/resenha/config";
import type { ListEmailContext } from "@/lib/resenha/notify";
import { getResenhaRepository } from "@/lib/resenha/repository";
import {
  MIN_AGE,
  ageAt,
  editionHeadline,
  editionTitle,
  type AccessRequest,
  type Decision,
  type EditionInsider,
  type EditionStatus,
  type GuestView,
  type Insider,
  type InsiderEditionView,
  type InsiderKind,
  type InsiderRequestView,
  type LinkStats,
  type RequestInput,
  type ResenhaEdition,
} from "@/lib/resenha/types";

/**
 * Regras da Resenha: página pública do link, pedido de acesso, página do convidado
 * e a decisão do Insider (liberar, recusar, remover). Liberar emite um ingresso
 * gratuito do PRX LIVE na hora; a cota (PASS) é conferida depois de emitir, como a
 * lotação do evento, para dois cliques simultâneos no último PASS não passarem os dois.
 */

const repo = () => getResenhaRepository();
const live = () => getLiveRepository();

const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;
const SLUG = /^\d{3,}$/;

async function loadEdition(slug: string): Promise<{ edition: ResenhaEdition; event: LiveEvent }> {
  if (!SLUG.test(slug)) throw new PartnerError("Resenha não encontrada.", 404);
  const edition = await repo().getEditionBySlug(slug);
  if (!edition || edition.status === "draft") throw new PartnerError("Resenha não encontrada.", 404);
  const event = await live().getEvent(edition.eventId);
  if (!event) throw new PartnerError("Resenha não encontrada.", 404);
  return { edition, event };
}

/** Link válido: do código da edição, ativo, de um Insider ativo. */
async function resolveLink(editionId: string, code: string | null): Promise<{ participation: EditionInsider; insider: Insider } | null> {
  if (!code) return null;
  const participation = await repo().getParticipationByCode(code.trim().toLowerCase());
  if (!participation || participation.editionId !== editionId || !participation.active) return null;
  const insider = await repo().getInsider(participation.insiderId);
  return insider?.active ? { participation, insider } : null;
}

/** Por que a lista não recebe pedidos agora (null = recebe). */
function closedReason(edition: Pick<ResenhaEdition, "status">, event: LiveEvent): string | null {
  if (event.status === "cancelled") return "Esta Resenha foi cancelada.";
  if (eventHasEnded(event)) return "Esta Resenha já aconteceu.";
  if (edition.status === "closed") return "A lista fechou.";
  return null;
}

/* -------------------------------------------------------------------------- */
/* Página pública do link                                                      */
/* -------------------------------------------------------------------------- */

export interface PublicEditionView {
  edition: { slug: string; number: number; title: string; headline: string; hostName: string; status: EditionStatus; startsAt: string; city: string };
  insider: { name: string; handle: string; kind: InsiderKind } | null;
  canRequest: boolean;
  reason: string | null;
}

export async function publicEdition(slug: string, code: string | null): Promise<PublicEditionView> {
  const { edition, event } = await loadEdition(slug);
  const link = await resolveLink(edition.id, code);
  const reason = closedReason(edition, event) ?? (link ? null : "Você precisa do link de um Insider para pedir acesso.");
  return {
    edition: { slug: edition.slug, number: edition.number, title: editionTitle(edition), headline: editionHeadline(edition), hostName: edition.hostName, status: edition.status, startsAt: event.startsAt, city: event.city },
    insider: link ? { name: link.insider.name, handle: link.insider.handle, kind: link.participation.kind } : null,
    canRequest: reason === null,
    reason,
  };
}

export async function submitRequest(slug: string, input: RequestInput): Promise<{ token: string }> {
  const { edition, event } = await loadEdition(slug);
  const closed = closedReason(edition, event);
  if (closed) throw new PartnerError(closed, 409);
  const link = await resolveLink(edition.id, input.code);
  if (!link) throw new PartnerError("Este link não está mais ativo. Peça um novo ao Insider.", 404);
  if (ageAt(input.birthDate, new Date(event.startsAt)) < MIN_AGE) throw new PartnerError(`A Resenha é ${MIN_AGE}+. Só entra quem tem ${MIN_AGE} anos ou mais na data da festa.`, 422);
  if (await repo().findRequest(edition.id, input.email)) throw new PartnerError("Já existe um pedido com este e-mail para esta Resenha.", 409);

  const token = crypto.randomBytes(24).toString("base64url");
  try {
    await repo().insertRequest({ editionId: edition.id, editionInsiderId: link.participation.id, name: input.name, email: input.email, whatsapp: input.whatsapp, instagram: input.instagram, birthDate: input.birthDate, token });
  } catch (error) {
    if (error instanceof PartnerError && error.status === 409) throw new PartnerError("Já existe um pedido com este e-mail para esta Resenha.", 409);
    throw error;
  }
  return { token };
}

/* -------------------------------------------------------------------------- */
/* Página do convidado                                                         */
/* -------------------------------------------------------------------------- */

export async function guestView(token: string): Promise<GuestView> {
  if (!TOKEN.test(token)) throw new PartnerError("Pedido não encontrado.", 404);
  const request = await repo().getRequestByToken(token);
  const edition = request ? await repo().getEdition(request.editionId) : null;
  const event = edition ? await live().getEvent(edition.eventId) : null;
  if (!request || !edition || !event) throw new PartnerError("Pedido não encontrado.", 404);

  const participation = await repo().getParticipation(request.editionInsiderId);
  const insider = participation ? await repo().getInsider(participation.insiderId) : null;
  const ticket = request.ticketId ? await live().getTicket(request.ticketId) : null;
  // Ingresso cancelado fora da lista (ex.: pelo admin) também tira a pessoa da lista.
  const status = request.status === "approved" && (!ticket || ticket.status === "cancelled") ? "revoked" : request.status;
  const cancelled = event.status === "cancelled";
  const listed = !cancelled && status === "approved" && ticket !== null && (ticket.status === "valid" || ticket.status === "used");
  return {
    status,
    name: request.name,
    headline: editionHeadline(edition),
    title: editionTitle(edition),
    insiderName: insider?.name ?? "um Insider",
    startsAt: event.startsAt,
    city: event.city,
    cancelled,
    venue: listed ? event.venue : null,
    address: listed ? event.address : null,
    ticket: listed && ticket ? { code: ticket.code, qr: ticketQrPayload(ticket), used: ticket.status === "used" } : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Portal do Insider                                                           */
/* -------------------------------------------------------------------------- */

export function linkStats(participation: Pick<EditionInsider, "quota">, requests: ReadonlyArray<Pick<AccessRequest, "status">>, invited = 0): LinkStats {
  const count = (status: AccessRequest["status"]) => requests.filter((r) => r.status === status).length;
  const approved = count("approved");
  return { quota: participation.quota, approved, invited, pending: count("pending"), rejected: count("rejected") + count("revoked"), left: Math.max(0, participation.quota - approved - invited) };
}

export async function insiderEditions(insider: Insider, baseUrl: string): Promise<InsiderEditionView[]> {
  const found: Array<{ startsAt: string; view: InsiderEditionView }> = [];
  for (const participation of await repo().listParticipations({ insiderId: insider.id })) {
    if (!participation.active) continue;
    const edition = await repo().getEdition(participation.editionId);
    if (!edition || edition.status === "draft") continue;
    const event = await live().getEvent(edition.eventId);
    if (!event) continue;
    const [requests, invites] = await Promise.all([repo().listRequests({ editionInsiderId: participation.id }), listInvites({ editionInsiderId: participation.id, status: "invited" })]);
    found.push({
      startsAt: event.startsAt,
      view: {
        participationId: participation.id,
        kind: participation.kind,
        link: insiderLink(baseUrl, edition.slug, participation.code),
        stats: linkStats(participation, requests, invites.length),
        edition: { id: edition.id, slug: edition.slug, title: editionTitle(edition), headline: editionHeadline(edition), status: edition.status, startsAt: event.startsAt, city: event.city, venue: event.venue, hostName: edition.hostName },
      },
    });
  }
  return found.sort((a, b) => b.startsAt.localeCompare(a.startsAt)).map((item) => item.view);
}

export async function insiderRequests(insider: Insider, participationId: string): Promise<InsiderRequestView[]> {
  const participation = await repo().getParticipation(participationId);
  if (!participation || participation.insiderId !== insider.id || !participation.active) throw new PartnerError("Link não encontrado.", 404);
  const edition = await repo().getEdition(participation.editionId);
  const event = edition ? await live().getEvent(edition.eventId) : null;
  if (!edition || !event) throw new PartnerError("Resenha não encontrada.", 404);

  const usedTickets = new Set((await live().listTickets({ eventId: event.id })).filter((t) => t.status === "used").map((t) => t.id));
  const eventDate = new Date(event.startsAt);
  return (await repo().listRequests({ editionInsiderId: participation.id })).map((r) => ({
    id: r.id,
    name: r.name,
    instagram: r.instagram,
    whatsapp: r.whatsapp,
    age: ageAt(r.birthDate, eventDate),
    status: r.status,
    createdAt: r.createdAt,
    decidedAt: r.decidedAt,
    checkedIn: r.ticketId !== null && usedTickets.has(r.ticketId),
  }));
}

/* -------------------------------------------------------------------------- */
/* Decisão: liberar, recusar ou remover                                        */
/* -------------------------------------------------------------------------- */

/** Insider decide só o que chegou pelo link dele; o admin decide qualquer pedido (e passa da cota). */
export type Actor = { kind: "insider"; insider: Insider } | { kind: "admin"; label: string };

const actorLabel = (actor: Actor) => (actor.kind === "insider" ? `insider:${actor.insider.email}` : actor.label);

export type ApprovalNotice = Omit<ListEmailContext, "baseUrl">;

export async function decideRequest(actor: Actor, requestId: string, action: Decision): Promise<{ request: AccessRequest; notice: ApprovalNotice | null }> {
  const request = await repo().getRequest(requestId);
  const participation = request ? await repo().getParticipation(request.editionInsiderId) : null;
  if (!request || !participation) throw new PartnerError("Pedido não encontrado.", 404);
  if (actor.kind === "insider" && (participation.insiderId !== actor.insider.id || !participation.active)) throw new PartnerError("Pedido não encontrado.", 404);
  const edition = await repo().getEdition(request.editionId);
  const event = edition ? await live().getEvent(edition.eventId) : null;
  if (!edition || !event) throw new PartnerError("Resenha não encontrada.", 404);
  if (edition.status === "draft") throw new PartnerError("Esta Resenha ainda não abriu.", 409);

  const by = actorLabel(actor);
  const at = new Date().toISOString();

  if (action === "reject") {
    const updated = await repo().updateRequest(request.id, { status: "rejected", decidedAt: at, decidedBy: by }, ["pending"]);
    if (!updated) throw new PartnerError("Este pedido já foi respondido. Atualize a lista.", 409);
    return { request: updated, notice: null };
  }

  if (action === "revoke") {
    if (request.status !== "approved") throw new PartnerError("Só quem está na lista pode ser removido.", 409);
    const ticket = request.ticketId ? await live().getTicket(request.ticketId) : null;
    if (ticket?.status === "used") throw new PartnerError("Esta pessoa já entrou na festa.", 409);
    if (ticket && ticket.status !== "cancelled") {
      const cancelled = await live().updateTicket(ticket.id, { status: "cancelled", cancelledAt: at, note: `Removido da lista por ${by}` }, ["valid"]);
      if (!cancelled) throw new PartnerError("Esta pessoa acabou de entrar na festa.", 409);
    }
    const updated = await repo().updateRequest(request.id, { status: "revoked", decidedAt: at, decidedBy: by }, ["approved"]);
    if (!updated) throw new PartnerError("Este pedido mudou. Atualize a lista.", 409);
    return { request: updated, notice: null };
  }

  if (request.status !== "pending" && request.status !== "rejected") throw new PartnerError("Este pedido já está na lista.", 409);
  const quotaApplies = actor.kind === "insider";
  // Convites a membros do app também ocupam PASS.
  const invited = quotaApplies ? (await listInvites({ editionInsiderId: participation.id, status: "invited" })).length : 0;
  if (quotaApplies) {
    const approved = (await repo().listRequests({ editionInsiderId: participation.id })).filter((r) => r.status === "approved").length;
    if (approved + invited >= participation.quota) throw new PartnerError(`Seus PASSes acabaram (${approved + invited}/${participation.quota}).`, 409);
  }

  const insider = await repo().getInsider(participation.insiderId);
  const insiderName = insider?.name ?? "Insider";
  const ticket = await issueTicketTo(
    event,
    { userId: crypto.randomUUID(), email: request.email, name: request.name },
    { batchId: "lista", batchName: `Lista · ${insiderName}`, issuedBy: by, note: `Resenha ${edition.slug}` }
  );
  const updated = await repo().updateRequest(request.id, { status: "approved", ticketId: ticket.id, decidedAt: at, decidedBy: by }, ["pending", "rejected"]);
  if (!updated) {
    await live().deleteTicket(ticket.id);
    throw new PartnerError("Este pedido mudou. Atualize a lista.", 409);
  }
  if (quotaApplies && !(await repo().firstApprovedIds(participation.id, Math.max(0, participation.quota - invited))).includes(request.id)) {
    await repo().updateRequest(request.id, { status: request.status, ticketId: null, decidedAt: request.decidedAt, decidedBy: request.decidedBy }, ["approved"]);
    await live().deleteTicket(ticket.id);
    throw new PartnerError(`Seus PASSes acabaram (${participation.quota}/${participation.quota}).`, 409);
  }
  return { request: updated, notice: { request: updated, edition, insiderName, ticketId: ticket.id, event: { startsAt: event.startsAt, venue: event.venue, address: event.address, city: event.city } } };
}
