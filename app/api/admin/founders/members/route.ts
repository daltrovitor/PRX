// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse, readJson, requireAdmin } from "@/lib/partners/http";
import { firstIssue } from "@/lib/partners/types";
import { recordAdminAction } from "@/lib/admin/audit";
import { pageParams } from "@/lib/admin/paging";
import { deleteFounder, listFounders, saveFounder } from "@/lib/founders/members";

const NO_STORE = { "Cache-Control": "no-store, private" };

/** GET /api/admin/founders/members?q=&page= — Founders cadastrados, com a conta ligada. */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const params = req.nextUrl.searchParams;
    const { page, pageSize } = pageParams(params, 25);
    const result = await listFounders({ q: params.get("q") ?? "", offset: (page - 1) * pageSize, limit: pageSize });
    return NextResponse.json({ success: true, ...result, page, pageSize }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao carregar os Founders.");
  }
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), id: z.string().trim().min(1).max(80).optional(), data: z.unknown() }),
  z.object({ action: z.literal("delete"), id: z.string().trim().min(1).max(80) }),
]);

/** POST /api/admin/founders/members — cria/edita (save) ou exclui (delete) um Founder. Ativar/desativar é o campo status. */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 400);
    const body = parsed.data;
    if (body.action === "delete") {
      await deleteFounder(body.id);
      await recordAdminAction(admin, { action: "founders.member_deleted", targetType: "founder_member", targetId: body.id, summary: "Founder excluído" }, req);
      return NextResponse.json({ success: true }, { headers: NO_STORE });
    }
    const founder = await saveFounder(body.data, admin.email || admin.sub, body.id);
    await recordAdminAction(
      admin,
      { action: `founders.member_${body.id ? "updated" : "created"}`, targetType: "founder_member", targetId: founder.id, summary: `Founder ${founder.displayName} (${founder.status === "active" ? "ativo" : "inativo"})` },
      req
    );
    return NextResponse.json({ success: true, founder }, { status: body.id ? 200 : 201, headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao salvar o Founder.");
  }
}
