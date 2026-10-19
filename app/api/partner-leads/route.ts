// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/security";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse, readJson } from "@/lib/partners/http";
import { firstIssue } from "@/lib/partners/types";
import { partnerLeadSchema } from "@/lib/partner-leads/types";
import { createPartnerLead } from "@/lib/partner-leads/repository";

/** POST /api/partner-leads — pedido "Seja um parceiro" feito no PRX PASS (membro logado). */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) throw new PartnerError("Entre na sua conta para enviar o pedido.", 401);
    const limit = checkRateLimit(`partner-lead:${user.id}`, 3, 3600);
    if (!limit.allowed) throw new PartnerError("Você já enviou pedidos agora há pouco. A equipe vai falar com você; se precisar, tente de novo mais tarde.", 429);
    const parsed = partnerLeadSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 400);
    await createPartnerLead(parsed.data, user.id);
    return NextResponse.json({ success: true, message: "Pedido enviado. A equipe de parcerias da PRX vai falar com você pelo contato informado." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Erro ao enviar o pedido de parceria.");
  }
}
