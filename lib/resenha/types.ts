// Hello World
import { z } from "zod";
import { todayInBrasilia } from "@/lib/family/age";
import { onlyDigits } from "@/lib/family/types";

/**
 * Resenha da…: festa com Host, Insiders e lista de acesso. Cada edição é um evento
 * PRX LIVE da série "resenha". O Insider recebe um link com cota (PASS) e libera ou
 * recusa os pedidos que chegam por ele; liberado vira ingresso gratuito.
 */

export const EDITION_STATUSES = ["draft", "open", "closed"] as const;
export type EditionStatus = (typeof EDITION_STATUSES)[number];
export const EDITION_STATUS_LABEL: Record<EditionStatus, string> = { draft: "Rascunho", open: "Lista aberta", closed: "Lista fechada" };

export const INSIDER_KINDS = ["insider", "guest"] as const;
export type InsiderKind = (typeof INSIDER_KINDS)[number];
export const INSIDER_KIND_LABEL: Record<InsiderKind, string> = { insider: "Insider", guest: "Guest Insider" };

export const REQUEST_STATUSES = ["pending", "approved", "rejected", "revoked"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = { pending: "Pendente", approved: "Na lista", rejected: "Ainda não", revoked: "Removido" };

export const HOST_ARTICLES = ["da", "do"] as const;
export type HostArticle = (typeof HOST_ARTICLES)[number];

export const MIN_AGE = 18;

export interface ResenhaEdition {
  id: string;
  eventId: string;
  number: number;
  /** 001, 002…: o endereço público da edição. */
  slug: string;
  hostName: string;
  hostArticle: HostArticle;
  status: EditionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Insider {
  id: string;
  userId: string;
  email: string;
  name: string;
  handle: string;
  /** Foto que aparece no catálogo de Insiders do app (vazio = iniciais). */
  avatarUrl: string;
  active: boolean;
  createdAt: string;
}

export interface EditionInsider {
  id: string;
  editionId: string;
  insiderId: string;
  kind: InsiderKind;
  /** Código do link: /resenha/001?i=<code>. */
  code: string;
  /** Acessos que ele pode liberar (PASS). */
  quota: number;
  active: boolean;
  createdAt: string;
}

export interface AccessRequest {
  id: string;
  editionId: string;
  editionInsiderId: string;
  name: string;
  email: string;
  whatsapp: string;
  instagram: string;
  birthDate: string;
  status: RequestStatus;
  /** Segredo da página do convidado (/resenha/lista/<token>). */
  token: string;
  ticketId: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
  createdAt: string;
}

/* -------------------------------------------------------------------------- */
/* Nomes                                                                       */
/* -------------------------------------------------------------------------- */

/** "Resenha da Bia". */
export function editionTitle(edition: Pick<ResenhaEdition, "hostArticle" | "hostName">): string {
  return `Resenha ${edition.hostArticle} ${edition.hostName}`;
}

/** "RESENHA 001 — DA BIA": a numeração vira memória de quem foi na primeira. */
export function editionHeadline(edition: Pick<ResenhaEdition, "slug" | "hostArticle" | "hostName">): string {
  return `RESENHA ${edition.slug} — ${edition.hostArticle.toUpperCase()} ${edition.hostName.toUpperCase()}`;
}

export const padNumber = (number: number): string => String(number).padStart(3, "0");

/** Letras minúsculas sem acento nem símbolo, para o código do link. */
export function slugPart(text: string, max = 12): string {
  return (
    text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, max) || "insider"
  );
}

const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** manu-7k2q: o primeiro nome identifica o Insider e o sufixo evita adivinhar o link de outro. */
export function insiderCode(name: string, random: (max: number) => number): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  const suffix = Array.from({ length: 4 }, () => CODE_ALPHABET[random(CODE_ALPHABET.length)]).join("");
  return `${slugPart(first)}-${suffix}`;
}

/** Idade em anos completos no dia da festa, no horário de Brasília (23h de sábado ainda é sábado). */
export function ageAt(birthDate: string, at: Date): number {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const { y, m, d } = todayInBrasilia(at);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

/* -------------------------------------------------------------------------- */
/* Entradas validadas no servidor                                              */
/* -------------------------------------------------------------------------- */

const cleanText = (max: number) =>
  z
    .string()
    .transform((v) => v.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim())
    .pipe(z.string().max(max));

const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data de nascimento.")
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v) && d.getTime() <= Date.now() && d.getUTCFullYear() > 1900;
  }, "Data de nascimento inválida.");

const instagram = z
  .string()
  .transform((v) => v.trim().replace(/^@+/, "").toLowerCase())
  .refine((v) => v === "" || /^[a-z0-9._]{1,30}$/.test(v), "Instagram inválido. Use só o usuário, ex.: @bia");

const whatsapp = z
  .string()
  .transform(onlyDigits)
  .transform((v) => v.replace(/^55(?=\d{10,11}$)/, ""))
  .refine((v) => v === "" || v.length === 10 || v.length === 11, "WhatsApp inválido. Use DDD + número.");

export const requestInputSchema = z.object({
  code: z.string().trim().toLowerCase().min(3, "Link inválido.").max(40, "Link inválido."),
  name: cleanText(80).pipe(z.string().min(3, "Informe seu nome completo.")),
  email: z.string().trim().toLowerCase().pipe(z.email("E-mail inválido.").max(160)),
  whatsapp: whatsapp.default(""),
  instagram: instagram.default(""),
  birthDate: isoDay,
  consent: z.literal(true, { error: "Confirme que você tem 18 anos ou mais e aceite o uso dos seus dados." }),
});
export type RequestInput = z.output<typeof requestInputSchema>;

export const decisionSchema = z.object({ action: z.enum(["approve", "reject", "revoke"]) });
export type Decision = z.output<typeof decisionSchema>["action"];

export const editionInputSchema = z.object({
  hostName: cleanText(60).pipe(z.string().min(2, "Informe o nome do Host.")),
  hostArticle: z.enum(HOST_ARTICLES).default("da"),
  startsAt: z.string().refine((v) => !Number.isNaN(new Date(v).getTime()), "Informe a data e a hora."),
  endsAt: z.union([z.string().refine((v) => !Number.isNaN(new Date(v).getTime()), "Fim inválido."), z.null()]).default(null),
  venue: cleanText(120).pipe(z.string().min(2, "Informe o local.")),
  city: cleanText(120).pipe(z.string().min(2, "Informe a cidade.")),
  address: cleanText(300).default(""),
  capacity: z.union([z.coerce.number().int().min(1).max(100_000), z.null()]).default(null),
  /** Quem organiza e a política de cancelamento: exigidos para abrir a lista (evento publicado). */
  organizerName: cleanText(120).default(""),
  cancellationPolicy: cleanText(1500).default(""),
});
export type EditionInput = z.output<typeof editionInputSchema>;

const photoUrl = z
  .string()
  .trim()
  .max(2_000_000)
  .refine((v) => v === "" || /^https:\/\//.test(v) || /^data:image\/(webp|jpeg|png);base64,/.test(v), "Foto inválida. Envie uma imagem.");

export const insiderInputSchema = z.object({
  mode: z.enum(["create", "link"]).default("create"),
  name: cleanText(80).pipe(z.string().min(2, "Informe o nome do Insider.")),
  email: z.string().trim().toLowerCase().pipe(z.email("E-mail inválido.").max(160)),
  handle: instagram.default(""),
  kind: z.enum(INSIDER_KINDS).default("insider"),
  quota: z.coerce.number().int().min(0, "A cota não pode ser negativa.").max(500, "A cota máxima é 500."),
});
export type InsiderInput = z.output<typeof insiderInputSchema>;

/* -------------------------------------------------------------------------- */
/* Telas                                                                       */
/* -------------------------------------------------------------------------- */

export interface LinkStats {
  quota: number;
  approved: number;
  /** Membros do app convidados pelo Insider (cada convite ativo ocupa um PASS). */
  invited: number;
  pending: number;
  rejected: number;
  /** PASSes que ainda dá para liberar. */
  left: number;
}

export interface InsiderEditionView {
  participationId: string;
  kind: InsiderKind;
  link: string;
  stats: LinkStats;
  edition: { id: string; slug: string; title: string; headline: string; status: EditionStatus; startsAt: string; city: string; venue: string; hostName: string };
}

export interface InsiderRequestView {
  id: string;
  name: string;
  instagram: string;
  whatsapp: string;
  age: number;
  status: RequestStatus;
  createdAt: string;
  decidedAt: string | null;
  /** Já passou pela portaria. */
  checkedIn: boolean;
}

/** O que o convidado vê na página do pedido. */
export interface GuestView {
  status: RequestStatus;
  name: string;
  headline: string;
  title: string;
  insiderName: string;
  startsAt: string;
  city: string;
  /** A equipe cancelou o evento: ninguém entra, mesmo com ingresso. */
  cancelled: boolean;
  /** Só depois de liberado: endereço e QR. */
  venue: string | null;
  address: string | null;
  ticket: { code: string; qr: string; used: boolean } | null;
}

/** Cadastro do Insider no admin: nome, @, foto e login (a senha é gerada pelo sistema). */
export const insiderProfileSchema = z.object({
  name: cleanText(80).pipe(z.string().min(2, "Informe o nome do Insider.")),
  handle: instagram.default(""),
  avatarUrl: photoUrl.default(""),
});
export type InsiderProfileInput = z.output<typeof insiderProfileSchema>;
