// Hello World
import { PartnerError } from "@/lib/partners/errors";
import { sendSupportReplyEmail } from "@/lib/notifications/support-reply";
import { getSupportRepository } from "@/lib/support/repository";
import type { NewTicketInput, SupportStatus, SupportTicket } from "@/lib/support/types";

/** Regras do SAC. O membro só enxerga e mexe nas próprias solicitações. */

export interface SupportMember {
  id: string;
  name: string;
  email: string;
}

const repo = () => getSupportRepository();
const MEMBER_FALLBACK = "Membro PRX";
/** Para o membro, a resposta é sempre "Equipe PRX"; o nome de quem respondeu fica no registro. */
export const TEAM_LABEL = "Equipe PRX";

async function ownTicket(member: SupportMember, id: string): Promise<SupportTicket> {
  const ticket = await repo().getTicket(id);
  if (!ticket || ticket.userId !== member.id) throw new PartnerError("Solicitação não encontrada.", 404);
  return ticket;
}

/** Visão do membro: troca o nome de quem respondeu pela assinatura da equipe. */
export function forMember(ticket: SupportTicket): SupportTicket {
  return { ...ticket, messages: ticket.messages.map((m) => (m.author === "team" ? { ...m, authorName: TEAM_LABEL } : m)) };
}

export async function openTicket(member: SupportMember, input: NewTicketInput): Promise<SupportTicket> {
  const open = (await repo().listByUser(member.id)).filter((t) => t.status !== "resolved");
  if (open.length >= 5) throw new PartnerError("Você já tem 5 solicitações em aberto. Responda ou encerre uma delas antes de abrir outra.", 429);
  const ticket = await repo().insertTicket(
    { userId: member.id, userName: member.name || MEMBER_FALLBACK, userEmail: member.email, topic: input.topic, subject: input.subject },
    { author: "member", authorName: member.name || MEMBER_FALLBACK, body: input.message }
  );
  return forMember(ticket);
}

export async function memberTickets(member: SupportMember): Promise<SupportTicket[]> {
  return (await repo().listByUser(member.id)).map(forMember);
}

/** Nova mensagem do membro reabre a solicitação (mesmo resolvida). */
export async function memberReply(member: SupportMember, id: string, body: string): Promise<SupportTicket> {
  await ownTicket(member, id);
  await repo().addMessage(id, { author: "member", authorName: member.name || MEMBER_FALLBACK, body });
  await repo().updateTicket(id, { status: "open", resolvedAt: null });
  return forMember((await repo().getTicket(id))!);
}

export async function memberResolve(member: SupportMember, id: string): Promise<SupportTicket> {
  const ticket = await ownTicket(member, id);
  if (ticket.status !== "resolved") await repo().updateTicket(id, { status: "resolved", resolvedAt: new Date().toISOString() });
  return forMember((await repo().getTicket(id))!);
}

export async function adminTickets(filter: { status?: SupportStatus; page: number }): Promise<{ items: SupportTicket[]; total: number }> {
  const limit = 30;
  return repo().list({ status: filter.status, offset: Math.max(0, filter.page) * limit, limit });
}

/**
 * Resposta e/ou mudança de status pela equipe. Respondeu sem escolher status:
 * "Respondido" (aguarda o membro). O membro recebe um aviso por e-mail.
 */
export async function adminAct(admin: { name: string; email: string }, input: { id: string; reply?: string; status?: SupportStatus }): Promise<SupportTicket> {
  const ticket = await repo().getTicket(input.id);
  if (!ticket) throw new PartnerError("Solicitação não encontrada.", 404);
  const reply = input.reply?.trim();
  if (!reply && !input.status) throw new PartnerError("Escreva a resposta ou escolha o novo status.", 400);

  const message = reply ? await repo().addMessage(ticket.id, { author: "team", authorName: admin.name || admin.email || TEAM_LABEL, body: reply }) : null;
  const status = input.status ?? (reply ? "answered" : ticket.status);
  await repo().updateTicket(ticket.id, { status, resolvedAt: status === "resolved" ? new Date().toISOString() : null });

  if (message && ticket.userEmail) {
    await sendSupportReplyEmail({ userId: ticket.userId, email: ticket.userEmail, name: ticket.userName, protocol: ticket.protocol, subject: ticket.subject, messageId: message.id });
  }
  return (await repo().getTicket(ticket.id))!;
}
