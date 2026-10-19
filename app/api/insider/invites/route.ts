// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/security";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse, readJson } from "@/lib/partners/http";
import { firstIssue } from "@/lib/partners/types";
import { requireInsider } from "@/lib/resenha/access";
import { cancelInvite, insiderInvites, inviteMember } from "@/lib/resenha/invites";

const NO_STORE = { "Cache-Control": "no-store" };
const inviteSchema = z.object({ link: z.string().trim().min(1).max(80), memberCode: z.string().trim().min(6, "Informe o ID PRX.").max(20) });

/** GET /api/insider/invites?link=<id> — membros que o Insider convidou nesta Resenha e a situação do ingresso. */
export async function GET(req: NextRequest) {
  try {
    const { insider } = await requireInsider(req);
    const link = req.nextUrl.searchParams.get("link");
    if (!link) throw new PartnerError("Informe a Resenha.", 400);
    return NextResponse.json({ success: true, invites: await insiderInvites(insider, link) }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Não foi possível carregar os convites.");
  }
}

/** POST /api/insider/invites — convida um membro pelo ID PRX (ocupa um PASS e avisa a pessoa no celular). */
export async function POST(req: NextRequest) {
  try {
    const { insider } = await requireInsider(req);
    const limit = checkRateLimit(`insider-invite:${insider.id}`, 30, 60);
    if (!limit.allowed) throw new PartnerError(`Muitos convites seguidos. Aguarde ${limit.resetInSeconds}s.`, 429);
    const parsed = inviteSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 400);
    const invite = await inviteMember(insider, parsed.data.link, parsed.data.memberCode);
    return NextResponse.json({ success: true, message: `${invite.memberName} foi convidado(a). A Resenha já aparece no app dele(a).` }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Não foi possível convidar.");
  }
}

/** DELETE /api/insider/invites?id=<convite> — cancela o convite e devolve o PASS. */
export async function DELETE(req: NextRequest) {
  try {
    const { insider } = await requireInsider(req);
    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new PartnerError("Informe o convite.", 400);
    await cancelInvite(insider, id);
    return NextResponse.json({ success: true }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Não foi possível cancelar o convite.");
  }
}
