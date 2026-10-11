// Hello World
import { supabaseAdmin } from "@/lib/supabase/client";
import { passStore } from "@/lib/pass-store";
import { isUuid } from "@/lib/partners/catalog";
import { getLiveRepository } from "@/lib/live/repository";
import { purchaseCode } from "@/lib/live/rules";
import { TICKET_STATUS_LABEL } from "@/lib/live/types";

/**
 * Histórico de uma conta para o admin: vouchers do PASS e ingressos do LIVE
 * (compras, convites, entradas), os mais recentes primeiro e com limite.
 */

export interface ActivityVoucher {
  id: string;
  code: string;
  partnerName: string;
  benefitTitle: string;
  status: string;
  createdAt: string | null;
  validatedAt: string | null;
}

export interface ActivityTicket {
  id: string;
  code: string;
  purchaseCode: string;
  eventTitle: string;
  batchName: string;
  price: number;
  discount: number;
  status: string;
  statusLabel: string;
  source: string;
  createdAt: string;
  checkedInAt: string | null;
}

const LIMIT = 100;

export async function memberActivity(userId: string): Promise<{ vouchers: ActivityVoucher[]; tickets: ActivityTicket[] }> {
  let vouchers: ActivityVoucher[] = [];
  if (supabaseAdmin && isUuid(userId)) {
    const { data } = await supabaseAdmin
      .from("vouchers")
      .select("id, code, partner_name, benefit_title, status, created_at, redeemed_at, validated_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    vouchers = (data ?? []).map((v) => ({
      id: String(v.id),
      code: String(v.code),
      partnerName: String(v.partner_name ?? ""),
      benefitTitle: String(v.benefit_title ?? ""),
      status: String(v.status),
      createdAt: (v.redeemed_at as string | null) ?? (v.created_at as string | null) ?? null,
      validatedAt: (v.validated_at as string | null) ?? null,
    }));
  } else {
    vouchers = passStore
      .getUserVouchers(userId)
      .slice(0, LIMIT)
      .map((v) => ({ id: v.id, code: v.code, partnerName: v.partnerName, benefitTitle: v.benefitTitle, status: v.status, createdAt: v.createdAtIso ?? null, validatedAt: v.validatedAtIso ?? null }));
  }

  const repo = getLiveRepository();
  const tickets = (await repo.listTickets({ userId, limit: LIMIT })).filter((t) => !t.isTest);
  const titles = new Map<string, string>();
  for (const id of new Set(tickets.map((t) => t.eventId))) titles.set(id, (await repo.getEvent(id))?.title ?? "Evento removido");
  return {
    vouchers,
    tickets: tickets.map((t) => ({
      id: t.id,
      code: t.code,
      purchaseCode: purchaseCode(t.id),
      eventTitle: titles.get(t.eventId) ?? "",
      batchName: t.batchName,
      price: t.price,
      discount: t.discount,
      status: t.status,
      statusLabel: TICKET_STATUS_LABEL[t.status],
      source: t.source,
      createdAt: t.createdAt,
      checkedInAt: t.checkedInAt,
    })),
  };
}
