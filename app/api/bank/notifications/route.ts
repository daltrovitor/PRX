// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { familyErrorResponse, invalid, requireUser } from "@/lib/family/http";
import { asaasActiveFor, asaasDeps } from "@/lib/bank/asaas/deps";
import { currentSubaccount, sinceSubaccount } from "@/lib/bank/asaas/subaccount";
import { getAsaasBankStore } from "@/lib/bank/asaas/store";

const NO_STORE = { "Cache-Control": "no-store" };

/** GET /api/bank/notifications — avisos do PRX BANK (Pix recebido, enviado, contas, aprovação da conta). */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    if (!asaasActiveFor(user.id)) return NextResponse.json({ notices: [], unread: 0 }, { headers: NO_STORE });
    const deps = asaasDeps();
    const sub = await currentSubaccount(user.id, deps);
    // Avisos do sandbox (antes da subconta deste ambiente) não aparecem.
    const list = sub ? (await deps.store.listNotifications(user.id, 20)).filter((n) => sinceSubaccount(sub, n.createdAt)) : [];
    const notices = list.map((n) => ({ id: n.id, eventType: n.eventType, title: n.title, body: n.body, amount: n.amount, read: Boolean(n.readAt), createdAt: n.createdAt }));
    return NextResponse.json({ notices, unread: notices.filter((n) => !n.read).length }, { headers: NO_STORE });
  } catch (error) {
    return familyErrorResponse(error, "Não foi possível carregar os avisos.");
  }
}

const schema = z.object({ ids: z.array(z.string().min(1).max(64)).max(50).optional() });

/** POST /api/bank/notifications — marca como lidos ({ ids } ou todos). */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) invalid(parsed.error.issues);
    if (asaasActiveFor(user.id)) await getAsaasBankStore().markNotificationsRead(user.id, parsed.data.ids ?? "all");
    return NextResponse.json({ success: true }, { headers: NO_STORE });
  } catch (error) {
    return familyErrorResponse(error, "Não foi possível atualizar os avisos.");
  }
}
