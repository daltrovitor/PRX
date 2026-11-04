// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/security";
import { PartnerError } from "@/lib/partners/errors";
import { clientIp, errorResponse, readJson } from "@/lib/partners/http";
import { firstIssue } from "@/lib/partners/types";
import { joinWaitlist, waitlistSchema } from "@/lib/waitlist";

/** POST /api/waitlist — pré-cadastro (nome, e-mail, celular, idade) na Lista de Espera VIP do prx.app.br. */
// nosemgrep: prx-mutation-route-without-auth — lista VIP pública (pré-cadastro + aceite), com limite de tentativas
export async function POST(req: NextRequest) {
  try {
    const limit = checkRateLimit(`waitlist:${clientIp(req) ?? "anon"}`, 5, 600);
    if (!limit.allowed) throw new PartnerError(`Muitas tentativas. Aguarde ${Math.ceil(limit.resetInSeconds / 60)} min.`, 429);
    const parsed = waitlistSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 422);
    await joinWaitlist(parsed.data, req.headers.get("host")?.toLowerCase().startsWith("prx.app.br") ? "prx.app.br" : "em-breve");
    return NextResponse.json({ success: true, message: "Você está na Lista VIP. Avisamos primeiro quando abrir." });
  } catch (error) {
    return errorResponse(error, "Não foi possível entrar na lista agora.");
  }
}
