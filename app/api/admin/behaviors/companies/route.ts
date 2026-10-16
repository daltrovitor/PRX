// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse, readJson, requireAdmin } from "@/lib/partners/http";
import { firstIssue } from "@/lib/partners/types";
import { recordAdminAction } from "@/lib/admin/audit";
import { pageParams } from "@/lib/admin/paging";
import { getBehaviorsRepository } from "@/lib/behaviors/repository";
import { importCompanies, saveCompany } from "@/lib/behaviors/service";

const NO_STORE = { "Cache-Control": "no-store, private" };

/** GET /api/admin/behaviors/companies?q=&category=&page=&pageSize= — empresas com busca e paginação; ?ids=a,b as empresas de uma regra. */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const params = req.nextUrl.searchParams;
    const ids = (params.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 500);
    if (ids.length > 0) {
      const items = await getBehaviorsRepository().companiesByIds(ids);
      return NextResponse.json({ success: true, items, total: items.length }, { headers: NO_STORE });
    }
    const { page, pageSize } = pageParams(params, 25);
    const result = await getBehaviorsRepository().listCompanies({ q: params.get("q") ?? "", category: (params.get("category") ?? "").slice(0, 60), offset: (page - 1) * pageSize, limit: pageSize });
    return NextResponse.json({ success: true, ...result, page, pageSize }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao carregar as empresas.");
  }
}

const id = z.string().trim().min(1).max(80);
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), id: id.optional(), data: z.unknown() }),
  z.object({ action: z.literal("delete"), id }),
  z.object({ action: z.literal("import"), fileName: z.string().max(200).default(""), rows: z.array(z.unknown()).max(5000), dryRun: z.boolean().default(false) }),
]);

/**
 * POST /api/admin/behaviors/companies
 *   save    cria ou edita uma empresa (CNPJ conferido)
 *   delete  exclui (sai das regras ligadas a ela)
 *   import  importa em lote as linhas já lidas do CSV/XLSX; dryRun só confere e devolve o relatório
 */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 400);
    const body = parsed.data;
    const actor = admin.email || admin.sub;
    if (body.action === "save") {
      const company = await saveCompany(body.data, actor, body.id);
      await recordAdminAction(admin, { action: `behaviors.company_${body.id ? "updated" : "created"}`, targetType: "behavior_company", targetId: company.id, summary: `Empresa ${company.legalName} (${company.cnpj})` }, req);
      return NextResponse.json({ success: true, company }, { status: body.id ? 200 : 201, headers: NO_STORE });
    }
    if (body.action === "delete") {
      await getBehaviorsRepository().deleteCompany(body.id);
      await recordAdminAction(admin, { action: "behaviors.company_deleted", targetType: "behavior_company", targetId: body.id, summary: "Empresa excluída" }, req);
      return NextResponse.json({ success: true }, { headers: NO_STORE });
    }
    const result = await importCompanies(body.rows, body.fileName, actor, body.dryRun);
    if (!body.dryRun) {
      await recordAdminAction(
        admin,
        { action: "behaviors.companies_imported", targetType: "behavior_import", targetId: result.run.id ?? "", summary: `Importação ${body.fileName || "sem nome"}: ${result.run.created} novas, ${result.run.updated} atualizadas, ${result.run.errors.length} com erro` },
        req
      );
    }
    return NextResponse.json({ success: true, ...result }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao salvar as empresas.");
  }
}
