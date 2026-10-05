// Hello World
import { NextResponse, after, type NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/security";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse, readJson } from "@/lib/partners/http";
import { firstIssue } from "@/lib/partners/types";
import { requireInsider } from "@/lib/resenha/access";
import { sendListEmail } from "@/lib/resenha/notify";
import { baseUrlFor } from "@/lib/resenha/session";
import { decideRequest } from "@/lib/resenha/service";
import { decisionSchema } from "@/lib/resenha/types";

/**
 * POST /api/insider/requests/<id> { action: "approve" | "reject" | "revoke" }
 * O Insider libera, recusa ("ainda não") ou remove da lista quem chegou pelo link dele.
 * Liberar emite o ingresso gratuito e avisa o convidado por e-mail depois da resposta.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { insider } = await requireInsider(req);
    const limit = checkRateLimit(`insider-decide:${insider.id}`, 120, 60);
    if (!limit.allowed) throw new PartnerError(`Muitas ações em sequência. Aguarde ${limit.resetInSeconds}s.`, 429);
    const parsed = decisionSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 400);

    const { id } = await params;
    const { request, notice } = await decideRequest({ kind: "insider", insider }, id, parsed.data.action);
    if (notice) {
      const baseUrl = baseUrlFor(req.headers);
      after(() => sendListEmail({ ...notice, baseUrl }));
    }
    return NextResponse.json({ success: true, request: { id: request.id, status: request.status } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Não foi possível registrar a decisão.");
  }
}
