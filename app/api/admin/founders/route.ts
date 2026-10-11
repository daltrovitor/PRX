// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse, readJson, requireAdmin } from "@/lib/partners/http";
import { firstIssue } from "@/lib/partners/types";
import { recordAdminAction } from "@/lib/admin/audit";
import { deleteFoundersContent, foundersAdminContent, saveFoundersContent } from "@/lib/founders/service";

const NO_STORE = { "Cache-Control": "no-store" };

/** GET /api/admin/founders — encontros, startups e atualizações (inclusive rascunhos). */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    return NextResponse.json({ success: true, ...(await foundersAdminContent()) }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao carregar o PRX Founders.");
  }
}

const kind = z.enum(["meeting", "startup", "update"]);
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), kind, id: z.string().min(1).max(80).optional(), data: z.unknown() }),
  z.object({ action: z.literal("delete"), kind, id: z.string().min(1).max(80) }),
]);

const LABEL = { meeting: "encontro", startup: "startup", update: "atualização" } as const;

/**
 * POST /api/admin/founders
 *   { action: "save", kind, id?, data }  cria (sem id) ou edita
 *   { action: "delete", kind, id }       exclui
 */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 400);
    const body = parsed.data;
    if (body.action === "delete") {
      await deleteFoundersContent(body.kind, body.id);
      await recordAdminAction(admin, { action: `founders.${body.kind}_deleted`, targetType: `founders_${body.kind}`, targetId: body.id, summary: `Founders: ${LABEL[body.kind]} excluído(a)` }, req);
      return NextResponse.json({ success: true }, { headers: NO_STORE });
    }
    const item = await saveFoundersContent(body.kind, body.data, admin.email || admin.sub, body.id);
    const title = "title" in item ? item.title : item.name;
    await recordAdminAction(
      admin,
      { action: `founders.${body.kind}_${body.id ? "updated" : "created"}`, targetType: `founders_${body.kind}`, targetId: item.id, summary: `Founders: ${LABEL[body.kind]} "${title}" (${item.status})` },
      req
    );
    return NextResponse.json({ success: true, item }, { status: body.id ? 200 : 201, headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao salvar no PRX Founders.");
  }
}
