// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/security";
import { tableReady } from "@/lib/db-features";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse, readJson } from "@/lib/partners/http";
import { firstIssue } from "@/lib/partners/types";
import { memberActionSchema } from "@/lib/support/types";
import { memberReply, memberResolve, memberTickets, openTicket, type SupportMember } from "@/lib/support/service";

const NO_STORE = { "Cache-Control": "no-store" };

async function member(req: NextRequest): Promise<SupportMember> {
  const user = await getCurrentUser(req);
  if (!user) throw new PartnerError("Entre na sua conta para falar com o atendimento.", 401);
  return { id: user.id, name: user.fullName, email: user.email };
}

/** GET /api/support — solicitações do membro com a conversa. `available: false` = migração pendente (o app mostra o e-mail). */
export async function GET(req: NextRequest) {
  try {
    const me = await member(req);
    if (!(await tableReady("support_tickets"))) return NextResponse.json({ success: true, available: false, tickets: [] }, { headers: NO_STORE });
    return NextResponse.json({ success: true, available: true, tickets: await memberTickets(me) }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao carregar o atendimento.");
  }
}

/** POST /api/support — abre solicitação, responde ou encerra (só as próprias). */
export async function POST(req: NextRequest) {
  try {
    const me = await member(req);
    const parsed = memberActionSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 400);
    const input = parsed.data;

    const limit = input.action === "open" ? checkRateLimit(`support-open:${me.id}`, 5, 600) : checkRateLimit(`support:${me.id}`, 20, 60);
    if (!limit.allowed) throw new PartnerError(`Muitas mensagens seguidas. Aguarde ${limit.resetInSeconds}s.`, 429);

    if (input.action === "open") {
      const ticket = await openTicket(me, input.ticket);
      return NextResponse.json({ success: true, message: `Solicitação aberta. Protocolo ${ticket.protocol}.`, ticket }, { headers: NO_STORE });
    }
    const ticket = input.action === "reply" ? await memberReply(me, input.id, input.message) : await memberResolve(me, input.id);
    return NextResponse.json({ success: true, ticket }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro no atendimento.");
  }
}
