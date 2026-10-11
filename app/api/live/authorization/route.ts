// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/security";
import { PartnerError } from "@/lib/partners/errors";
import { clientIp, errorResponse, readJson } from "@/lib/partners/http";
import { firstIssue } from "@/lib/partners/types";
import { getGuardianAuthorization, respondGuardianAuthorization } from "@/lib/live/service";

const NO_STORE = { "Cache-Control": "no-store" };

const actionSchema = z.object({
  token: z.string().trim().min(16).max(120),
  action: z.enum(["approve", "reject"]),
  guardianName: z.string().trim().min(3, "Informe seu nome completo.").max(120).optional(),
  guardianCpf: z.string().trim().min(11, "Informe seu CPF.").max(18).optional(),
  relationship: z.string().trim().min(2, "Informe seu parentesco com o menor.").max(60).optional(),
  guardianPhone: z.string().trim().max(30).optional(),
  rejectionReason: z.string().trim().max(300).optional(),
});

/**
 * GET /api/live/authorization?token=<token>
 * Consulta os dados do evento e do menor para exibição da tela de autorização do responsável legal.
 */
export async function GET(req: NextRequest) {
  try {
    const ip = clientIp(req) || "anon";
    const limit = checkRateLimit(`guardian-auth-get:${ip}`, 60, 60);
    if (!limit.allowed) throw new PartnerError(`Muitas requisições. Aguarde ${limit.resetInSeconds}s.`, 429);

    const token = req.nextUrl.searchParams.get("token");
    if (!token) throw new PartnerError("Token de autorização não informado.", 400);

    const authorization = await getGuardianAuthorization(token);
    return NextResponse.json({ success: true, authorization }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao consultar a autorização do responsável legal.");
  }
}

/**
 * POST /api/live/authorization
 * Registra a decisão (conceder ou recusar) do responsável legal para a entrada do menor no evento.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req) || "anon";
    const userAgent = req.headers.get("user-agent") || undefined;
    const limit = checkRateLimit(`guardian-auth-post:${ip}`, 20, 60);
    if (!limit.allowed) throw new PartnerError(`Muitas tentativas. Aguarde ${limit.resetInSeconds}s.`, 429);

    const parsed = actionSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 422);

    const body = parsed.data;
    const authorization = await respondGuardianAuthorization(body.token, body, { ip, userAgent });

    return NextResponse.json({ success: true, authorization }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao registrar a autorização do responsável legal.");
  }
}
