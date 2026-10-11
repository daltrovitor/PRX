// Hello World
import { publicSiteUrl } from "@/lib/notifications/config";
import { sendEmail } from "@/lib/notifications/email";
import { maskEmail } from "@/lib/notifications/format";
import { recordDelivery } from "@/lib/notifications/log";
import {
  renderMinorEventAuthorizationEmail,
  type MinorEventAuthorizationEmailInput,
} from "@/lib/notifications/templates/minor-event-authorization";
import type { DeliveryResult } from "@/lib/notifications/types";

export interface SendMinorAuthorizationOptions {
  ticketId: string;
  childUserId: string;
  childName: string;
  childEmail: string;
  parentEmail: string;
  token: string;
  eventTitle: string;
  eventStartsAt: string;
  eventVenue: string;
  eventCity: string;
  eventAddress?: string | null;
  eventAgeRating: string;
  organizerName?: string | null;
}

/**
 * Envia o e-mail com link de liberação para o responsável legal do menor de idade.
 * Registra a auditoria de envio e nunca estoura exceção na chamada chamadora.
 */
export async function sendMinorAuthorizationEmail(options: SendMinorAuthorizationOptions): Promise<DeliveryResult> {
  let result: DeliveryResult;
  const authorizationUrl = `${publicSiteUrl()}/autorizacao/${options.token}`;

  try {
    const emailData: MinorEventAuthorizationEmailInput = {
      parentEmail: options.parentEmail,
      childName: options.childName,
      childEmail: options.childEmail,
      eventTitle: options.eventTitle,
      eventStartsAt: options.eventStartsAt,
      eventVenue: options.eventVenue,
      eventCity: options.eventCity,
      eventAddress: options.eventAddress,
      eventAgeRating: options.eventAgeRating,
      organizerName: options.organizerName,
      authorizationUrl,
    };

    const email = renderMinorEventAuthorizationEmail(emailData);

    result = await sendEmail({
      to: options.parentEmail,
      subject: email.subject,
      html: email.html,
      text: email.text,
      template: "minor_event_authorization",
      idempotencyKey: `minor-auth-${options.ticketId}-${options.token.slice(0, 16)}`,
    });
  } catch (err) {
    result = {
      status: "failed",
      provider: "resend",
      error: (err as Error)?.message?.slice(0, 300) || "Falha ao gerar e-mail de autorização.",
    };
  }

  await recordDelivery({
    userId: options.childUserId,
    channel: "email",
    template: "minor_event_authorization",
    recipient: maskEmail(options.parentEmail),
    result,
  }).catch(() => undefined);

  return result;
}
