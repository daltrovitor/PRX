// Hello World
import { NextResponse, after, type NextRequest } from "next/server";
import { checkRateLimit, sanitizeInput } from "@/lib/security";
import { PartnerError } from "@/lib/partners/errors";
import { childAccountSchema } from "@/lib/family/types";
import { createChildAccount } from "@/lib/family/service";
import { clientIp } from "@/lib/partners/http";
import { body, familyErrorResponse, invalid, requireUser } from "@/lib/family/http";
import { sendWelcomeEmail } from "@/lib/notifications/welcome";

/**
 * O responsável cria a conta do filho, já vinculada e com limites iniciais.
 * Exige parentesco, declaração de tutela e consentimento parental (LGPD, Art. 14).
 */
export async function POST(req: NextRequest) {
  try {
    const parent = await requireUser(req);
    const rate = checkRateLimit(`family_child_${parent.id}`, 6, 60);
    if (!rate.allowed) throw new PartnerError(`Muitas tentativas. Tente em ${rate.resetInSeconds}s.`, 429);
    const parsed = childAccountSchema.safeParse(await body(req));
    if (!parsed.success) invalid(parsed.error.issues);
    const { child } = await createChildAccount(parent, { ...parsed.data, fullName: sanitizeInput(parsed.data.fullName) }, clientIp(req));
    after(() => sendWelcomeEmail({ id: child.id, email: child.email, fullName: child.fullName }));
    return NextResponse.json({ success: true, child: { id: child.id, name: child.fullName, email: child.email } });
  } catch (error) {
    return familyErrorResponse(error, "Não foi possível criar a conta do filho.");
  }
}
