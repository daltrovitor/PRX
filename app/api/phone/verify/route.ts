// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimitPersistent } from "@/lib/security";
import { PartnerError } from "@/lib/partners/errors";
import { body, familyErrorResponse, invalid, requireUser } from "@/lib/family/http";
import { confirmCodeSchema } from "@/lib/phone/types";
import { confirmPhoneCode } from "@/lib/phone/service";

/** POST /api/phone/verify — confere o código recebido no WhatsApp e confirma o celular. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const rate = await checkRateLimitPersistent(`phone_verify_${user.id}`, 20, 600);
    if (!rate.allowed) throw new PartnerError(`Muitas tentativas. Tente em ${Math.ceil(rate.resetInSeconds / 60)} min.`, 429);
    const parsed = confirmCodeSchema.safeParse(await body(req));
    if (!parsed.success) invalid(parsed.error.issues);
    const phone = await confirmPhoneCode(user.id, parsed.data.phone, parsed.data.code);
    return NextResponse.json({ success: true, phone }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return familyErrorResponse(error, "Não foi possível confirmar o código.");
  }
}
