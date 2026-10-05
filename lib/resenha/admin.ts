// Hello World
import crypto from "crypto";
import { PartnerError } from "@/lib/partners/errors";
import { getLiveRepository } from "@/lib/live/repository";
import { isActiveTicket } from "@/lib/live/rules";
import { createEvent, updateEvent } from "@/lib/live/service";
import type { EventInput, LiveEvent } from "@/lib/live/types";
import { provisionInsiderAccount } from "@/lib/resenha/access";
import { insiderLink } from "@/lib/resenha/config";
import { getResenhaRepository } from "@/lib/resenha/repository";
import { linkStats } from "@/lib/resenha/service";
import {
  editionHeadline,
  editionTitle,
  insiderCode,
  type AccessRequest,
  type EditionInput,
  type EditionStatus,
  type EditionInsider,
  type Insider,
  type InsiderInput,
  type InsiderKind,
  type LinkStats,
  type RequestStatus,
  type ResenhaEdition,
} from "@/lib/resenha/types";

/** Operação da Resenha pelo admin: edições (com o evento PRX LIVE por baixo), Insiders e visão geral. */

const repo = () => getResenhaRepository();
const live = () => getLiveRepository();

export interface AdminParticipationView {
  id: string;
  insider: { id: string; name: string; email: string; handle: string; active: boolean };
  kind: InsiderKind;
  code: string;
  quota: number;
  active: boolean;
  link: string;
  stats: LinkStats;
}

export interface AdminEditionView {
  id: string;
  number: number;
  slug: string;
  title: string;
  headline: string;
  hostName: string;
  hostArticle: ResenhaEdition["hostArticle"];
  status: EditionStatus;
  event: { id: string; status: LiveEvent["status"]; startsAt: string; endsAt: string | null; venue: string; city: string; address: string; capacity: number | null; issued: number; checkedIn: number };
  participations: AdminParticipationView[];
}

export interface AdminOverview {
  editions: AdminEditionView[];
  /** Insiders já cadastrados: dá para colocá-los em outra edição sem criar o login de novo. */
  insiders: Array<Pick<Insider, "id" | "name" | "email" | "handle" | "active">>;
}

export async function adminOverview(baseUrl: string): Promise<AdminOverview> {
  const [editions, insiders, participations, requests] = await Promise.all([repo().listEditions(), repo().listInsiders(), repo().listParticipations(), repo().listRequests({})]);
  const insiderById = new Map(insiders.map((i) => [i.id, i]));
  const views: AdminEditionView[] = [];
  for (const edition of editions) {
    const event = await live().getEvent(edition.eventId);
    if (!event) continue;
    const tickets = await live().listTickets({ eventId: event.id });
    views.push({
      id: edition.id,
      number: edition.number,
      slug: edition.slug,
      title: editionTitle(edition),
      headline: editionHeadline(edition),
      hostName: edition.hostName,
      hostArticle: edition.hostArticle,
      status: edition.status,
      event: {
        id: event.id,
        status: event.status,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        venue: event.venue,
        city: event.city,
        address: event.address,
        capacity: event.capacity,
        issued: tickets.filter(isActiveTicket).length,
        checkedIn: tickets.filter((t) => t.status === "used").length,
      },
      participations: participations
        .filter((p) => p.editionId === edition.id)
        .flatMap((p) => {
          const insider = insiderById.get(p.insiderId);
          if (!insider) return [];
          const view: AdminParticipationView = {
            id: p.id,
            insider: { id: insider.id, name: insider.name, email: insider.email, handle: insider.handle, active: insider.active },
            kind: p.kind,
            code: p.code,
            quota: p.quota,
            active: p.active,
            link: insiderLink(baseUrl, edition.slug, p.code),
            stats: linkStats(p, requests.filter((r) => r.editionInsiderId === p.id)),
          };
          return [view];
        }),
    });
  }
  return { editions: views, insiders: insiders.map(({ id, name, email, handle, active }) => ({ id, name, email, handle, active })) };
}

export interface AdminRequestView {
  id: string;
  name: string;
  email: string;
  whatsapp: string;
  instagram: string;
  status: RequestStatus;
  insiderName: string;
  createdAt: string;
  checkedIn: boolean;
}

/** Todos os pedidos da edição, para o admin acompanhar e decidir no lugar do Insider. */
export async function adminRequests(editionId: string): Promise<AdminRequestView[]> {
  const edition = await repo().getEdition(editionId);
  if (!edition) throw new PartnerError("Edição não encontrada.", 404);
  const [requests, participations, insiders, tickets] = await Promise.all([
    repo().listRequests({ editionId }),
    repo().listParticipations({ editionId }),
    repo().listInsiders(),
    live().listTickets({ eventId: edition.eventId }),
  ]);
  const insiderName = new Map(participations.map((p) => [p.id, insiders.find((i) => i.id === p.insiderId)?.name ?? "—"]));
  const used = new Set(tickets.filter((t) => t.status === "used").map((t) => t.id));
  return requests.map((r: AccessRequest) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    whatsapp: r.whatsapp,
    instagram: r.instagram,
    status: r.status,
    insiderName: insiderName.get(r.editionInsiderId) ?? "—",
    createdAt: r.createdAt,
    checkedIn: r.ticketId !== null && used.has(r.ticketId),
  }));
}

/* -------------------------------------------------------------------------- */
/* Edições                                                                     */
/* -------------------------------------------------------------------------- */

const isoOrNull = (value: string | null) => (value ? new Date(value).toISOString() : null);

function assertDates(startsAt: string, endsAt: string | null) {
  if (endsAt && endsAt < startsAt) throw new PartnerError("O fim não pode ser antes do início.", 422);
}

/** Cria a edição (rascunho) e o evento da série "resenha" por baixo, já com a portaria da equipe ligada. */
export async function createEdition(input: EditionInput, actor: string): Promise<ResenhaEdition> {
  const startsAt = new Date(input.startsAt).toISOString();
  const endsAt = isoOrNull(input.endsAt);
  assertDates(startsAt, endsAt);
  const number = await repo().nextEditionNumber();
  const title = editionTitle({ hostArticle: input.hostArticle, hostName: input.hostName });
  const event = await createEvent(
    {
      series: "resenha",
      title,
      summary: `${title}: festa por lista. O acesso vem do convite de um Insider.`,
      startsAt,
      endsAt,
      venue: input.venue,
      city: input.city,
      address: input.address,
      coverUrl: "",
      capacity: input.capacity,
      perUserLimit: 1,
      minPrxLevel: 1,
      partnerId: null,
      staffCheckin: true,
      status: "published",
      batches: [{ id: "lista", name: "Lista", price: 0, quantity: null, closed: false }],
      run: null,
    } satisfies EventInput,
    actor
  );
  try {
    return await repo().insertEdition({ eventId: event.id, number, hostName: input.hostName, hostArticle: input.hostArticle, status: "draft" });
  } catch (error) {
    await live().deleteEvent(event.id).catch(() => undefined);
    throw error;
  }
}

export async function updateEdition(id: string, input: EditionInput): Promise<ResenhaEdition> {
  const edition = await repo().getEdition(id);
  const event = edition ? await live().getEvent(edition.eventId) : null;
  if (!edition || !event) throw new PartnerError("Edição não encontrada.", 404);
  const startsAt = new Date(input.startsAt).toISOString();
  const endsAt = isoOrNull(input.endsAt);
  assertDates(startsAt, endsAt);
  const issued = (await live().listTickets({ eventId: event.id })).filter(isActiveTicket).length;
  if (input.capacity !== null && input.capacity < issued) throw new PartnerError(`Já há ${issued} acessos liberados: a lotação não pode ser menor.`, 409);

  await updateEvent(event.id, {
    series: event.series,
    title: editionTitle({ hostArticle: input.hostArticle, hostName: input.hostName }),
    summary: event.summary,
    startsAt,
    endsAt,
    venue: input.venue,
    city: input.city,
    address: input.address,
    coverUrl: event.coverUrl,
    capacity: input.capacity,
    perUserLimit: event.perUserLimit,
    minPrxLevel: event.minPrxLevel,
    partnerId: event.partnerId,
    staffCheckin: event.staffCheckin,
    status: event.status,
    batches: event.batches,
    run: null,
  });
  return repo().updateEdition(id, { hostName: input.hostName, hostArticle: input.hostArticle });
}

export async function setEditionStatus(id: string, status: EditionStatus): Promise<ResenhaEdition> {
  const edition = await repo().getEdition(id);
  if (!edition) throw new PartnerError("Edição não encontrada.", 404);
  if (status === "draft" && edition.status !== "draft") {
    const requests = await repo().listRequests({ editionId: id });
    if (requests.length > 0) throw new PartnerError("Esta edição já recebeu pedidos: feche a lista em vez de voltar para rascunho.", 409);
  }
  return repo().updateEdition(id, { status });
}

/* -------------------------------------------------------------------------- */
/* Insiders                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Coloca um Insider na edição com a cota de PASSes e o link próprio. Se o e-mail
 * ainda não tem login, cria a conta (senha temporária mostrada uma única vez ao admin).
 */
export async function addInsider(editionId: string, input: InsiderInput): Promise<{ participation: EditionInsider; insider: Insider; temporaryPassword: string | null }> {
  const edition = await repo().getEdition(editionId);
  if (!edition) throw new PartnerError("Edição não encontrada.", 404);

  let insider = await repo().getInsiderByEmail(input.email);
  let temporaryPassword: string | null = null;
  if (!insider) {
    const account = await provisionInsiderAccount(input.mode, input.email, input.name);
    temporaryPassword = account.temporaryPassword ?? null;
    insider = await repo().insertInsider({ userId: account.userId, email: account.email, name: input.name, handle: input.handle, active: true });
  } else if (!insider.active) {
    insider = await repo().updateInsider(insider.id, { active: true });
  }
  if ((await repo().listParticipations({ editionId, insiderId: insider.id })).length > 0) throw new PartnerError("Este Insider já está nesta edição.", 409);

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const participation = await repo().insertParticipation({ editionId, insiderId: insider.id, kind: input.kind, code: insiderCode(insider.name, (max) => crypto.randomInt(max)), quota: input.quota, active: true });
      return { participation, insider, temporaryPassword };
    } catch (error) {
      if (!(error instanceof PartnerError) || error.status !== 409 || attempt === 4) throw error;
    }
  }
  throw new PartnerError("Não foi possível gerar o link do Insider.", 500);
}

export async function updateParticipation(id: string, patch: { quota?: number; active?: boolean; kind?: InsiderKind }): Promise<EditionInsider> {
  const current = await repo().getParticipation(id);
  if (!current) throw new PartnerError("Insider da edição não encontrado.", 404);
  if (patch.quota !== undefined) {
    const approved = (await repo().listRequests({ editionInsiderId: id })).filter((r) => r.status === "approved").length;
    if (patch.quota < approved) throw new PartnerError(`Este Insider já liberou ${approved} acessos: a cota não pode ser menor.`, 409);
  }
  // Só o que foi informado muda (campo ausente não pode apagar o valor atual).
  return repo().updateParticipation(id, {
    ...(patch.quota !== undefined && { quota: patch.quota }),
    ...(patch.active !== undefined && { active: patch.active }),
    ...(patch.kind !== undefined && { kind: patch.kind }),
  });
}

/** Desliga (ou religa) o Insider em todas as edições: ele perde o acesso ao portal na hora. */
export async function setInsiderActive(insiderId: string, active: boolean): Promise<Insider> {
  if (!(await repo().getInsider(insiderId))) throw new PartnerError("Insider não encontrado.", 404);
  return repo().updateInsider(insiderId, { active });
}
