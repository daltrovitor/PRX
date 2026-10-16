// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/security";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse, readJson } from "@/lib/partners/http";
import { firstIssue } from "@/lib/partners/types";
import { tableReady } from "@/lib/db-features";
import { getAsaasClient } from "@/lib/asaas/client";
import { BILLING_TYPES } from "@/lib/asaas/billing";
import { getSubscriptionsRepository } from "@/lib/subscriptions/repository";
import { cancelSubscription, invoicePix, memberPlans, memberSubscriptions, subscribe } from "@/lib/subscriptions/service";

const NO_STORE = { "Cache-Control": "no-store" };

/** GET /api/subscriptions — planos à venda (com a elegibilidade de quem pede), assinaturas, pagamentos e histórico. */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) throw new PartnerError("Não autenticado.", 401);
    if (!(await tableReady("subscription_plans"))) return NextResponse.json({ success: true, plans: [], subscriptions: [], paymentsOnline: false }, { headers: NO_STORE });
    const [plans, subscriptions] = await Promise.all([memberPlans(user.id), memberSubscriptions(user.id)]);
    const repo = getSubscriptionsRepository();
    const withHistory = await Promise.all(subscriptions.map(async (s) => ({ ...s, events: (await repo.listEvents(s.id)).filter((e) => e.action !== "intro_update_failed") })));
    return NextResponse.json({ success: true, plans, subscriptions: withHistory, paymentsOnline: getAsaasClient() !== null }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao carregar as assinaturas.");
  }
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("subscribe"), planId: z.string().trim().min(1).max(80), billingType: z.enum(BILLING_TYPES) }),
  z.object({ action: z.literal("cancel"), id: z.string().trim().min(1).max(80), reason: z.string().max(500).default("") }),
  z.object({ action: z.literal("pix"), id: z.string().trim().min(1).max(80), paymentId: z.string().trim().min(1).max(80) }),
]);

/**
 * POST /api/subscriptions
 *   subscribe  contrata (o servidor confere elegibilidade e devolve a fatura do Asaas)
 *   cancel     cancela as próximas cobranças, conforme a política do plano
 *   pix        QR Code / copia e cola de uma fatura em aberto
 * A assinatura só fica ativa quando o Asaas confirma o pagamento (webhook).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) throw new PartnerError("Não autenticado.", 401);
    const limit = checkRateLimit(`subscriptions:${user.id}`, 10, 60);
    if (!limit.allowed) throw new PartnerError(`Muitas tentativas. Aguarde ${limit.resetInSeconds}s.`, 429);
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 400);
    const body = parsed.data;
    const client = getAsaasClient();
    if (body.action === "subscribe") {
      const checkout = await subscribe({ id: user.id, fullName: user.fullName, email: user.email, cpf: user.cpf, phone: user.phone }, body.planId, body.billingType, client);
      return NextResponse.json({ success: true, ...checkout }, { status: 201, headers: NO_STORE });
    }
    if (body.action === "cancel") {
      const subscription = await cancelSubscription(user.id, body.id, body.reason, user.email, client);
      return NextResponse.json({ success: true, subscription }, { headers: NO_STORE });
    }
    const pix = await invoicePix(user.id, body.id, body.paymentId, client);
    return NextResponse.json({ success: true, pix }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Não foi possível concluir a assinatura.");
  }
}
