// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/security";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse, readJson } from "@/lib/partners/http";
import { firstIssue } from "@/lib/partners/types";
import { getWallet, submitClaim } from "@/lib/points/service";
import { claimInputSchema, type PointsWallet } from "@/lib/points/types";

/** 16/10/2026: comportamentos verificáveis substituem o relato. */
const CHECKIN_CLOSED = true;

const NO_STORE = { "Cache-Control": "no-store" };

/** GET /api/points — carteira PRX Coins, XP, nível, extrato, regras e compras em parceiros. */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) throw new PartnerError("Não autenticado.", 401);
    return NextResponse.json({ success: true, wallet: memberView(await getWallet(user.id)) }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao carregar seus pontos.");
  }
}

/** O "bom comportamento" por relato saiu do app: o membro vê só as regras automáticas (e o histórico dos envios antigos). */
const memberView = (wallet: PointsWallet): PointsWallet => ({ ...wallet, rules: wallet.rules.filter((r) => r.trigger !== "checkin") });

/**
 * POST /api/points — o envio de "bom comportamento" por relato foi
 * substituído pelos comportamentos verificados com os pagamentos da conta
 * PRX BANK (/api/behaviors). Envios antigos em análise seguem na fila do admin.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) throw new PartnerError("Não autenticado.", 401);
    if (CHECKIN_CLOSED) throw new PartnerError("O bom comportamento por relato foi substituído pelos comportamentos verificados pela sua conta PRX BANK.", 409);
    const limit = checkRateLimit(`points:${user.id}`, 20, 60);
    if (!limit.allowed) throw new PartnerError(`Muitas tentativas. Aguarde ${limit.resetInSeconds}s.`, 429);
    const parsed = claimInputSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 400);
    const claim = await submitClaim({ id: user.id, name: user.fullName, email: user.email }, parsed.data.ruleId, parsed.data.evidence);
    return NextResponse.json({ success: true, claim, wallet: memberView(await getWallet(user.id)) }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao enviar para análise.");
  }
}
