// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse, readJson, requireAdmin } from "@/lib/partners/http";
import { firstIssue } from "@/lib/partners/types";
import { recordAdminAction } from "@/lib/admin/audit";
import { getBehaviorsRepository } from "@/lib/behaviors/repository";
import { evaluateRule, evaluationDeps, reviewEvaluation, saveRule } from "@/lib/behaviors/service";
import { RESULTS } from "@/lib/behaviors/types";

const NO_STORE = { "Cache-Control": "no-store, private" };

/** GET /api/admin/behaviors — regras, categorias, importações e quantas avaliações esperam revisão. */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const repo = getBehaviorsRepository();
    const [rules, categories, runs, review] = await Promise.all([repo.listRules(), repo.categories(), repo.listImportRuns(10), repo.listEvaluations({ status: "under_review", offset: 0, limit: 1 })]);
    return NextResponse.json({ success: true, rules, categories, runs, reviewCount: review.total, bankOnline: evaluationDeps() !== null }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao carregar os comportamentos.");
  }
}

const id = z.string().trim().min(1).max(80);
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save_rule"), id: id.optional(), data: z.unknown() }),
  z.object({ action: z.literal("delete_rule"), id }),
  z.object({ action: z.literal("evaluate"), id }),
  z.object({ action: z.literal("review"), id, decision: z.enum(["confirm", ...RESULTS]), note: z.string().max(500).default("") }),
]);

/**
 * POST /api/admin/behaviors
 *   save_rule    cria (sem id) ou edita uma regra
 *   delete_rule  exclui a regra (as avaliações dela saem juntas)
 *   evaluate     avalia agora quem tem conta PRX BANK
 *   review       confirma ou corrige uma avaliação (correção exige motivo)
 */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 400);
    const body = parsed.data;
    const actor = admin.email || admin.sub;
    switch (body.action) {
      case "save_rule": {
        const rule = await saveRule(body.data, actor, body.id);
        await recordAdminAction(admin, { action: `behaviors.rule_${body.id ? "updated" : "created"}`, targetType: "behavior_rule", targetId: rule.id, summary: `Comportamento "${rule.name}" (${rule.status})` }, req);
        return NextResponse.json({ success: true, rule }, { status: body.id ? 200 : 201, headers: NO_STORE });
      }
      case "delete_rule":
        await getBehaviorsRepository().deleteRule(body.id);
        await recordAdminAction(admin, { action: "behaviors.rule_deleted", targetType: "behavior_rule", targetId: body.id, summary: "Comportamento excluído" }, req);
        return NextResponse.json({ success: true }, { headers: NO_STORE });
      case "evaluate": {
        const result = await evaluateRule(body.id, evaluationDeps());
        await recordAdminAction(admin, { action: "behaviors.rule_evaluated", targetType: "behavior_rule", targetId: body.id, summary: `Comportamento avaliado: ${result.evaluated} pessoa(s)` }, req);
        return NextResponse.json({ success: true, result }, { headers: NO_STORE });
      }
      case "review": {
        const evaluation = await reviewEvaluation(body.id, body.decision, body.note, actor);
        await recordAdminAction(admin, { action: "behaviors.evaluation_reviewed", targetType: "behavior_evaluation", targetId: body.id, summary: `Avaliação ${body.decision === "confirm" ? "confirmada" : `corrigida para ${body.decision}`}${body.note ? `: ${body.note}` : ""}` }, req);
        return NextResponse.json({ success: true, evaluation }, { headers: NO_STORE });
      }
    }
  } catch (error) {
    return errorResponse(error, "Erro ao salvar o comportamento.");
  }
}
