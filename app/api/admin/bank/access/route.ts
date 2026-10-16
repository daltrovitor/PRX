// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse, readJson, requireAdmin } from "@/lib/partners/http";
import { firstIssue } from "@/lib/partners/types";
import { recordAdminAction } from "@/lib/admin/audit";
import { pageParams } from "@/lib/admin/paging";
import { listMembers, memberContacts } from "@/lib/admin/members";
import { ageOn } from "@/lib/family/age";
import { MAX_MEMBER_AGE } from "@/lib/family/types";
import { activeGrant, type AccessCandidate, grantBankAccess, grantHistory, listActiveGrants, revokeBankAccess, verifiedBirthDate } from "@/lib/bank/access";

const NO_STORE = { "Cache-Control": "no-store, private" };


async function candidate(member: { id: string; name: string; email: string }): Promise<AccessCandidate> {
  const [birth, grant] = await Promise.all([verifiedBirthDate(member.id).catch(() => null), activeGrant(member.id).catch(() => null)]);
  const age = birth ? ageOn(birth.birthDate) : null;
  return {
    userId: member.id,
    name: member.name,
    email: member.email,
    age,
    birthSource: birth?.source ?? null,
    eligible: age !== null && age > MAX_MEMBER_AGE,
    grant: grant ? { grantedBy: grant.grantedBy, grantedAt: grant.grantedAt, note: grant.note } : null,
  };
}

/**
 * GET /api/admin/bank/access
 *   ?q=…       busca membros (nome ou e-mail) com a idade validada e a liberação
 *   ?userId=…  histórico de liberações da pessoa
 *   (sem q)    liberações vigentes, paginadas
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const params = req.nextUrl.searchParams;
    const userId = params.get("userId");
    if (userId) return NextResponse.json({ success: true, history: await grantHistory(userId.slice(0, 80)) }, { headers: NO_STORE });
    const { page, pageSize } = pageParams(params, 20);
    const q = (params.get("q") ?? "").trim();
    if (q) {
      const found = await listMembers({ page, pageSize, q, sort: "name" });
      return NextResponse.json({ success: true, members: await Promise.all(found.members.map(candidate)), total: found.total, page, pageSize }, { headers: NO_STORE });
    }
    const grants = await listActiveGrants((page - 1) * pageSize, pageSize);
    const contacts = await memberContacts(grants.items.map((g) => g.userId));
    const items = grants.items.map((g) => ({ ...g, name: contacts.get(g.userId)?.name ?? "Conta excluída", email: contacts.get(g.userId)?.email ?? "" }));
    return NextResponse.json({ success: true, grants: items, total: grants.total, page, pageSize }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao carregar as liberações do PRX BANK.");
  }
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("grant"), userId: z.string().trim().min(1).max(80), note: z.string().max(500).default("") }),
  z.object({ action: z.literal("revoke"), userId: z.string().trim().min(1).max(80), note: z.string().max(500).default("") }),
]);

/**
 * POST /api/admin/bank/access
 *   grant   libera a abertura do PRX BANK para alguém acima de 29 anos (idade conferida no servidor)
 *   revoke  revoga a liberação vigente (não encerra conta já aberta no banco parceiro)
 */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 400);
    const { action, userId, note } = parsed.data;
    const actor = admin.email || admin.sub;
    const grant = action === "grant" ? await grantBankAccess(userId, note, actor) : await revokeBankAccess(userId, note, actor);
    await recordAdminAction(
      admin,
      {
        action: `bank.access_${action === "grant" ? "granted" : "revoked"}`,
        targetType: "user",
        targetId: userId,
        summary: action === "grant" ? `PRX BANK liberado (${grant.ageAtGrant} anos)${note ? `: ${note}` : ""}` : `Liberação do PRX BANK revogada${note ? `: ${note}` : ""}`,
      },
      req
    );
    return NextResponse.json({ success: true, grant }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Não foi possível salvar a liberação.");
  }
}
