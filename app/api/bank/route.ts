// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/security";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse, readJson } from "@/lib/partners/http";
import { firstIssue } from "@/lib/partners/types";
import {
  accountView,
  activateSandbox,
  addPixKey,
  assertBankOperational,
  CARDS_SOON,
  chargeSchema,
  createCharge,
  pixKeyInputSchema,
  removePixKey,
  sendPix,
  sendPixSchema,
} from "@/lib/bank/service";
import { previewPartnerPix, type PartnerPixResult } from "@/lib/points/service";

const NO_STORE = { "Cache-Control": "no-store" };

/** GET /api/bank — conta do membro (nasce zerada e em ativação). */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) throw new PartnerError("Não autenticado.", 401);
    return NextResponse.json({ success: true, account: await accountView(user.id) }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao carregar a conta.");
  }
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add_pix_key"), key: z.unknown() }),
  z.object({ action: z.literal("remove_pix_key"), id: z.string().min(1).max(100) }),
  z.object({ action: z.literal("request_card"), address: z.unknown() }),
  z.object({ action: z.literal("send_pix") }).loose(),
  z.object({ action: z.literal("lookup_partner"), key: z.string().trim().min(1).max(140), recipientName: z.string().trim().max(80).nullish(), amount: z.coerce.number().min(0).max(50_000).optional() }),
  z.object({ action: z.literal("sandbox_activate") }),
  z.object({ action: z.literal("create_charge") }).loose(),
  z.object({ action: z.literal("toggle_lock") }).loose(),
]);

/** Recompensa da compra em parceiro, para o aviso logo depois do Pix. */
function rewardView(result: PartnerPixResult | null) {
  if (!result || result.duplicate) return null;
  return {
    partnerName: result.purchase.partnerName,
    categoryName: result.categoryName,
    coins: result.purchase.coins,
    xp: result.purchase.xp,
    balanceCoins: result.coins,
    level: result.level,
  };
}

/**
 * POST /api/bank
 *   add_pix_key / remove_pix_key          pré-cadastro de chaves (registradas no banco na ativação)
 *   request_card / toggle_lock            cartões PRX: chegam em breve (409)
 *   lookup_partner                        identifica se a chave é de um parceiro PRX (tela de revisão)
 *   send_pix                              sandbox: liquida e passa pelo motor de compras em parceiros
 *   sandbox_activate                      só no ambiente de testes: conta ativa com saldo fictício
 *   create_charge                         cobrança Pix com QR Code dinâmico (banco parceiro; 409 até a ativação)
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) throw new PartnerError("Não autenticado.", 401);
    const limit = checkRateLimit(`bank:${user.id}`, 30, 60);
    if (!limit.allowed) throw new PartnerError(`Muitas tentativas. Aguarde ${limit.resetInSeconds}s.`, 429);

    const parsed = schema.safeParse(await readJson(req));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 400);
    const body = parsed.data;
    let reward: ReturnType<typeof rewardView> = null;

    switch (body.action) {
      case "add_pix_key": {
        const key = pixKeyInputSchema.safeParse(body.key);
        if (!key.success) throw new PartnerError(firstIssue(key.error), 422);
        await addPixKey(user.id, key.data);
        break;
      }
      case "remove_pix_key":
        await removePixKey(user.id, body.id);
        break;
      case "request_card":
      case "toggle_lock":
        throw new PartnerError(CARDS_SOON, 409);
      case "lookup_partner":
        return NextResponse.json({ success: true, partner: await previewPartnerPix(body) }, { headers: NO_STORE });
      case "sandbox_activate":
        await activateSandbox(user.id);
        break;
      case "send_pix": {
        const pix = sendPixSchema.safeParse(body);
        if (!pix.success) throw new PartnerError(firstIssue(pix.error), 422);
        reward = rewardView((await sendPix(user.id, pix.data)).partner);
        break;
      }
      case "create_charge": {
        const charge = chargeSchema.safeParse(body);
        if (!charge.success) throw new PartnerError(firstIssue(charge.error), 422);
        await createCharge(user.id, charge.data);
        break;
      }
      default:
        await assertBankOperational(user.id);
    }
    return NextResponse.json({ success: true, account: await accountView(user.id), reward }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao processar a operação.");
  }
}
