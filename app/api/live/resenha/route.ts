// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse } from "@/lib/partners/http";
import { memberResenhas } from "@/lib/resenha/invites";

/** GET /api/live/resenha — Resenhas para as quais o membro foi convidado por um Insider (vazio = a Resenha não aparece no app). */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) throw new PartnerError("Não autenticado.", 401);
    return NextResponse.json({ success: true, resenhas: await memberResenhas(user.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Erro ao carregar a Resenha.");
  }
}
