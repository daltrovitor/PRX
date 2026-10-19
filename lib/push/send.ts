// Hello World
import webpush from "web-push";
import { COMPANY } from "@/lib/company";
import { deleteSubscription, listSubscriptions } from "@/lib/push/repository";

/**
 * Notificação no celular (Web Push com chaves VAPID). Chega mesmo com o app
 * fechado, no Android e no iPhone com o app instalado na tela inicial (iOS 16.4+).
 * Sem as chaves configuradas, não envia nada e não quebra quem chamou.
 *
 * Variáveis: NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e (opcional)
 * VAPID_SUBJECT. Gere o par com `npx web-push generate-vapid-keys`.
 */

export interface PushMessage {
  title: string;
  body: string;
  /** Para onde o toque leva, dentro do app (ex.: "/#live/resenha"). */
  url: string;
  /** Mesma tag substitui a notificação anterior em vez de empilhar. */
  tag?: string;
}

export function vapidPublicKey(): string {
  return (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").trim();
}

export function pushConfigured(): boolean {
  return Boolean(vapidPublicKey() && (process.env.VAPID_PRIVATE_KEY ?? "").trim());
}

let configuredWith = "";
function ensureVapid(): boolean {
  if (!pushConfigured()) return false;
  const key = `${vapidPublicKey()}|${process.env.VAPID_PRIVATE_KEY}`;
  if (configuredWith !== key) {
    const subject = (process.env.VAPID_SUBJECT ?? "").trim() || `mailto:${COMPANY.supportEmail}`;
    webpush.setVapidDetails(subject, vapidPublicKey(), (process.env.VAPID_PRIVATE_KEY ?? "").trim());
    configuredWith = key;
  }
  return true;
}

/** Só caminhos do próprio app: nada de link externo vindo de dado salvo. */
const safeUrl = (url: string) => (url.startsWith("/") && !url.startsWith("//") ? url : "/");

/**
 * Envia para todos os aparelhos da conta. Nunca lança: devolve quantos aceitaram.
 * Inscrição expirada (404/410 no provedor) é apagada.
 */
export async function sendPushToUser(userId: string, message: PushMessage): Promise<number> {
  try {
    if (!ensureVapid()) return 0;
    const subscriptions = await listSubscriptions(userId);
    if (subscriptions.length === 0) return 0;
    const payload = JSON.stringify({ title: message.title.slice(0, 120), body: message.body.slice(0, 240), url: safeUrl(message.url), tag: message.tag ?? null });
    const results = await Promise.all(
      subscriptions.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24, urgency: "high", timeout: 8_000 });
          return true;
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) await deleteSubscription(s.endpoint).catch(() => undefined);
          return false;
        }
      })
    );
    return results.filter(Boolean).length;
  } catch {
    return 0;
  }
}
