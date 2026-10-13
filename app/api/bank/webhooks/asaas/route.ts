// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { webhookAuthToken, webhookTokenMatches } from "@/lib/asaas/config";
import { getAsaasClient } from "@/lib/asaas/client";
import { bankLog } from "@/lib/asaas/log";
import { asaasDeps } from "@/lib/bank/asaas/deps";
import { getAsaasBankStore } from "@/lib/bank/asaas/store";
import { asaasEventSchema, deferAsaasEvent, handleAsaasEvent } from "@/lib/bank/asaas/webhooks";
import { errorMessage } from "@/lib/errors";

const MAX_BODY = 200_000;
const EVENT = "webhook.asaas";

/**
 * POST /api/bank/webhooks/asaas — eventos financeiros e cadastrais das subcontas.
 * Autenticado pelo header asaas-access-token (ASAAS_WEBHOOK_AUTH_TOKEN), sem
 * sessão: chamada servidor a servidor. Pela documentação do Asaas, responde 200
 * depois de gravar o evento (entrega "at least once": repetido volta 200 sem
 * reprocessar). Só falha ao gravar responde 500, para o Asaas tentar de novo.
 * Com o Asaas desligado neste deploy, o evento é gravado e processado depois.
 */
// nosemgrep: prx-mutation-route-without-auth — webhook do Asaas autenticado pelo token asaas-access-token, não por sessão
export async function POST(req: NextRequest) {
  const started = Date.now();
  const token = webhookAuthToken();
  if (!token) {
    bankLog("error", EVENT, { outcome: "not_configured", httpStatus: 503, detail: "ASAAS_WEBHOOK_AUTH_TOKEN ausente neste deploy" });
    return NextResponse.json({ error: "Webhook do banco parceiro não configurado." }, { status: 503 });
  }
  if (!webhookTokenMatches(req.headers.get("asaas-access-token"), token)) {
    bankLog("warn", EVENT, { outcome: "unauthorized", httpStatus: 401 });
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ error: "Corpo grande demais." }, { status: 413 });
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const parsed = asaasEventSchema.safeParse(json);
  if (!parsed.success) {
    // Autenticado mas fora do formato: registra e não trava a fila do Asaas.
    const issue = parsed.error.issues[0];
    bankLog("warn", EVENT, { outcome: "ignored", httpStatus: 200, detail: `fora do formato: ${issue?.path.join(".") ?? ""} ${issue?.message ?? ""}` });
    return NextResponse.json({ received: false, ignored: true });
  }

  const event = parsed.data;
  const where = { step: event.event, localId: event.id, asaasId: event.account?.id ?? null };
  try {
    const outcome = getAsaasClient() ? await handleAsaasEvent(event, asaasDeps()) : await deferAsaasEvent(event, getAsaasBankStore());
    bankLog(outcome === "failed" || outcome === "deferred" ? "warn" : "info", EVENT, { ...where, outcome, httpStatus: 200, durationMs: Date.now() - started });
    return NextResponse.json({ received: true, outcome });
  } catch (error) {
    bankLog("error", EVENT, { ...where, outcome: "error", httpStatus: 500, durationMs: Date.now() - started, error: errorMessage(error) });
    return NextResponse.json({ error: "Falha ao processar o evento." }, { status: 500 });
  }
}
