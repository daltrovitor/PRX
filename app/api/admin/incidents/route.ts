// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, requireAdmin } from "@/lib/partners/http";
import { PartnerError } from "@/lib/partners/errors";
import { findIncident } from "@/lib/incidents";

/**
 * GET /api/admin/incidents?code=BNK-7K3F9Q — detalhe de um código de erro que
 * o membro informou ao suporte (rota, ação, motivo sem dados pessoais, versão).
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const code = req.nextUrl.searchParams.get("code") ?? "";
    const incident = await findIncident(code);
    if (!incident) throw new PartnerError("Código não encontrado. Confira as letras e os números (ex.: BNK-7K3F9Q).", 404);
    return NextResponse.json({ success: true, incident }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Erro ao consultar o código de erro.");
  }
}
