// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/security";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse, readJson } from "@/lib/partners/http";
import { firstIssue } from "@/lib/partners/types";
import { requireInsider } from "@/lib/resenha/access";
import { decideInviteRequest, insiderInviteRequests } from "@/lib/resenha/invite-requests";

const NO_STORE = { "Cache-Control": "no-store" };
const decisionSchema = z.object({ id: z.string().trim().min(1).max(80), action: z.enum(["approve", "reject"]) });

/** GET /api/insider/invite-requests?link=<id> — pedidos de convite que chegaram pelo app nesta Resenha. */
export async function GET(req: NextRequest) {
  try {
    const { insider } = await requireInsider(req);
    const link = req.nextUrl.searchParams.get("link");
    if (!link) throw new PartnerError("Informe a Resenha.", 400);
    return NextResponse.json({ success: true, requests: await insiderInviteRequests(insider, link) }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Não foi possível carregar os pedidos.");
  }
}

/** POST /api/insider/invite-requests — aprova (vira convite e usa um PASS) ou recusa um pedido. */
export async function POST(req: NextRequest) {
  try {
    const { insider } = await requireInsider(req);
    const limit = checkRateLimit(`insider-invite:${insider.id}`, 30, 60);
    if (!limit.allowed) throw new PartnerError(`Muitas decisões seguidas. Aguarde ${limit.resetInSeconds}s.`, 429);
    const parsed = decisionSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 400);
    const request = await decideInviteRequest(insider, parsed.data.id, parsed.data.action);
    const message = parsed.data.action === "approve" ? `${request.memberName} pode comprar o convite. A Resenha já aparece no app dele(a).` : `Pedido de ${request.memberName} recusado.`;
    return NextResponse.json({ success: true, message }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Não foi possível registrar a decisão.");
  }
}
