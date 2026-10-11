// Hello World
import { PartnerError } from "@/lib/partners/errors";
import { meetingsRepo, startupsRepo, updatesRepo } from "@/lib/founders/repository";
import {
  meetingInputSchema,
  startupInputSchema,
  updateInputSchema,
  type FoundersHub,
  type FoundersMeeting,
  type FoundersStartup,
  type FoundersUpdate,
} from "@/lib/founders/types";

/** Regras do PRX Founders: o membro vê só o publicado; o admin cadastra e publica. */

const pickMeeting = (m: FoundersMeeting): FoundersMeeting => ({
  id: m.id,
  title: m.title,
  startsAt: m.startsAt,
  endsAt: m.endsAt,
  venue: m.venue,
  city: m.city,
  address: m.address,
  agenda: m.agenda,
  status: m.status,
  createdAt: m.createdAt,
  updatedAt: m.updatedAt,
});

const pickStartup = (s: FoundersStartup): FoundersStartup => ({
  id: s.id,
  name: s.name,
  oneLiner: s.oneLiner,
  description: s.description,
  sector: s.sector,
  stage: s.stage,
  relationship: s.relationship,
  websiteUrl: s.websiteUrl,
  pitchUrl: s.pitchUrl,
  status: s.status,
  sortOrder: s.sortOrder,
  createdAt: s.createdAt,
  updatedAt: s.updatedAt,
});

const pickUpdate = (u: FoundersUpdate): FoundersUpdate => ({
  id: u.id,
  kind: u.kind,
  title: u.title,
  body: u.body,
  linkUrl: u.linkUrl,
  linkLabel: u.linkLabel,
  status: u.status,
  publishedAt: u.publishedAt,
  createdAt: u.createdAt,
  updatedAt: u.updatedAt,
});

/** Conteúdo publicado para o membro. Encontros encerrados há mais de 12h saem da lista. */
export async function foundersHub(now = Date.now()): Promise<FoundersHub> {
  const [meetings, startups, updates] = await Promise.all([meetingsRepo().list(), startupsRepo().list({ status: "published" }), updatesRepo().list({ status: "published" })]);
  const visible = meetings
    .filter((m) => m.status !== "draft")
    .filter((m) => new Date(m.endsAt ?? m.startsAt).getTime() + 12 * 3_600_000 > now)
    .map(pickMeeting);
  return {
    nextMeeting: visible.find((m) => m.status === "published") ?? null,
    meetings: visible,
    startups: startups.map(pickStartup),
    updates: updates.map(pickUpdate),
  };
}

export interface FoundersAdminContent {
  meetings: FoundersMeeting[];
  startups: FoundersStartup[];
  updates: FoundersUpdate[];
}

export async function foundersAdminContent(): Promise<FoundersAdminContent> {
  const [meetings, startups, updates] = await Promise.all([meetingsRepo().list(), startupsRepo().list(), updatesRepo().list()]);
  return { meetings: meetings.map(pickMeeting), startups: startups.map(pickStartup), updates: updates.map(pickUpdate) };
}

export type ContentKind = "meeting" | "startup" | "update";

function issue(error: { issues: { message: string }[] }): never {
  throw new PartnerError(error.issues[0]?.message || "Confira os dados.", 422);
}

/** Cria ou atualiza um item do Founders. Atualização de "publicado" carimba a data de publicação. */
export async function saveFoundersContent(kind: ContentKind, data: unknown, actor: string, id?: string): Promise<FoundersMeeting | FoundersStartup | FoundersUpdate> {
  if (kind === "meeting") {
    const parsed = meetingInputSchema.safeParse(data);
    if (!parsed.success) issue(parsed.error);
    return id ? meetingsRepo().update(id, parsed.data) : meetingsRepo().insert({ ...parsed.data, createdBy: actor });
  }
  if (kind === "startup") {
    const parsed = startupInputSchema.safeParse(data);
    if (!parsed.success) issue(parsed.error);
    return id ? startupsRepo().update(id, parsed.data) : startupsRepo().insert({ ...parsed.data, createdBy: actor });
  }
  const parsed = updateInputSchema.safeParse(data);
  if (!parsed.success) issue(parsed.error);
  const publishedAt = parsed.data.status === "published" ? new Date().toISOString() : null;
  if (!id) return updatesRepo().insert({ ...parsed.data, publishedAt, createdBy: actor });
  const current = (await updatesRepo().list()).find((u) => u.id === id);
  if (!current) throw new PartnerError("Registro não encontrado.", 404);
  return updatesRepo().update(id, { ...parsed.data, publishedAt: parsed.data.status === "published" ? (current.publishedAt ?? publishedAt) : null });
}

export async function deleteFoundersContent(kind: ContentKind, id: string): Promise<void> {
  const repo = kind === "meeting" ? meetingsRepo() : kind === "startup" ? startupsRepo() : updatesRepo();
  await repo.remove(id);
}
