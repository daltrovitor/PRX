// Hello World
import { z } from "zod";

/**
 * PRX Founders: encontros, startups acompanhadas e atualizações (novidades,
 * oportunidades e materiais). Tudo é cadastrado pelo admin; nada nasce
 * preenchido. Sem dado real, o app mostra estados vazios.
 */

export const CONTENT_STATUSES = ["draft", "published"] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const MEETING_STATUSES = ["draft", "published", "cancelled"] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export interface FoundersMeeting {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  venue: string;
  city: string;
  address: string;
  /** Programação: uma linha por atividade ("19h · Abertura"). */
  agenda: string;
  status: MeetingStatus;
  createdAt: string;
  updatedAt: string;
}

export const STARTUP_STAGES = ["ideia", "mvp", "tracao"] as const;
export const STARTUP_STAGE_TEXT: Record<(typeof STARTUP_STAGES)[number], string> = { ideia: "Ideia", mvp: "MVP no ar", tracao: "Com tração" };

export const STARTUP_RELATIONSHIPS = ["acompanhada", "em_analise", "investida"] as const;
export type StartupRelationship = (typeof STARTUP_RELATIONSHIPS)[number];
export const RELATIONSHIP_LABEL: Record<StartupRelationship, string> = {
  acompanhada: "Acompanhada",
  em_analise: "Em análise para investimento",
  investida: "Investida",
};

export interface FoundersStartup {
  id: string;
  name: string;
  oneLiner: string;
  description: string;
  sector: string;
  stage: (typeof STARTUP_STAGES)[number];
  relationship: StartupRelationship;
  websiteUrl: string;
  pitchUrl: string;
  status: ContentStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export const UPDATE_KINDS = ["novidade", "oportunidade", "material"] as const;
export type UpdateKind = (typeof UPDATE_KINDS)[number];
export const UPDATE_KIND_LABEL: Record<UpdateKind, string> = { novidade: "Novidade", oportunidade: "Oportunidade", material: "Material" };

export interface FoundersUpdate {
  id: string;
  kind: UpdateKind;
  title: string;
  body: string;
  linkUrl: string;
  linkLabel: string;
  status: ContentStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const https = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || /^https:\/\/\S+\.\S+/.test(v), "O link precisa começar com https://")
  .default("");

const iso = z.string().trim().refine((v) => !Number.isNaN(new Date(v).getTime()), "Data e hora inválidas.");

export const meetingInputSchema = z
  .object({
    title: z.string().trim().min(3, "Dê um título ao encontro.").max(120),
    startsAt: iso,
    endsAt: z.union([iso, z.null()]).default(null),
    venue: z.string().trim().max(120).default(""),
    city: z.string().trim().max(120).default(""),
    address: z.string().trim().max(300).default(""),
    agenda: z.string().trim().max(4000).default(""),
    status: z.enum(MEETING_STATUSES).default("draft"),
  })
  .refine((m) => !m.endsAt || new Date(m.endsAt) >= new Date(m.startsAt), { path: ["endsAt"], message: "O fim não pode ser antes do início." });
export type MeetingInput = z.output<typeof meetingInputSchema>;

export const startupInputSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da startup.").max(80),
  oneLiner: z.string().trim().max(200).default(""),
  description: z.string().trim().max(4000).default(""),
  sector: z.string().trim().max(60).default(""),
  stage: z.enum(STARTUP_STAGES).default("ideia"),
  relationship: z.enum(STARTUP_RELATIONSHIPS).default("acompanhada"),
  websiteUrl: https,
  pitchUrl: https,
  status: z.enum(CONTENT_STATUSES).default("draft"),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});
export type StartupInput = z.output<typeof startupInputSchema>;

export const updateInputSchema = z
  .object({
    kind: z.enum(UPDATE_KINDS).default("novidade"),
    title: z.string().trim().min(3, "Dê um título.").max(140),
    body: z.string().trim().max(6000).default(""),
    linkUrl: https,
    linkLabel: z.string().trim().max(60).default(""),
    status: z.enum(CONTENT_STATUSES).default("draft"),
  })
  .refine((u) => u.kind !== "material" || u.linkUrl !== "", { path: ["linkUrl"], message: "Material precisa de um link." });
export type UpdateInput = z.output<typeof updateInputSchema>;

/** O que o membro recebe: só o publicado. */
export interface FoundersHub {
  nextMeeting: FoundersMeeting | null;
  meetings: FoundersMeeting[];
  startups: FoundersStartup[];
  updates: FoundersUpdate[];
}
