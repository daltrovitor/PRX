// Hello World
import { WELCOME_COINS } from "@/lib/points/repository";
import { emailAssetsUrl, publicSiteUrl } from "@/lib/notifications/config";
import { sendEmail } from "@/lib/notifications/email";
import { maskEmail } from "@/lib/notifications/format";
import { recordDelivery } from "@/lib/notifications/log";
import { renderWelcomeEmail, type RenderedEmail } from "@/lib/notifications/templates/welcome-email";
import type { DeliveryResult } from "@/lib/notifications/types";
import { brandAssetFor } from "@/lib/brand/assets";

export interface WelcomeRecipient {
  id: string;
  email: string;
  fullName: string;
}

/** O e-mail pronto. A pré-visualização passa a própria origem para as imagens aparecerem antes do deploy. */
export function buildWelcomeEmail(recipient: Pick<WelcomeRecipient, "email" | "fullName">, assetsUrl: string = emailAssetsUrl(), foundersImage: { url: string; alt: string } | null = null): RenderedEmail {
  return renderWelcomeEmail({
    name: recipient.fullName,
    email: recipient.email,
    siteUrl: publicSiteUrl(),
    assetsUrl,
    startingCoins: WELCOME_COINS,
    foundersImage,
  });
}

/**
 * Envia o "Você entrou. Welcome to PRX." para uma conta recém-criada e registra
 * o resultado. Nunca lança: chame dentro de after() para não atrasar o cadastro.
 * Envios de teste (admin) não usam a chave de idempotência, que seguraria o reenvio por 24h.
 */
export async function sendWelcomeEmail(recipient: WelcomeRecipient, options: { test?: boolean } = {}): Promise<DeliveryResult> {
  let result: DeliveryResult;
  try {
    const foundersImage = await brandAssetFor("founders_official_image", "emails").catch(() => null);
    const email = buildWelcomeEmail(recipient, emailAssetsUrl(), foundersImage);
    result = await sendEmail({
      to: recipient.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
      template: "welcome_email",
      idempotencyKey: options.test ? undefined : `welcome-${recipient.id}`,
    });
  } catch {
    result = { status: "failed", provider: "resend", error: "Falha ao montar o e-mail de boas-vindas." };
  }
  await recordDelivery({ userId: recipient.id, channel: "email", template: "welcome_email", recipient: maskEmail(recipient.email), result }).catch(() => undefined);
  return result;
}
