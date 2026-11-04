// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/security";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse, readJson, LARGE_JSON_BODY_BYTES } from "@/lib/partners/http";
import { firstIssue } from "@/lib/partners/types";
import { requireInsider } from "@/lib/resenha/access";
import { insiderSelfEditSchema, updateOwnProfile } from "@/lib/resenha/profile";

/** PATCH /api/insider/profile — o Insider edita nome, @, foto e senha da própria conta. */
export async function PATCH(req: NextRequest) {
  try {
    const { insider } = await requireInsider(req);
    const limit = checkRateLimit(`insider-profile:${insider.id}`, 10, 60);
    if (!limit.allowed) throw new PartnerError(`Muitas tentativas. Aguarde ${limit.resetInSeconds}s.`, 429);
    const parsed = insiderSelfEditSchema.safeParse(await readJson(req, LARGE_JSON_BODY_BYTES));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 422);
    const updated = await updateOwnProfile(insider, parsed.data);
    return NextResponse.json({ success: true, insider: { name: updated.name, handle: updated.handle, avatarUrl: updated.avatarUrl } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Não foi possível salvar seus dados.");
  }
}
