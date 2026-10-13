// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { webhookAuthToken, webhookTokenMatches } from "@/lib/asaas/config";
import { bankLog } from "@/lib/asaas/log";
import { getAsaasBankStore } from "@/lib/bank/asaas/store";
import { validateWithdraw, withdrawValidationSchema } from "@/lib/bank/asaas/withdraw-validation";
import { errorMessage } from "@/lib/errors";

const EVENT = "webhook.validate_withdraw";

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

/**
 * POST /api/bank/webhooks/validate-withdraw — mecanismo de validação de saque
 * do Asaas. Responde { status: "APPROVED" } só para saídas confirmadas pelo
 * membro no app; o resto recebe { status: "REFUSED", refuseReason }. Pela
 * documentação, resposta sem APPROVED/REFUSED ou 3 falhas seguidas cancelam a
 * saída. Autenticado pelo header asaas-access-token (ASAAS_WEBHOOK_AUTH_TOKEN).
 * Só lê os pedidos do PRX: não depende da chave do Asaas estar ligada.
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
  if (raw.length > 100_000) return NextResponse.json({ status: "REFUSED", refuseReason: "Requisição inválida." });
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ status: "REFUSED", refuseReason: "Requisição inválida." });
  }
  const parsed = withdrawValidationSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ status: "REFUSED", refuseReason: "Requisição inválida." });

  const object = parsed.data.transfer ?? parsed.data.bill ?? parsed.data.pixQrCode ?? null;
  const where = { step: parsed.data.type, asaasId: text(object?.id), localId: text(object?.externalReference) };
  try {
    const answer = await validateWithdraw(parsed.data, { store: getAsaasBankStore(), now: () => new Date() });
    bankLog(answer.status === "APPROVED" ? "info" : "warn", EVENT, {
      ...where,
      outcome: answer.status,
      httpStatus: 200,
      durationMs: Date.now() - started,
      detail: answer.status === "REFUSED" ? answer.refuseReason : null,
    });
    return NextResponse.json(answer);
  } catch (error) {
    // 5xx: o Asaas tenta de novo (até 3 vezes) e, sem resposta válida, cancela a saída.
    bankLog("error", EVENT, { ...where, outcome: "error", httpStatus: 500, durationMs: Date.now() - started, error: errorMessage(error) });
    return NextResponse.json({ error: "Falha ao validar." }, { status: 500 });
  }
}
