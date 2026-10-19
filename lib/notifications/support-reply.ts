// Hello World
import { APP_URL } from "@/lib/domains";
import { sendEmail } from "@/lib/notifications/email";
import { escapeHtml, firstName, maskEmail } from "@/lib/notifications/format";
import { recordDelivery } from "@/lib/notifications/log";
import type { DeliveryResult } from "@/lib/notifications/types";

const FONT = "'Barlow','Helvetica Neue',Helvetica,Arial,sans-serif";

export interface SupportReplyEmail {
  userId: string;
  email: string;
  name: string;
  protocol: string;
  subject: string;
  /** Id da mensagem da equipe: o mesmo envio repetido não vira dois e-mails. */
  messageId: string;
}

/**
 * Avisa o membro que a equipe respondeu. O texto da resposta fica no app (o
 * e-mail só traz o protocolo e o link), e nada aqui interrompe quem chamou.
 */
export async function sendSupportReplyEmail(input: SupportReplyEmail): Promise<DeliveryResult> {
  const link = `${APP_URL}/#pass/atendimento`;
  const subject = `Respondemos sua solicitação ${input.protocol} · PRX`;
  const hello = firstName(input.name) ? `Oi, ${firstName(input.name)}!` : "Oi!";
  const text = `${hello}\n\nA equipe PRX respondeu sua solicitação ${input.protocol} (${input.subject}).\nVeja a resposta no app: ${link}\n\nPRX`;
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background-color:#050508;font-family:${FONT};color:#c6c6d4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#050508;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#0b0b14;border:1px solid #23202f;border-radius:16px;">
<tr><td style="padding:28px 32px 20px;border-bottom:1px solid #1a1824;"><span style="font-size:18px;font-weight:700;letter-spacing:2px;color:#ffffff;">PRX</span><span style="font-size:12px;color:#8b8ba0;margin-left:8px;letter-spacing:1px;text-transform:uppercase;">Atendimento</span></td></tr>
<tr><td style="padding:32px;">
<p style="margin:0 0 16px;font-size:18px;color:#ffffff;">${escapeHtml(hello)}</p>
<p style="margin:0 0 8px;font-size:15px;line-height:1.6;">A equipe PRX respondeu sua solicitação:</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#ffffff;"><strong>${escapeHtml(input.protocol)}</strong> · ${escapeHtml(input.subject)}</p>
<a href="${link}" style="display:inline-block;background-color:#ffffff;color:#050508;text-decoration:none;font-weight:600;font-size:15px;padding:14px 22px;border-radius:12px;">Ver a resposta no app</a>
<p style="margin:24px 0 0;font-size:13px;color:#8b8ba0;">Por segurança, a resposta completa fica só no app.</p>
</td></tr></table></td></tr></table></body></html>`;

  let result: DeliveryResult;
  try {
    result = await sendEmail({ to: input.email, subject, html, text, template: "support_reply", idempotencyKey: `support-reply-${input.messageId}` });
  } catch (err) {
    result = { status: "failed", provider: "resend", error: (err as Error)?.message?.slice(0, 300) || "Falha ao enviar o aviso do atendimento." };
  }
  await recordDelivery({ userId: input.userId, channel: "email", template: "support_reply", recipient: maskEmail(input.email), result }).catch(() => undefined);
  return result;
}
