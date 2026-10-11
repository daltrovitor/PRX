// Hello World
import { COMPANY } from "@/lib/company";
import { escapeHtml } from "@/lib/notifications/format";
import type { RenderedEmail } from "@/lib/notifications/templates/welcome-email";

export interface MinorEventAuthorizationEmailInput {
  parentEmail: string;
  childName: string;
  childEmail: string;
  eventTitle: string;
  eventStartsAt: string;
  eventVenue: string;
  eventCity: string;
  eventAddress?: string | null;
  eventAgeRating: string;
  organizerName?: string | null;
  authorizationUrl: string;
}

const FONT = "'Barlow','Helvetica Neue',Helvetica,Arial,sans-serif";

export function renderMinorEventAuthorizationEmail(input: MinorEventAuthorizationEmailInput): RenderedEmail {
  const dateFormatted = new Date(input.eventStartsAt).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const subject = `Autorização de Entrada: ${input.eventTitle} · PRX`;
  const preheader = `${input.childName} precisa da sua autorização para participar do evento ${input.eventTitle}.`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#050508;font-family:${FONT};color:#c6c6d4;">
  <div style="display:none;font-size:1px;color:#050508;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    ${escapeHtml(preheader)}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#050508;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#0b0b14;border:1px solid #23202f;border-radius:16px;overflow:hidden;">
          <!-- Top bar -->
          <tr>
            <td style="padding:28px 32px 20px;border-bottom:1px solid #1a1824;">
              <span style="font-size:18px;font-weight:700;letter-spacing:2px;color:#ffffff;">PRX</span>
              <span style="font-size:12px;color:#8b8ba0;margin-left:8px;letter-spacing:1px;text-transform:uppercase;">LIVE · AUTORIZAÇÃO LEGAL</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:600;color:#ffffff;line-height:1.3;">
                Autorização para menor de idade
              </h1>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#c6c6d4;">
                Olá. Seu filho(a) ou dependente <strong style="color:#ffffff;">${escapeHtml(input.childName)}</strong> (${escapeHtml(input.childEmail)}) solicitou um ingresso para o evento <strong style="color:#ffffff;">${escapeHtml(input.eventTitle)}</strong>.
              </p>
              <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#9b9ba8;">
                Conforme o Estatuto da Criança e do Adolescente (Lei Federal nº 8.069/1990) e as normas de segurança do evento, a participação de menores de 18 anos exige a autorização expressa do responsável legal.
              </p>

              <!-- Event Details Card -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#11111c;border:1px solid #282438;border-radius:12px;margin:0 0 28px;padding:20px;">
                <tr>
                  <td>
                    <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:1.5px;color:#9468fa;text-transform:uppercase;">Dados do Evento</p>
                    <p style="margin:0 0 6px;font-size:17px;font-weight:600;color:#ffffff;">${escapeHtml(input.eventTitle)}</p>
                    <p style="margin:0 0 6px;font-size:13px;color:#c6c6d4;"><strong>Data:</strong> ${escapeHtml(dateFormatted)}</p>
                    <p style="margin:0 0 6px;font-size:13px;color:#c6c6d4;"><strong>Local:</strong> ${escapeHtml(input.eventVenue)}, ${escapeHtml(input.eventCity)}${input.eventAddress ? ` (${escapeHtml(input.eventAddress)})` : ""}</p>
                    <p style="margin:0 0 6px;font-size:13px;color:#c6c6d4;"><strong>Classificação indicativa:</strong> ${escapeHtml(input.eventAgeRating)}</p>
                    ${input.organizerName ? `<p style="margin:0;font-size:13px;color:#c6c6d4;"><strong>Organizador:</strong> ${escapeHtml(input.organizerName)}</p>` : ""}
                  </td>
                </tr>
              </table>

              <!-- Action Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;">
                <tr>
                  <td align="center">
                    <a href="${escapeHtml(input.authorizationUrl)}" target="_blank" style="display:inline-block;padding:14px 32px;background-color:#6c0cf0;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;letter-spacing:0.3px;">
                      Revisar e Autorizar Entrada
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 12px;font-size:12px;line-height:1.5;color:#717182;">
                Se o botão acima não funcionar, copie e cole este link no seu navegador:<br>
                <a href="${escapeHtml(input.authorizationUrl)}" style="color:#9468fa;text-decoration:underline;word-break:break-all;">${escapeHtml(input.authorizationUrl)}</a>
              </p>
              <p style="margin:0;font-size:12px;line-height:1.5;color:#717182;">
                Caso não reconheça este pedido ou deseje recusar, basta acessar o link acima e clicar em "Recusar Autorização".
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #1a1824;font-size:11px;color:#5a5a6b;line-height:1.5;">
              ${escapeHtml(COMPANY.legalName)} · CNPJ ${escapeHtml(COMPANY.cnpj)}<br>
              E-mail enviado automaticamente para ${escapeHtml(input.parentEmail)}.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `PRX LIVE · AUTORIZAÇÃO DE ENTRADA PARA MENOR

Olá,

Seu filho(a) ou dependente ${input.childName} (${input.childEmail}) solicitou um ingresso para o evento "${input.eventTitle}".

Conforme o Estatuto da Criança e do Adolescente (Lei Federal nº 8.069/1990), a entrada de menores de 18 anos exige a autorização expressa do responsável legal.

DETALHES DO EVENTO:
- Evento: ${input.eventTitle}
- Data e Horário: ${dateFormatted}
- Local: ${input.eventVenue}, ${input.eventCity}${input.eventAddress ? ` (${input.eventAddress})` : ""}
- Classificação: ${input.eventAgeRating}
${input.organizerName ? `- Organizador: ${input.organizerName}\n` : ""}
Para autorizar ou recusar a participação, acesse o link seguro:
${input.authorizationUrl}

${COMPANY.legalName} · CNPJ ${COMPANY.cnpj}
`;

  return { subject, preheader, html, text };
}
