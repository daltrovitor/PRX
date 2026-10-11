// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/security";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse, readJson } from "@/lib/partners/http";
import { firstIssue } from "@/lib/partners/types";
import { cancelOwnTicket, listPublicEvents, memberWallet, quoteTicket, reserveTicket } from "@/lib/live/service";

const NO_STORE = { "Cache-Control": "no-store" };

/** GET /api/live — vitrine de eventos e a carteira do membro (ingressos, inscrições, startups). */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) throw new PartnerError("Não autenticado.", 401);
    const [events, wallet] = await Promise.all([listPublicEvents(), memberWallet(user)]);
    return NextResponse.json({ success: true, events, wallet }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao carregar o PRX LIVE.");
  }
}

// Só o código do cupom vem do navegador: preço e desconto são sempre calculados no servidor.
const purchase = {
  eventId: z.string().min(1).max(100),
  batchId: z.string().min(1).max(40),
  promoCode: z.string().max(40).optional(),
  birthDate: z.string().max(10).optional(),
};

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("quote"), ...purchase }),
  z.object({ action: z.literal("reserve"), ...purchase, run: z.unknown().optional() }),
  z.object({ action: z.literal("cancel"), ticketId: z.string().min(1).max(100) }),
]);

/**
 * POST /api/live
 *   { action: "quote", eventId, batchId, promoCode? }                resumo: original, desconto, total e a regra de idade
 *   { action: "reserve", eventId, batchId, promoCode?, birthDate?, run? }  gratuito sai válido; pago vira reserva aguardando pagamento
 *   { action: "cancel", ticketId }                                  desiste da reserva (ou do ingresso gratuito)
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) throw new PartnerError("Faça login para garantir seu ingresso.", 401);
    const limit = checkRateLimit(`live:${user.id}`, 20, 60);
    if (!limit.allowed) throw new PartnerError(`Muitas tentativas. Aguarde ${limit.resetInSeconds}s.`, 429);

    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 400);
    const body = parsed.data;

    if (body.action === "quote") {
      const quote = await quoteTicket(user, { eventId: body.eventId, batchId: body.batchId, promoCode: body.promoCode });
      return NextResponse.json({ success: true, quote }, { headers: NO_STORE });
    }
    if (body.action === "cancel") {
      await cancelOwnTicket(user, body.ticketId);
    } else {
      const ticket = await reserveTicket(user, { eventId: body.eventId, batchId: body.batchId, run: body.run, promoCode: body.promoCode, birthDate: body.birthDate });
      const wallet = await memberWallet(user);
      return NextResponse.json({ success: true, ticket, wallet }, { status: 201, headers: NO_STORE });
    }
    return NextResponse.json({ success: true, wallet: await memberWallet(user) }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao processar a ação no PRX LIVE.");
  }
}
