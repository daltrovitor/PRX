// Hello World
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/client";
import { dbError } from "@/lib/partners/errors";
import { requireTable } from "@/lib/db-features";
import {
  SUPPORT_MIGRATION,
  SUPPORT_STATUSES,
  SUPPORT_TOPICS,
  makeProtocol,
  type SupportAuthor,
  type SupportMessage,
  type SupportStatus,
  type SupportTicket,
  type SupportTopic,
} from "@/lib/support/types";

/** Persistência do SAC: Supabase (support_tickets + support_messages) ou memória no desenvolvimento. */

export type NewTicket = Pick<SupportTicket, "userId" | "userName" | "userEmail" | "topic" | "subject">;
export type NewMessage = { author: SupportAuthor; authorName: string; body: string };
export type TicketPatch = { status: SupportStatus; resolvedAt?: string | null };

export interface SupportRepository {
  insertTicket(ticket: NewTicket, first: NewMessage): Promise<SupportTicket>;
  getTicket(id: string): Promise<SupportTicket | null>;
  listByUser(userId: string): Promise<SupportTicket[]>;
  list(filter: { status?: SupportStatus; offset: number; limit: number }): Promise<{ items: SupportTicket[]; total: number }>;
  addMessage(ticketId: string, message: NewMessage): Promise<SupportMessage>;
  updateTicket(id: string, patch: TicketPatch): Promise<void>;
}

type Row = Record<string, unknown>;
const now = () => new Date().toISOString();
const protocol = () => makeProtocol(new Date(), (n) => crypto.randomInt(n));
const asTopic = (v: unknown): SupportTopic => ((SUPPORT_TOPICS as readonly string[]).includes(String(v)) ? (v as SupportTopic) : "outro");
const asStatus = (v: unknown): SupportStatus => ((SUPPORT_STATUSES as readonly string[]).includes(String(v)) ? (v as SupportStatus) : "open");

function mapMessage(r: Row): SupportMessage {
  return {
    id: String(r.id),
    ticketId: String(r.ticket_id),
    author: r.author === "team" ? "team" : "member",
    authorName: String(r.author_name ?? ""),
    body: String(r.body ?? ""),
    createdAt: String(r.created_at),
  };
}

function mapTicket(r: Row, messages: SupportMessage[]): SupportTicket {
  return {
    id: String(r.id),
    protocol: String(r.protocol),
    userId: String(r.user_id),
    userName: String(r.user_name ?? ""),
    userEmail: String(r.user_email ?? ""),
    topic: asTopic(r.topic),
    subject: String(r.subject ?? ""),
    status: asStatus(r.status),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at ?? r.created_at),
    resolvedAt: (r.resolved_at as string | null) ?? null,
    messages,
  };
}

function supabaseRepo(): SupportRepository {
  const db = supabaseAdmin!;
  const need = () => requireTable("support_tickets", SUPPORT_MIGRATION);

  async function withMessages(rows: Row[]): Promise<SupportTicket[]> {
    if (rows.length === 0) return [];
    const { data, error } = await db
      .from("support_messages")
      .select("*")
      .in("ticket_id", rows.map((r) => String(r.id)))
      .order("created_at", { ascending: true });
    if (error) throw dbError(error, "Não foi possível ler as mensagens do atendimento");
    const byTicket = new Map<string, SupportMessage[]>();
    ((data ?? []) as Row[]).map(mapMessage).forEach((m) => byTicket.set(m.ticketId, [...(byTicket.get(m.ticketId) ?? []), m]));
    return rows.map((r) => mapTicket(r, byTicket.get(String(r.id)) ?? []));
  }

  const repo: SupportRepository = {
    async insertTicket(ticket, first) {
      await need();
      // Protocolo repetido (raríssimo): tenta outro.
      for (let attempt = 0; ; attempt++) {
        const { data, error } = await db
          .from("support_tickets")
          .insert({ protocol: protocol(), user_id: ticket.userId, user_name: ticket.userName, user_email: ticket.userEmail, topic: ticket.topic, subject: ticket.subject })
          .select("*")
          .single();
        if (error?.code === "23505" && attempt < 3) continue;
        if (error) throw dbError(error, "Não foi possível abrir a solicitação");
        const row = data as Row;
        await repo.addMessage(String(row.id), first);
        return (await repo.getTicket(String(row.id)))!;
      }
    },
    async getTicket(id) {
      await need();
      const { data, error } = await db.from("support_tickets").select("*").eq("id", id).maybeSingle();
      if (error?.code === "22P02") return null;
      if (error) throw dbError(error, "Não foi possível ler a solicitação");
      return data ? (await withMessages([data as Row]))[0] : null;
    },
    async listByUser(userId) {
      await need();
      const { data, error } = await db.from("support_tickets").select("*").eq("user_id", userId).order("updated_at", { ascending: false }).limit(50);
      if (error) throw dbError(error, "Não foi possível listar suas solicitações");
      return withMessages((data ?? []) as Row[]);
    },
    async list({ status, offset, limit }) {
      await need();
      let q = db.from("support_tickets").select("*", { count: "exact" }).order("updated_at", { ascending: false }).range(offset, offset + limit - 1);
      if (status) q = q.eq("status", status);
      const { data, error, count } = await q;
      if (error) throw dbError(error, "Não foi possível listar o atendimento");
      return { items: await withMessages((data ?? []) as Row[]), total: count ?? 0 };
    },
    async addMessage(ticketId, message) {
      await need();
      const { data, error } = await db
        .from("support_messages")
        .insert({ ticket_id: ticketId, author: message.author, author_name: message.authorName, body: message.body })
        .select("*")
        .single();
      if (error) throw dbError(error, "Não foi possível enviar a mensagem");
      return mapMessage(data as Row);
    },
    async updateTicket(id, patch) {
      await need();
      const row: Row = { status: patch.status, updated_at: now() };
      if (patch.resolvedAt !== undefined) row.resolved_at = patch.resolvedAt;
      const { error } = await db.from("support_tickets").update(row).eq("id", id);
      if (error) throw dbError(error, "Não foi possível atualizar a solicitação");
    },
  };
  return repo;
}

interface MemoryState {
  tickets: Omit<SupportTicket, "messages">[];
  messages: SupportMessage[];
}
const state = (): MemoryState => ((globalThis as unknown as { __prxSupport?: MemoryState }).__prxSupport ??= { tickets: [], messages: [] });
const full = (t: Omit<SupportTicket, "messages">): SupportTicket => structuredClone({ ...t, messages: state().messages.filter((m) => m.ticketId === t.id) });
const byRecent = (a: { updatedAt: string }, b: { updatedAt: string }) => b.updatedAt.localeCompare(a.updatedAt);

const memoryRepo: SupportRepository = {
  async insertTicket(ticket, first) {
    const at = now();
    const created = { ...ticket, id: crypto.randomUUID(), protocol: protocol(), status: "open" as const, createdAt: at, updatedAt: at, resolvedAt: null };
    state().tickets.push(created);
    await memoryRepo.addMessage(created.id, first);
    return full(created);
  },
  async getTicket(id) {
    const t = state().tickets.find((x) => x.id === id);
    return t ? full(t) : null;
  },
  async listByUser(userId) {
    return state().tickets.filter((t) => t.userId === userId).sort(byRecent).slice(0, 50).map(full);
  },
  async list({ status, offset, limit }) {
    const all = state().tickets.filter((t) => !status || t.status === status).sort(byRecent);
    return { items: all.slice(offset, offset + limit).map(full), total: all.length };
  },
  async addMessage(ticketId, message) {
    const created: SupportMessage = { ...message, id: crypto.randomUUID(), ticketId, createdAt: now() };
    state().messages.push(created);
    return structuredClone(created);
  },
  async updateTicket(id, patch) {
    const t = state().tickets.find((x) => x.id === id);
    if (!t) return;
    t.status = patch.status;
    t.updatedAt = now();
    if (patch.resolvedAt !== undefined) t.resolvedAt = patch.resolvedAt;
  },
};

export function getSupportRepository(): SupportRepository {
  return supabaseAdmin ? supabaseRepo() : memoryRepo;
}

/** Só para testes. */
export function resetSupportMemory(): void {
  (globalThis as unknown as { __prxSupport?: MemoryState }).__prxSupport = { tickets: [], messages: [] };
}
