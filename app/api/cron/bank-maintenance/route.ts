// Hello World
import crypto from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { purgeRejectedDocuments } from "@/lib/kyc/identity";
import { evaluateActiveRules, evaluationDeps } from "@/lib/behaviors/service";

export const maxDuration = 60;

/**
 * Manutenção diária do PRX BANK (Vercel Cron). Protegida por CRON_SECRET no
 * cabeçalho Authorization: Bearer. Faz a retenção de documentos de aberturas
 * recusadas (LGPD) e avalia os comportamentos verificáveis; a conciliação com
 * o banco parceiro entra aqui quando houver um provedor ligado.
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
  // Comportamentos verificáveis: avalia as regras ativas com os pagamentos do dia (idempotente por dia).
  const behaviors = await evaluateActiveRules(evaluationDeps()).catch((err: unknown) => ({ rules: 0, evaluated: 0, error: err instanceof Error ? err.message : String(err) }));
  return NextResponse.json({ success: true, retention, behaviors });
}
