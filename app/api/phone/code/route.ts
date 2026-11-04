// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimitPersistent } from "@/lib/security";
import { PartnerError } from "@/lib/partners/errors";
import { clientIp } from "@/lib/partners/http";
import { body, familyErrorResponse, invalid, requireUser } from "@/lib/family/http";
import { requestCodeSchema } from "@/lib/phone/types";
import { requestPhoneCode } from "@/lib/phone/service";

/**
 * POST /api/phone/code — envia o código de 6 dígitos pelo WhatsApp.
 * Limites: 1 por minuto e 5 por hora por membro (serviço) e 10 por hora por IP.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const rate = await checkRateLimitPersistent(`phone_code_${clientIp(req) ?? user.id}`, 10, 3600);
    if (!rate.allowed) throw new PartnerError(`Muitos pedidos de código. Tente em ${Math.ceil(rate.resetInSeconds / 60)} min.`, 429);
    const parsed = requestCodeSchema.safeParse(await body(req));
    if (!parsed.success) invalid(parsed.error.issues);
    const result = await requestPhoneCode(user.id, parsed.data.phone);
    return NextResponse.json({ success: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return familyErrorResponse(error, "Não foi possível enviar o código.");
  }
}
