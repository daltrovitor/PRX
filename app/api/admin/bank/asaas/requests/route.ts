// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse, requireAdmin } from "@/lib/partners/http";
import { AUDIT_OUTCOMES } from "@/lib/asaas/audit";
import { listRequests, requestDetail, resolveUserId } from "@/lib/bank/asaas/admin";

const NO_STORE = { "Cache-Control": "no-store" };
const PAGE = 50;

const filterSchema = z.object({
  id: z.string().uuid().optional(),
  user: z.string().trim().max(200).optional(),
  operation: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_. {}/-]{1,80}$/)
    .optional(),
  environment: z.enum(["sandbox", "production"]).optional(),
  outcome: z.enum(AUDIT_OUTCOMES).optional(),
  status: z.coerce.number().int().min(100).max(599).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(0).max(1000).default(0),
});

/**
 * GET /api/admin/bank/asaas/requests — registro das chamadas ao Asaas (só admin).
 *   ?id=<uuid>                       detalhe: corpos limpos, diagnóstico, chamadas da mesma ação e estado de negócio
 *   ?user=&operation=&environment=&outcome=&status=&from=&to=&q=&page=   lista filtrada (50 por página)
 * Nada aqui traz chave de API ou token: o registro já é gravado limpo.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const raw = Object.fromEntries([...req.nextUrl.searchParams.entries()].filter(([, v]) => v !== ""));
    const parsed = filterSchema.safeParse(raw);
    if (!parsed.success) throw new PartnerError(`Filtro inválido: ${parsed.error.issues[0]?.path.join(".")}`, 422);
    const f = parsed.data;

    if (f.id) {
      const detail = await requestDetail(f.id);
      if (!detail) throw new PartnerError("Chamada não encontrada.", 404);
      return NextResponse.json({ detail }, { headers: NO_STORE });
    }

    let userId: string | undefined;
    if (f.user) {
      userId = (await resolveUserId(f.user)) ?? undefined;
      if (!userId) return NextResponse.json({ rows: [], total: 0, page: f.page, pageSize: PAGE, userNotFound: true }, { headers: NO_STORE });
    }
    const { rows, total } = await listRequests({
      userId,
      operation: f.operation,
      environment: f.environment,
      outcome: f.outcome,
      httpStatus: f.status,
      from: f.from,
      to: f.to,
      search: f.q,
      limit: PAGE,
      offset: f.page * PAGE,
    });
    // A lista não leva os corpos: só o detalhe.
    const slim = rows.map((row) => ({ ...row, requestBody: undefined, responseBody: undefined, query: undefined }));
    return NextResponse.json({ rows: slim, total, page: f.page, pageSize: PAGE }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Não foi possível carregar o registro de chamadas ao Asaas.");
  }
}
