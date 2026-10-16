// Hello World
import { z } from "zod";

/** Sorteios da PRX (migração 20261016_prx_raffles.sql). Participação gratuita; publicação só com a autorização legal informada. */

export const RAFFLES_MIGRATION = "20261016_prx_raffles.sql";

export const RAFFLE_STATUSES = ["draft", "published", "paused", "closed", "drawn", "cancelled"] as const;
export type RaffleStatus = (typeof RAFFLE_STATUSES)[number];
export const RAFFLE_STATUS_LABEL: Record<RaffleStatus, string> = {
  draft: "Rascunho",
  published: "Inscrições abertas",
  paused: "Pausado",
  closed: "Inscrições encerradas",
  drawn: "Resultado divulgado",
  cancelled: "Cancelado",
};

export interface RaffleWinner {
  position: number;
  entryId: string;
  userId: string;
  entryNumber: number;
  /** "Ana S.": privacidade do ganhador. */
  displayName: string;
}

export interface Raffle {
  id: string;
  title: string;
  description: string;
  imageUrl: string | null;
  prize: string;
  prizeValue: number | null;
  rules: string;
  startsAt: string;
  endsAt: string;
  drawAt: string;
  winnersCount: number;
  maxEntriesPerUser: number;
  minAge: number | null;
  requiresActiveBank: boolean;
  foundersOnly: boolean;
  subscribersOnly: boolean;
  authorizationNumber: string;
  authorizationIssuer: string;
  authorizationValidUntil: string | null;
  regulationUrl: string;
  legalAckBy: string | null;
  legalAckAt: string | null;
  status: RaffleStatus;
  /** Secreta até o sorteio: nunca vai ao app antes disso. */
  seed: string | null;
  commitHash: string | null;
  entriesHash: string | null;
  entriesCount: number | null;
  publicEntropy: string;
  winners: RaffleWinner[];
  drawnAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RaffleEntry {
  id: string;
  raffleId: string;
  userId: string;
  slot: number;
  entryNumber: number | null;
  createdAt: string;
}

export interface RaffleEvent {
  id: string;
  raffleId: string;
  actor: string;
  action: string;
  detail: string;
  createdAt: string;
}

const iso = z.string().trim().refine((v) => !Number.isNaN(Date.parse(v)), "Data inválida.");
const https = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => v === "" || /^https:\/\/\S+\.\S+/.test(v), "O link precisa começar com https://")
  .default("");

export const raffleInputSchema = z
  .object({
    title: z.string().trim().min(3, "Dê um nome ao sorteio.").max(120),
    description: z.string().trim().max(2000).default(""),
    imageUrl: z.union([z.null(), z.string().trim().max(2000)]).default(null),
    prize: z.string().trim().min(2, "Descreva o prêmio.").max(300),
    prizeValue: z.union([z.null(), z.coerce.number().min(0).max(10_000_000)]).default(null),
    rules: z.string().trim().max(8000).default(""),
    startsAt: iso,
    endsAt: iso,
    drawAt: iso,
    winnersCount: z.coerce.number().int().min(1).max(100).default(1),
    maxEntriesPerUser: z.coerce.number().int().min(1).max(10).default(1),
    minAge: z.union([z.null(), z.coerce.number().int().min(12).max(120)]).default(null),
    requiresActiveBank: z.boolean().default(false),
    foundersOnly: z.boolean().default(false),
    subscribersOnly: z.boolean().default(false),
    authorizationNumber: z.string().trim().max(120).default(""),
    authorizationIssuer: z.string().trim().max(160).default(""),
    authorizationValidUntil: z.union([z.null(), z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")]).default(null),
    regulationUrl: https,
  })
  .refine((r) => Date.parse(r.endsAt) > Date.parse(r.startsAt), { path: ["endsAt"], message: "As inscrições precisam terminar depois de começar." })
  .refine((r) => Date.parse(r.drawAt) >= Date.parse(r.endsAt), { path: ["drawAt"], message: "O sorteio é depois do fim das inscrições." });
export type RaffleInput = z.output<typeof raffleInputSchema>;

/** Campos que não mudam depois de publicado (regras do jogo para quem já participou). */
export const LOCKED_AFTER_PUBLISH: ReadonlyArray<keyof RaffleInput> = [
  "prize",
  "startsAt",
  "endsAt",
  "drawAt",
  "winnersCount",
  "maxEntriesPerUser",
  "minAge",
  "requiresActiveBank",
  "foundersOnly",
  "subscribersOnly",
  "authorizationNumber",
  "regulationUrl",
];
