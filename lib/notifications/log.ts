// Hello World
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/client";
import { isMissingTable } from "@/lib/partners/errors";
import type { DeliveryRecord, DeliveryResult, NotificationChannel, NotificationTemplate } from "@/lib/notifications/types";

/*
 * Registro de envios (tabela notification_log, só service role; memória no
 * desenvolvimento). Guarda o destinatário mascarado e o resultado, nunca o
 * conteúdo nem o código. Falha aqui só vira aviso no log: nunca interrompe o envio.
 */

interface LogInput {
  userId: string | null;
  channel: NotificationChannel;
  template: NotificationTemplate;
  recipient: string;
  result: DeliveryResult;
}

const MEMORY_LIMIT = 200;
const globalState = globalThis as unknown as { __prxNotificationLog?: DeliveryRecord[]; __prxNotificationLogWarned?: boolean };
const memory = () => (globalState.__prxNotificationLog ??= []);

function toRecord(input: LogInput): DeliveryRecord {
  const { result } = input;
  return {
    id: crypto.randomUUID(),
    userId: input.userId,
    channel: input.channel,
    template: input.template,
    recipient: input.recipient,
    status: result.status,
    provider: result.status === "sent" || result.status === "failed" ? result.provider : null,
    providerId: result.status === "sent" ? result.providerId : null,
    error: result.status === "failed" ? result.error : result.status === "skipped" ? result.reason : null,
    createdAt: new Date().toISOString(),
  };
}

export async function recordDelivery(input: LogInput): Promise<DeliveryRecord> {
  const record = toRecord(input);
  if (record.status === "failed") console.warn(`[notifications] ${record.channel}/${record.template} falhou para ${record.recipient}: ${record.error}`);
  // Produção sem chave do provedor: o envio é pulado em silêncio, então o log do servidor avisa.
  if (record.status === "skipped") console.warn(`[notifications] ${record.channel}/${record.template} não enviado para ${record.recipient}: ${record.error}`);

  if (!supabaseAdmin) {
    const list = memory();
    list.unshift(record);
    list.length = Math.min(list.length, MEMORY_LIMIT);
    return record;
  }

  try {
    const { error } = await supabaseAdmin.from("notification_log").insert({
      id: record.id,
      user_id: record.userId,
      channel: record.channel,
      template: record.template,
      recipient: record.recipient,
      status: record.status,
      provider: record.provider,
      provider_id: record.providerId,
      error: record.error,
      created_at: record.createdAt,
    });
    if (error && !(isMissingTable(error) && globalState.__prxNotificationLogWarned)) {
      if (isMissingTable(error)) globalState.__prxNotificationLogWarned = true;
      console.warn("[notifications] registro de envio não gravado:", error.code, error.message);
    }
  } catch {
    // Registro é auditoria: sem ele o envio continua valendo.
  }
  return record;
}

/** Últimos envios em memória (desenvolvimento e testes). */
export function memoryDeliveries(): readonly DeliveryRecord[] {
  return memory();
}

export function resetNotificationMemory(): void {
  delete globalState.__prxNotificationLog;
}

/** Últimos envios para o painel admin (Supabase ou memória). */
export async function recentDeliveries(limit = 50): Promise<DeliveryRecord[]> {
  if (!supabaseAdmin) return memory().slice(0, limit);
  const { data, error } = await supabaseAdmin.from("notification_log").select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) {
    if (!isMissingTable(error)) console.warn("[notifications] falha ao listar envios:", error.code, error.message);
    return [];
  }
  return ((data ?? []) as LogRow[]).map((r) => ({
    id: r.id,
    userId: r.user_id,
    channel: r.channel,
    template: r.template,
    recipient: r.recipient,
    status: r.status,
    provider: r.provider,
    providerId: r.provider_id,
    error: r.error,
    createdAt: r.created_at,
  }));
}

interface LogRow {
  id: string;
  user_id: string | null;
  channel: DeliveryRecord["channel"];
  template: DeliveryRecord["template"];
  recipient: string;
  status: DeliveryRecord["status"];
  provider: DeliveryRecord["provider"];
  provider_id: string | null;
  error: string | null;
  created_at: string;
}
