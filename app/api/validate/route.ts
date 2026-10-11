// Hello World
import { NextRequest, NextResponse } from "next/server";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse, readJson } from "@/lib/partners/http";
import { requireValidator } from "@/lib/validation/actor";
import { validateCode, validationHistory } from "@/lib/validation";
import { checkRateLimit } from "@/lib/security";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * POST /api/validate — portaria e balcão (admin, parceiro ou Equipe PRX).
 * body: { code: string, action?: "lookup" | "confirm", eventId?: string }
 * Ingresso (PRX_LIVE::, UP-…, RUN-…) faz check-in; voucher (PRX_PASS2:: dinâmico ou PRX-… + 6 dígitos) dá baixa.
 * eventId = evento escolhido na portaria: ingresso de outro evento é recusado.
 */
export async function POST(req: NextRequest) {
  try {
    const validator = await requireValidator(req);
    const rate = checkRateLimit(`validate:${validator.userId}`, 90, 60);
    if (!rate.allowed) throw new PartnerError(`Muitas leituras seguidas. Aguarde ${rate.resetInSeconds}s.`, 429);
    const body = (await readJson(req)) as { code?: unknown; action?: unknown; eventId?: unknown };
    const raw = typeof body.code === "string" ? body.code.slice(0, 300) : "";
    if (!raw.trim()) throw new PartnerError("Informe ou escaneie o código.", 400);
    const eventId = typeof body.eventId === "string" && body.eventId.trim() ? body.eventId.trim().slice(0, 80) : undefined;
    const result = await validateCode(validator, raw, body.action === "confirm" ? "confirm" : "lookup", { eventId });
    if (!result.ok) return NextResponse.json({ success: false, ...result }, { status: result.status, headers: NO_STORE });
    return NextResponse.json({ success: true, ...result }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao validar o código.");
  }
}

/** GET /api/validate — últimas validações de quem está logado. */
export async function GET(req: NextRequest) {
  try {
    const validator = await requireValidator(req);
    return NextResponse.json(
      {
        success: true,
        validator: {
          role: validator.role,
          name: validator.name,
          canValidateTickets: validator.role !== "staff" || validator.canValidateTickets,
          canValidateBenefits: validator.role !== "staff" || validator.canValidateBenefits,
        },
        history: await validationHistory(validator, 20),
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    return errorResponse(error, "Erro ao consultar o histórico.");
  }
}
