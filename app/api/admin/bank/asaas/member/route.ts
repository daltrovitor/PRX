// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/security";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse, requireAdmin } from "@/lib/partners/http";
import { asaasDeps } from "@/lib/bank/asaas/deps";
import { memberDiagnostics, resolveUserId } from "@/lib/bank/asaas/admin";
import { syncOnboardingDocuments } from "@/lib/bank/asaas/documents";
import { openSubaccount, refreshSubaccountStatus } from "@/lib/bank/asaas/onboarding";
import { regenerateSubaccountKey, restartOpening } from "@/lib/bank/asaas/recovery";
import { syncSubaccountWebhook } from "@/lib/bank/asaas/webhook-sync";

const NO_STORE = { "Cache-Control": "no-store" };

async function userFrom(value: string | null): Promise<string> {
  const userId = await resolveUserId(value);
  if (!userId) throw new PartnerError("Membro não encontrado (use o id ou o e-mail do cadastro do PRX BANK).", 404);
  return userId;
}

/**
 * GET /api/admin/bank/asaas/member?user=<id ou e-mail> — a subconta do membro no
 * PRX (sem chave) e, ao vivo no Asaas, a situação cadastral, o webhook (fila
 * interrompida?) e os documentos pedidos. Mais o histórico da abertura.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const userId = await userFrom(req.nextUrl.searchParams.get("user"));
    return NextResponse.json({ diagnostics: await memberDiagnostics(userId, asaasDeps()) }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Não foi possível consultar o membro no Asaas.");
  }
}

const actionSchema = z.object({
  user: z.string().trim().min(1).max(200),
  action: z.enum(["refresh", "documents", "webhook", "webhook_reactivate", "regenerate_key", "recover", "restart"]),
});

/**
 * POST /api/admin/bank/asaas/member — ações do suporte para um membro:
 *   refresh             consulta GET /myAccount/status e aplica
 *   documents           envia ao Asaas o que a PRX tem (15 s após a criação)
 *   webhook             grava URL, eventos e token atuais no webhook da subconta
 *   webhook_reactivate  idem e reativa a fila interrompida pelo Asaas
 *   regenerate_key      gera chave nova para subconta sem chave (exige liberação no painel do Asaas)
 *   recover             retoma a abertura: procura a subconta pelo CPF antes de criar
 *   restart             recomeça a abertura sem apagar o cadastro: o membro volta ao formulário
 *                       e a subconta (com a chave) é reaproveitada no próximo envio
 * Nenhuma ação movimenta dinheiro.
 */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    const rate = checkRateLimit(`admin_asaas_member_${admin.sub}`, 30, 300);
    if (!rate.allowed) throw new PartnerError(`Muitas ações em sequência. Tente em ${rate.resetInSeconds}s.`, 429);
    const parsed = actionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new PartnerError("Ação inválida.", 422);
    const userId = await userFrom(parsed.data.user);
    const deps = asaasDeps();
    let result: unknown;
    switch (parsed.data.action) {
      case "refresh":
        result = await refreshSubaccountStatus(userId, deps);
        break;
      case "documents":
        result = await syncOnboardingDocuments(userId, deps);
        break;
      case "webhook":
      case "webhook_reactivate":
        result = await syncSubaccountWebhook(userId, deps, parsed.data.action === "webhook_reactivate");
        break;
      case "regenerate_key":
        await regenerateSubaccountKey(userId, deps);
        result = { hasApiKey: true };
        break;
      case "recover":
        result = await openSubaccount(userId, deps);
        break;
      case "restart":
        result = await restartOpening(userId, deps, admin.email || admin.sub);
        break;
    }
    console.info(`[prx-bank:admin] ${admin.email ?? admin.sub} → ${parsed.data.action} user=${userId}`);
    return NextResponse.json({ success: true, result, diagnostics: await memberDiagnostics(userId, deps) }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Não foi possível concluir a ação no Asaas.");
  }
}
