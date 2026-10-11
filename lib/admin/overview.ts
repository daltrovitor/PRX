// Hello World
import { supabaseAdmin } from "@/lib/supabase/client";
import { userStore } from "@/lib/auth";
import { passStore } from "@/lib/pass-store";
import { isRegisteredMember } from "@/lib/members";
import { launchSchemaReady } from "@/lib/db-features";
import { getLiveRepository } from "@/lib/live/repository";
import { getPartnerRepository } from "@/lib/partners/repository";
import { eventHasEnded } from "@/lib/live/rules";

/**
 * Visão geral do admin: números contados no banco (count/head), sem carregar
 * tabelas inteiras no navegador. Receita do LIVE: só ingressos pagos e
 * confirmados (nunca teste), nos últimos 30 dias.
 */

export interface AdminOverview {
  members: { total: number; last7d: number; last30d: number };
  partners: { active: number };
  vouchers: { valid: number; used: number };
  live: { upcomingEvents: number; ticketsConfirmed30d: number; pendingPayment30d: number; revenue30d: number };
  waitlist: number;
  generatedAt: string;
}

const DAY = 86_400_000;

const n = async (query: PromiseLike<{ count: number | null }>) => (await query).count ?? 0;

/** Membros contados no banco (view do diretório, ou profiles antes da migração). */
function memberCount(directory: boolean, since?: string): Promise<number> {
  const db = supabaseAdmin!;
  if (directory) {
    const query = db.from("admin_member_directory").select("id", { count: "exact", head: true }).eq("is_member", true);
    return n(since ? query.gte("created_at", since) : query);
  }
  const query = db.from("profiles").select("id", { count: "exact", head: true }).or("role.neq.user,cpf.not.is.null");
  return n(since ? query.gte("created_at", since) : query);
}

export async function adminOverview(now = Date.now()): Promise<AdminOverview> {
  const since7 = new Date(now - 7 * DAY).toISOString();
  const since30 = new Date(now - 30 * DAY).toISOString();
  const live = getLiveRepository();
  const events = await live.listEvents({ statuses: ["published"] });
  const upcomingEvents = events.filter((e) => !eventHasEnded(e, new Date(now))).length;
  const partners = (await getPartnerRepository().listPartners()).filter((p) => p.status === "ATIVO").length;

  if (!supabaseAdmin) {
    const members = userStore.getAllUsers().filter((u) => isRegisteredMember({ role: u.role, cpf: u.cpf }));
    const vouchers = passStore.getVouchers();
    const tickets = (await live.listTickets({})).filter((t) => !t.isTest && t.createdAt >= since30);
    const confirmed = tickets.filter((t) => t.status === "valid" || t.status === "used");
    return {
      members: { total: members.length, last7d: members.filter((u) => u.createdAt >= since7).length, last30d: members.filter((u) => u.createdAt >= since30).length },
      partners: { active: partners },
      vouchers: { valid: vouchers.filter((v) => v.status === "valid").length, used: vouchers.filter((v) => v.status === "used").length },
      live: {
        upcomingEvents,
        ticketsConfirmed30d: confirmed.length,
        pendingPayment30d: tickets.filter((t) => t.status === "pending_payment").length,
        revenue30d: Math.round(confirmed.filter((t) => t.source === "purchase").reduce((s, t) => s + t.price, 0) * 100) / 100,
      },
      waitlist: 0,
      generatedAt: new Date(now).toISOString(),
    };
  }

  const directory = await launchSchemaReady();
  const db = supabaseAdmin;
  const [total, last7d, last30d, valid, used, waitlist] = await Promise.all([
    memberCount(directory),
    memberCount(directory, since7),
    memberCount(directory, since30),
    n(db.from("vouchers").select("id", { count: "exact", head: true }).eq("status", "valid")),
    n(db.from("vouchers").select("id", { count: "exact", head: true }).eq("status", "used")),
    n(db.from("waitlist_signups").select("id", { count: "exact", head: true })),
  ]);

  let ticketQuery = supabaseAdmin.from("live_tickets").select("price, status, source").gte("created_at", since30).limit(20_000);
  if (directory) ticketQuery = ticketQuery.eq("is_test", false);
  const { data: rows } = await ticketQuery;
  const tickets = (rows ?? []) as Array<{ price: number | string; status: string; source: string }>;
  const confirmed = tickets.filter((t) => t.status === "valid" || t.status === "used");

  return {
    members: { total, last7d, last30d },
    partners: { active: partners },
    vouchers: { valid, used },
    live: {
      upcomingEvents,
      ticketsConfirmed30d: confirmed.length,
      pendingPayment30d: tickets.filter((t) => t.status === "pending_payment").length,
      revenue30d: Math.round(confirmed.filter((t) => t.source === "purchase").reduce((s, t) => s + Number(t.price), 0) * 100) / 100,
    },
    waitlist,
    generatedAt: new Date(now).toISOString(),
  };
}
