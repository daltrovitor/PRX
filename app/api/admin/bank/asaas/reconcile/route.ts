// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/security";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse, requireAdmin } from "@/lib/partners/http";
import { asaasDeps } from "@/lib/bank/asaas/deps";
import { reconcileBank } from "@/lib/bank/asaas/reconcile";
import { syncAllSubaccountWebhooks } from "@/lib/bank/asaas/webhook-sync";

/** Várias subcontas por chamada: dá tempo às consultas ao Asaas. */
export const maxDuration = 60;

const schema = z.object({ action: z.enum(["reconcile", "sync_webhooks", "sync_webhooks_reactivate"]).default("reconcile") });

/**
 * POST /api/admin/bank/asaas/reconcile (só admin)
 *   reconcile                  reprocessa eventos, confere subcontas em análise e saídas sem desfecho
 *   sync_webhooks              grava URL, eventos e token atuais no webhook de todas as subcontas
 *   sync_webhooks_reactivate   idem e reativa filas interrompidas pelo Asaas
 * Só consultas e configuração: nenhuma operação de dinheiro é repetida.
 */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    const rate = checkRateLimit(`admin_asaas_reconcile_${admin.sub}`, 6, 600);
    if (!rate.allowed) throw new PartnerError(`Aguarde ${rate.resetInSeconds}s para rodar de novo.`, 429);
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) throw new PartnerError("Ação inválida.", 422);
    const deps = asaasDeps();
    const action = parsed.data.action;
    const report = action === "reconcile" ? await reconcileBank(deps) : await syncAllSubaccountWebhooks(deps, action === "sync_webhooks_reactivate");
    console.info(`[prx-bank:admin] ${admin.email} → ${action}`);
    return NextResponse.json({ success: true, action, report }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Não foi possível conciliar com o Asaas.");
  }
}
