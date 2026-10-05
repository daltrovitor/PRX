// Hello World
import { emailAssetsUrl } from "@/lib/notifications/config";
import { sendEmail } from "@/lib/notifications/email";
import { maskEmail } from "@/lib/notifications/format";
import { recordDelivery } from "@/lib/notifications/log";
import { renderResenhaListEmail } from "@/lib/notifications/templates/resenha-list-email";
import type { DeliveryResult } from "@/lib/notifications/types";
import { guestPageUrl } from "@/lib/resenha/config";
import { editionTitle, editionHeadline, type AccessRequest, type ResenhaEdition } from "@/lib/resenha/types";

export interface ListEmailContext {
  request: AccessRequest;
  edition: ResenhaEdition;
  insiderName: string;
  ticketId: string;
  event: { startsAt: string; venue: string; address: string; city: string };
  /** Base pública (de onde o Insider liberou o acesso). */
  baseUrl: string;
}

/**
 * Avisa o convidado que ele está na lista. Nunca lança: chame dentro de after()
 * para não atrasar a resposta ao Insider. A chave de idempotência é o ingresso, então
 * repetir a chamada não manda e-mail duplicado.
 */
export async function sendListEmail(ctx: ListEmailContext): Promise<DeliveryResult> {
  let result: DeliveryResult;
  try {
    const email = renderResenhaListEmail({
      name: ctx.request.name,
      headline: editionHeadline(ctx.edition),
      title: editionTitle(ctx.edition),
      insiderName: ctx.insiderName,
      startsAt: ctx.event.startsAt,
      venue: ctx.event.venue,
      address: ctx.event.address,
      city: ctx.event.city,
      ticketUrl: guestPageUrl(ctx.baseUrl, ctx.request.token),
      assetsUrl: emailAssetsUrl(),
    });
    result = await sendEmail({ to: ctx.request.email, subject: email.subject, html: email.html, text: email.text, template: "resenha_list", idempotencyKey: `resenha-list-${ctx.ticketId}` });
  } catch {
    result = { status: "failed", provider: "resend", error: "Falha ao montar o e-mail da lista." };
  }
  await recordDelivery({ userId: null, channel: "email", template: "resenha_list", recipient: maskEmail(ctx.request.email), result }).catch(() => undefined);
  return result;
}
