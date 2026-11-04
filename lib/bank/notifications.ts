// Hello World
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/client";
import { dbError } from "@/lib/partners/errors";
import { isUuid } from "@/lib/partners/catalog";
import { sendPushToUser } from "@/lib/push/send";

/**
 * Avisos do PRX BANK (sino e toast do app): Pix recebido e enviado, conta
 * aprovada, revisão de identidade. Tabela bank_notifications (Supabase); em
 * desenvolvimento, memória. Independe do banco parceiro: qualquer provedor
 * (webhook) ou a própria PRX (revisão de identidade) grava por aqui.
 * Aviso repetido (mesmo eventId) é ignorado e todo aviso novo vai também ao celular.
 */

export interface BankNotification {
  id: string;
  userId: string;
  eventType: string;
  title: string;
  body: string;
  amount: number | null;
  readAt: string | null;
  createdAt: string;
}

export type NewNotification = Pick<BankNotification, "userId" | "eventType" | "title" | "body" | "amount"> & { eventId: string | null };

export interface BankNotificationStore {
  /** false quando o aviso daquele evento já existia. */
  insertNotification(input: NewNotification): Promise<boolean>;
  listNotifications(userId: string, limit: number): Promise<BankNotification[]>;
  markNotificationsRead(userId: string, ids: string[] | "all"): Promise<void>;
}

const roundMoney = (value: unknown): number => Math.round(Number(value ?? 0) * 100) / 100;

interface NotificationRow {
  id: string;
  user_id: string;
  event_type: string;
  title: string;
  body: string;
  amount: number | string | null;
  read_at: string | null;
  created_at: string;
}

function mapNotification(r: NotificationRow): BankNotification {
  return {
    id: r.id,
    userId: r.user_id,
    eventType: r.event_type,
    title: r.title,
    body: r.body,
    amount: r.amount === null ? null : roundMoney(r.amount),
    readAt: r.read_at,
    createdAt: r.created_at,
  };
}

class MemoryNotificationStore implements BankNotificationStore {
  private static instance: MemoryNotificationStore | null = null;
  static shared(): MemoryNotificationStore {
    return (MemoryNotificationStore.instance ??= new MemoryNotificationStore());
  }

  private notifications: Array<BankNotification & { eventId: string | null }> = [];

  async insertNotification(input: NewNotification) {
    if (input.eventId && this.notifications.some((n) => n.eventId === input.eventId)) return false;
    this.notifications.unshift({
      id: crypto.randomUUID(),
      userId: input.userId,
      eventType: input.eventType,
      title: input.title.slice(0, 160),
      body: input.body.slice(0, 300),
      amount: input.amount,
      eventId: input.eventId,
      readAt: null,
      createdAt: new Date().toISOString(),
    });
    return true;
  }

  async listNotifications(userId: string, limit: number) {
    return this.notifications
      .filter((n) => n.userId === userId)
      .slice(0, limit)
      .map((n) => ({ id: n.id, userId: n.userId, eventType: n.eventType, title: n.title, body: n.body, amount: n.amount, readAt: n.readAt, createdAt: n.createdAt }));
  }

  async markNotificationsRead(userId: string, ids: string[] | "all") {
    const now = new Date().toISOString();
    for (const n of this.notifications) {
      if (n.userId === userId && !n.readAt && (ids === "all" || ids.includes(n.id))) n.readAt = now;
    }
  }
}

type Db = NonNullable<typeof supabaseAdmin>;

class SupabaseNotificationStore implements BankNotificationStore {
  constructor(private readonly db: Db) {}

  async insertNotification(input: NewNotification) {
    const { error } = await this.db.from("bank_notifications").insert({
      user_id: input.userId,
      event_type: input.eventType,
      title: input.title.slice(0, 160),
      body: input.body.slice(0, 300),
      amount: input.amount,
      event_id: input.eventId,
    });
    if (!error) return true;
    if (error.code === "23505") return false;
    throw dbError(error, "Não foi possível registrar o aviso");
  }

  async listNotifications(userId: string, limit: number) {
    if (!isUuid(userId)) return [];
    const { data, error } = await this.db.from("bank_notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
    if (error) throw dbError(error, "Não foi possível carregar os avisos");
    return (data as NotificationRow[]).map(mapNotification);
  }

  async markNotificationsRead(userId: string, ids: string[] | "all") {
    let query = this.db.from("bank_notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null);
    if (ids !== "all") query = query.in("id", ids.filter(isUuid));
    const { error } = await query;
    if (error) throw dbError(error, "Não foi possível marcar os avisos como lidos");
  }
}

/** Todo aviso novo também vai para o celular; aviso repetido não notifica de novo. */
function withPhonePush(store: BankNotificationStore): BankNotificationStore {
  return {
    async insertNotification(input) {
      const fresh = await store.insertNotification(input);
      if (fresh) await sendPushToUser(input.userId, { title: input.title, body: input.body, url: "/#bank", tag: `bank-${input.eventId}` });
      return fresh;
    },
    listNotifications: (userId, limit) => store.listNotifications(userId, limit),
    markNotificationsRead: (userId, ids) => store.markNotificationsRead(userId, ids),
  };
}

let override: BankNotificationStore | null = null;

/** Supabase em produção; memória em desenvolvimento e nos testes. */
export function getBankNotificationStore(): BankNotificationStore {
  if (override) return override;
  return withPhonePush(supabaseAdmin ? new SupabaseNotificationStore(supabaseAdmin) : MemoryNotificationStore.shared());
}

/** Só para testes: troca o armazenamento. */
export function setBankNotificationStoreForTests(store: BankNotificationStore | null): void {
  override = store;
}
