// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimitPersistent } from "@/lib/security";
import { PartnerError } from "@/lib/partners/errors";
import { clientIp, errorResponse, readJson } from "@/lib/partners/http";
import { firstIssue } from "@/lib/partners/types";
import { requestInputSchema } from "@/lib/resenha/types";
import { submitRequest } from "@/lib/resenha/service";

/**
 * POST /api/resenha/001/request — pedido de acesso pelo link de um Insider. Público
 * (o convidado não tem conta), então tem limite por IP e por e-mail, e o servidor
 * confere tudo de novo: link ativo, lista aberta, 18+ na data da festa, um pedido por e-mail.
 */
// nosemgrep: prx-mutation-route-without-auth — pedido público de acesso, com limite de tentativas; o Insider decide depois
export async function POST(req: NextRequest, { params }: { params: Promise<{ edition: string }> }) {
  try {
    const ip = clientIp(req) ?? "anon";
    const limit = await checkRateLimitPersistent(`resenha-request:${ip}`, 6, 600);
    if (!limit.allowed) throw new PartnerError(`Muitas tentativas. Aguarde ${Math.ceil(limit.resetInSeconds / 60)} min.`, 429);

    const parsed = requestInputSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 422);
    const perEmail = await checkRateLimitPersistent(`resenha-request-mail:${parsed.data.email}`, 3, 3600);
    if (!perEmail.allowed) throw new PartnerError("Muitas tentativas com este e-mail. Tente mais tarde.", 429);

    const { edition } = await params;
    const { token } = await submitRequest(edition, parsed.data);
    return NextResponse.json({ success: true, token }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Não foi possível enviar o pedido agora.");
  }
}
