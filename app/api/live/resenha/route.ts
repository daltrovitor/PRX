// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/security";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse, readJson } from "@/lib/partners/http";
import { firstIssue } from "@/lib/partners/types";
import { memberResenhas } from "@/lib/resenha/invites";
import { memberResenhaCatalog, requestInvite } from "@/lib/resenha/invite-requests";

const NO_STORE = { "Cache-Control": "no-store" };
const requestSchema = z.object({ link: z.string().trim().min(1, "Escolha um Insider.").max(80) });

/**
 * GET /api/live/resenha — Resenhas para as quais o membro foi convidado e o
 * catálogo de Insiders das Resenhas abertas em que ele ainda pode pedir convite.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) throw new PartnerError("Não autenticado.", 401);
    const [resenhas, catalog] = await Promise.all([memberResenhas(user.id), memberResenhaCatalog(user.id)]);
    return NextResponse.json({ success: true, resenhas, catalog }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao carregar a Resenha.");
  }
}

/** POST /api/live/resenha — pede ao Insider escolhido autorização para comprar o convite (um pedido por edição). */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) throw new PartnerError("Não autenticado.", 401);
    const limit = checkRateLimit(`resenha-request:${user.id}`, 10, 60);
    if (!limit.allowed) throw new PartnerError(`Muitas tentativas seguidas. Aguarde ${limit.resetInSeconds}s.`, 429);
    const parsed = requestSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 400);
    const { insiderName } = await requestInvite(user.id, parsed.data.link);
    return NextResponse.json({ success: true, message: `Pedido enviado para ${insiderName}. Agora é aguardar a aprovação para comprar o convite.` }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Não foi possível enviar o pedido.");
  }
}
