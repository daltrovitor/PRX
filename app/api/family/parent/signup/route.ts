// Hello World
import { NextResponse, after, type NextRequest } from "next/server";
import { checkRateLimitPersistent, sanitizeInput } from "@/lib/security";
import { PartnerError } from "@/lib/partners/errors";
import { recordConsent } from "@/lib/legal";
import { attachSession, publicUser } from "@/lib/accounts";
import { parentSignupSchema } from "@/lib/family/types";
import { registerParent } from "@/lib/family/service";
import { body, familyErrorResponse, invalid } from "@/lib/family/http";
import { sendWelcomeEmail } from "@/lib/notifications/welcome";

/** Passo 1 do "Sou Pai": dados pessoais e senha. A conta nasce em análise até os documentos serem conferidos. */
// nosemgrep: prx-mutation-route-without-auth — cadastro público da Conta Pai com limite de tentativas
export async function POST(req: NextRequest) {
  try {
    const ip = (req.headers.get("x-forwarded-for") || "127.0.0.1").split(",")[0].trim();
    const rate = await checkRateLimitPersistent(`parent_signup_${ip}`, 6, 60);
    if (!rate.allowed) throw new PartnerError(`Muitas tentativas. Tente em ${rate.resetInSeconds}s.`, 429);
    const parsed = parentSignupSchema.safeParse(await body(req));
    if (!parsed.success) invalid(parsed.error.issues);
    const input = parsed.data;
    const { user } = await registerParent({ ...input, fullName: sanitizeInput(input.fullName), email: sanitizeInput(input.email) });
    await recordConsent(user.id);
    after(() => sendWelcomeEmail({ id: user.id, email: user.email, fullName: user.fullName }));
    return attachSession(NextResponse.json({ success: true, user: publicUser(user) }), user);
  } catch (error) {
    return familyErrorResponse(error, "Não foi possível criar a Conta Pai.");
  }
}
