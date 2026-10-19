// Hello World
import { z } from "zod";

/**
 * SAC PRX: o membro abre uma solicitação no app, recebe um número de protocolo
 * na hora e acompanha a conversa com a equipe. A equipe responde pelo admin e
 * o membro é avisado por e-mail. Mensagens são texto puro.
 */

export const SUPPORT_MIGRATION = "20261018_prx_atendimento.sql";

export const SUPPORT_TOPICS = ["conta", "pass", "bank", "live", "pagamentos", "privacidade", "outro"] as const;
export type SupportTopic = (typeof SUPPORT_TOPICS)[number];
export const SUPPORT_TOPIC_LABEL: Record<SupportTopic, string> = {
  conta: "Conta e acesso",
  pass: "PRX PASS, benefícios e vouchers",
  bank: "PRX BANK",
  live: "Ingressos e eventos",
  pagamentos: "Pagamentos e assinaturas",
  privacidade: "Privacidade e dados pessoais",
  outro: "Outro assunto",
};

/** aberto → em atendimento → respondido (aguarda o membro) → resolvido. Nova mensagem do membro reabre. */
export const SUPPORT_STATUSES = ["open", "in_progress", "answered", "resolved"] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];
export const SUPPORT_STATUS_LABEL: Record<SupportStatus, string> = {
  open: "Aberto",
  in_progress: "Em atendimento",
  answered: "Respondido",
  resolved: "Resolvido",
};

export type SupportAuthor = "member" | "team";

export interface SupportMessage {
  id: string;
  ticketId: string;
  author: SupportAuthor;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  protocol: string;
  userId: string;
  userName: string;
  userEmail: string;
  topic: SupportTopic;
  subject: string;
  status: SupportStatus;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  messages: SupportMessage[];
}

const body = z.string().trim().min(10, "Conte com um pouco mais de detalhe (mínimo de 10 caracteres).").max(4000, "Mensagem muito longa (máximo de 4.000 caracteres).");

export const newTicketSchema = z.object({
  topic: z.enum(SUPPORT_TOPICS, { error: "Escolha o assunto." }),
  subject: z.string().trim().min(3, "Resuma o pedido em poucas palavras.").max(120),
  message: body,
});
export type NewTicketInput = z.output<typeof newTicketSchema>;

export const memberActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("open"), ticket: newTicketSchema }),
  z.object({ action: z.literal("reply"), id: z.string().trim().min(1).max(80), message: body }),
  z.object({ action: z.literal("resolve"), id: z.string().trim().min(1).max(80) }),
]);

export const adminActionSchema = z.object({
  id: z.string().trim().min(1).max(80),
  reply: z.string().trim().max(4000).optional(),
  status: z.enum(SUPPORT_STATUSES).optional(),
});

/** Protocolo legível e único: PRX-AAAAMMDD-XXXXXX (data de Brasília + 6 caracteres sem ambiguidade). */
export function makeProtocol(now: Date, random: (n: number) => number): string {
  const day = now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).replace(/-/g, "");
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const suffix = Array.from({ length: 6 }, () => alphabet[random(alphabet.length)]).join("");
  return `PRX-${day}-${suffix}`;
}
