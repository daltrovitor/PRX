// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/security";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse, readJson } from "@/lib/partners/http";
import { firstIssue } from "@/lib/partners/types";
import { deleteSubscription, listSubscriptions, saveSubscription } from "@/lib/push/repository";
import { pushConfigured, vapidPublicKey } from "@/lib/push/send";

const NO_STORE = { "Cache-Control": "no-store" };
const b64url = z.string().trim().min(8).max(200).regex(/^[A-Za-z0-9_-]+=*$/, "Chave inválida.");
const endpoint = z.string().trim().url().max(1000).refine((v) => v.startsWith("https://"), "Endereço de notificação inválido.");

const postSchema = z.object({ action: z.literal("subscribe"), subscription: z.object({ endpoint, keys: z.object({ p256dh: b64url, auth: b64url }) }) });
const deleteSchema = z.object({ endpoint });

async function member(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) throw new PartnerError("Entre na sua conta para ativar as notificações.", 401);
  return user;
}

/** GET /api/push — se o servidor envia notificações no celular, a chave pública e quantos aparelhos a conta ativou. */
export async function GET(req: NextRequest) {
  try {
    const user = await member(req);
    return NextResponse.json({ success: true, configured: pushConfigured(), publicKey: vapidPublicKey(), devices: (await listSubscriptions(user.id)).length }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao consultar as notificações.");
  }
}

/** POST /api/push — ativa as notificações neste aparelho ({ action: "subscribe" }). */
export async function POST(req: NextRequest) {
  try {
    const user = await member(req);
    const limit = checkRateLimit(`push:${user.id}`, 10, 60);
    if (!limit.allowed) throw new PartnerError(`Muitas tentativas. Aguarde ${limit.resetInSeconds}s.`, 429);
    const parsed = postSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 400);
    if (!pushConfigured()) throw new PartnerError("As notificações no celular ainda estão sendo ativadas pela PRX. Tente mais tarde.", 503);

    const { subscription } = parsed.data;
    const saved = await saveSubscription({ userId: user.id, endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, userAgent: req.headers.get("user-agent") ?? "" });
    if (!saved) throw new PartnerError("As notificações no celular ainda estão sendo ativadas pela PRX. Tente mais tarde.", 503);
    return NextResponse.json({ success: true }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao ativar as notificações.");
  }
}

/** DELETE /api/push — desativa este aparelho. */
export async function DELETE(req: NextRequest) {
  try {
    const user = await member(req);
    const parsed = deleteSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 400);
    await deleteSubscription(parsed.data.endpoint, user.id);
    return NextResponse.json({ success: true }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Erro ao desativar as notificações.");
  }
}
