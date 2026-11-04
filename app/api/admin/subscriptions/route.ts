// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse, readJson, requireAdmin } from "@/lib/partners/http";
import { firstIssue } from "@/lib/partners/types";
import { recordAdminAction } from "@/lib/admin/audit";
import { pageParams } from "@/lib/admin/paging";
import { memberContacts } from "@/lib/admin/members";
import { getPaymentGateway } from "@/lib/billing/gateway";
import { getSubscriptionsRepository } from "@/lib/subscriptions/repository";
import { cancelSubscription, deletePlan, savePlan } from "@/lib/subscriptions/service";
import { syncSubscription } from "@/lib/subscriptions/payments";
import { SUBSCRIPTION_STATUSES } from "@/lib/subscriptions/types";

const NO_STORE = { "Cache-Control": "no-store, private" };

/**
 * GET /api/admin/subscriptions
 *   (padrão)            planos + assinantes paginados (?status=&planId=&page=)
 *   ?id=…               uma assinatura com pagamentos e histórico
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const repo = getSubscriptionsRepository();
    const params = req.nextUrl.searchParams;
    const id = params.get("id");
    if (id) {
      const sub = await repo.getSubscription(id.slice(0, 80));
      if (!sub) throw new PartnerError("Assinatura não encontrada.", 404);
      const [payments, events, contacts] = await Promise.all([repo.listPayments(sub.id), repo.listEvents(sub.id), memberContacts([sub.userId])]);
      return NextResponse.json({ success: true, subscription: { ...sub, memberName: contacts.get(sub.userId)?.name ?? "Conta excluída", memberEmail: contacts.get(sub.userId)?.email ?? "" }, payments, events }, { headers: NO_STORE });
    }
    const { page, pageSize } = pageParams(params, 25);
    const status = params.get("status") ?? "";
    const [plans, subs] = await Promise.all([
      repo.listPlans(),
      repo.listAll({ status: (SUBSCRIPTION_STATUSES as readonly string[]).includes(status) ? status : undefined, planId: (params.get("planId") ?? "").slice(0, 80) || undefined, offset: (page - 1) * pageSize, limit: pageSize }),
    ]);
    const contacts = await memberContacts(subs.items.map((s) => s.userId));
    const items = subs.items.map((s) => ({ ...s, memberName: contacts.get(s.userId)?.name ?? "Conta excluída", memberEmail: contacts.get(s.userId)?.email ?? "" }));
    return NextResponse.json({ success: true, plans, items, total: subs.total, page, pageSize, paymentsOnline: getPaymentGateway() !== null }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao carregar as assinaturas.");
  }
}

const id = z.string().trim().min(1).max(80);
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save_plan"), id: id.optional(), data: z.unknown() }),
  z.object({ action: z.literal("delete_plan"), id }),
  z.object({ action: z.literal("sync"), id }),
  z.object({ action: z.literal("cancel"), id, reason: z.string().trim().min(5, "Informe o motivo do cancelamento.").max(500) }),
]);

/**
 * POST /api/admin/subscriptions
 *   save_plan    cria ou edita um plano (o preço novo vale para novas contratações)
 *   delete_plan  exclui plano sem assinaturas
 *   sync         confere a assinatura com o provedor e corrige divergências
 *   cancel       cancela a assinatura de um membro (motivo obrigatório)
 */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 400);
    const body = parsed.data;
    const actor = admin.email || admin.sub;
    if (body.action === "save_plan") {
      const plan = await savePlan(body.data, actor, body.id);
      await recordAdminAction(admin, { action: `subscriptions.plan_${body.id ? "updated" : "created"}`, targetType: "subscription_plan", targetId: plan.id, summary: `Plano ${plan.name} (R$ ${plan.price.toFixed(2)}, ${plan.status})` }, req);
      return NextResponse.json({ success: true, plan }, { status: body.id ? 200 : 201, headers: NO_STORE });
    }
    if (body.action === "delete_plan") {
      await deletePlan(body.id);
      await recordAdminAction(admin, { action: "subscriptions.plan_deleted", targetType: "subscription_plan", targetId: body.id, summary: "Plano excluído" }, req);
      return NextResponse.json({ success: true }, { headers: NO_STORE });
    }
    const gateway = getPaymentGateway();
    if (body.action === "sync") {
      if (!gateway) throw new PartnerError("Pagamentos indisponíveis neste ambiente.", 503);
      const subscription = await syncSubscription(body.id, gateway);
      await recordAdminAction(admin, { action: "subscriptions.synced", targetType: "member_subscription", targetId: body.id, summary: `Assinatura conferida com o provedor: ${subscription?.status ?? "—"}` }, req);
      return NextResponse.json({ success: true, subscription }, { headers: NO_STORE });
    }
    const sub = await getSubscriptionsRepository().getSubscription(body.id);
    if (!sub) throw new PartnerError("Assinatura não encontrada.", 404);
    const subscription = await cancelSubscription(sub.userId, sub.id, body.reason, actor, gateway);
    await recordAdminAction(admin, { action: "subscriptions.cancelled", targetType: "member_subscription", targetId: sub.id, summary: `Assinatura cancelada pelo admin: ${body.reason}` }, req);
    return NextResponse.json({ success: true, subscription }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao salvar a assinatura.");
  }
}
