// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/security";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse, readJson } from "@/lib/partners/http";
import { firstIssue } from "@/lib/partners/types";
import { getAsaasClient } from "@/lib/asaas/client";
import { CHECKOUT_METHODS } from "@/lib/live/promo";
import { cancelCheckout, checkoutState, startCheckout } from "@/lib/checkout/service";

const NO_STORE = { "Cache-Control": "no-store" };

/** GET /api/live/checkout?ticketId= — formas de pagamento com o preço de cada uma (servidor), liberação do responsável e o pedido em aberto. */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) throw new PartnerError("Não autenticado.", 401);
    const ticketId = (req.nextUrl.searchParams.get("ticketId") ?? "").slice(0, 80);
    if (!ticketId) throw new PartnerError("Ingresso não informado.", 400);
    return NextResponse.json({ success: true, ...(await checkoutState(user.id, ticketId, getAsaasClient())) }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao carregar o pagamento.");
  }
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), ticketId: z.string().trim().min(1).max(80), method: z.enum(CHECKOUT_METHODS) }),
  z.object({ action: z.literal("cancel"), ticketId: z.string().trim().min(1).max(80) }),
]);

/**
 * POST /api/live/checkout
 *   start   cria (ou devolve) a cobrança da forma escolhida; o preço é recalculado aqui
 *   cancel  cancela a cobrança em aberto (a reserva é cancelada pela rota do ingresso)
 * O ingresso só fica válido quando o Asaas confirma o pagamento (webhook).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) throw new PartnerError("Não autenticado.", 401);
    const limit = checkRateLimit(`checkout:${user.id}`, 15, 60);
    if (!limit.allowed) throw new PartnerError(`Muitas tentativas. Aguarde ${limit.resetInSeconds}s.`, 429);
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 400);
    const body = parsed.data;
    const client = getAsaasClient();
    if (body.action === "cancel") {
      await cancelCheckout(user.id, body.ticketId, client);
      return NextResponse.json({ success: true }, { headers: NO_STORE });
    }
    const result = await startCheckout({ id: user.id, fullName: user.fullName, email: user.email, cpf: user.cpf, phone: user.phone }, body.ticketId, body.method, client);
    return NextResponse.json({ success: true, ...result }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Não foi possível iniciar o pagamento.");
  }
}
