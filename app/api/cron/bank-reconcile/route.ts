// Hello World
import crypto from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { asaasEnabled } from "@/lib/asaas/client";
import { asaasDeps } from "@/lib/bank/asaas/deps";
import { reconcileBank } from "@/lib/bank/asaas/reconcile";
import { purgeRejectedDocuments } from "@/lib/kyc/identity";
import { evaluateActiveRules, evaluationDeps } from "@/lib/behaviors/service";

export const maxDuration = 60;

/**
 * Conciliação diária do PRX BANK com o Asaas (Vercel Cron). Protegido por
 * CRON_SECRET no cabeçalho Authorization: Bearer. Só consulta e reenvia
 * documentos/eventos de forma idempotente; nenhuma operação de dinheiro é
 * repetida. O botão "Conciliar" do admin roda o mesmo processo na hora.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;
  if (!secret || given.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  // Retenção (LGPD): arquivos de aberturas recusadas há mais de 180 dias saem do armazenamento; o registro da decisão fica.
  const retention = await purgeRejectedDocuments().catch((err: unknown) => ({ purged: 0, error: err instanceof Error ? err.message : String(err) }));
  if (!asaasEnabled()) return NextResponse.json({ success: true, retention, skipped: "Asaas desligado neste ambiente." });
  const report = await reconcileBank(asaasDeps());
  // Comportamentos verificáveis: avalia as regras ativas com os pagamentos do dia (idempotente por dia).
  const behaviors = await evaluateActiveRules(evaluationDeps()).catch((err: unknown) => ({ rules: 0, evaluated: 0, error: err instanceof Error ? err.message : String(err) }));
  return NextResponse.json({ success: true, report, retention, behaviors });
}
