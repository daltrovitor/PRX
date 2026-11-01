// Hello World
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/security";
import { PartnerError } from "@/lib/partners/errors";
import { clientIp, errorResponse, readJson } from "@/lib/partners/http";
import { firstIssue } from "@/lib/partners/types";
import { insiderSignupSchema, signupInsider } from "@/lib/resenha/signup";

/**
 * POST /api/insider/signup — o Insider se cadastra no portal (insider.<domínio>).
 * Cria (ou reaproveita) a conta PRX e deixa o cadastro aguardando a aprovação do admin.
 */
// nosemgrep: prx-mutation-route-without-auth — cadastro público: nasce sem acesso até o admin aprovar
export async function POST(req: NextRequest) {
  try {
    const limit = checkRateLimit(`insider-signup:${clientIp(req) ?? "anon"}`, 5, 600);
    if (!limit.allowed) throw new PartnerError(`Muitas tentativas. Aguarde ${limit.resetInSeconds}s.`, 429);

    const parsed = insiderSignupSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 422);
    const { existingAccount } = await signupInsider(parsed.data);
    return NextResponse.json({ success: true, existingAccount }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Não foi possível enviar o cadastro agora.");
  }
}
