// Hello World
import { COMPANY } from "@/lib/company";
import { escapeHtml } from "@/lib/notifications/format";
import { formatPartyDate } from "@/lib/resenha/format";
import type { RenderedEmail } from "@/lib/notifications/templates/welcome-email";

/*
 * E-mail "Você tá na lista": enviado quando um Insider libera o acesso. Mesma
 * identidade Obsidian do e-mail de boas-vindas (tabelas, estilos inline, texto puro
 * junto). Traz o endereço da festa, que só é revelado a quem está na lista.
 */

export interface ResenhaListEmailInput {
  name: string;
  /** "RESENHA 001 — DA BIA". */
  headline: string;
  /** "Resenha da Bia". */
  title: string;
  insiderName: string;
  startsAt: string;
  venue: string;
  address: string;
  city: string;
  ticketUrl: string;
  assetsUrl: string;
}

const FONT = "'Barlow','Helvetica Neue',Helvetica,Arial,sans-serif";
const C = { bg: "#050508", card: "#0b0b14", line: "#23202f", ink: "#ffffff", body: "#c6c6d4", muted: "#8b8ba0", violet: "#9468fa", fill: "#7c3aed" } as const;

const p = (size: number, color: string, extra = "") => `margin:0;font-family:${FONT};font-size:${size}px;line-height:${Math.round(size * 1.55)}px;color:${color};${extra}`;

export function renderResenhaListEmail(input: ResenhaListEmailInput): RenderedEmail {
  const first = input.name.trim().split(/\s+/)[0] ?? "";
  const when = formatPartyDate(input.startsAt);
  const where = [input.venue, input.address, input.city].filter(Boolean).join(" · ");
  const subject = `Você tá na lista. ${input.title}`;
  const preheader = `${input.insiderName} liberou seu acesso. Seu ingresso está no link.`;
  const support = escapeHtml(COMPANY.supportEmail);
  const row = (label: string, value: string) =>
    `<tr><td style="padding:12px 0;border-top:1px solid ${C.line};"><p style="${p(10, C.muted, "letter-spacing:2px;text-transform:uppercase;font-weight:500;")}">${label}</p><p style="${p(15, C.ink, "font-weight:600;margin-top:2px;")}">${escapeHtml(value)}</p></td></tr>`;

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<!-- Hello World -->
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.bg};">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background-color:${C.card};border:1px solid ${C.line};border-radius:6px;">
      <tr><td style="padding:28px 32px 0 32px;"><img src="${escapeHtml(input.assetsUrl)}/email/prx-logo.png" width="104" alt="PRX" style="display:block;border:0;height:auto;"></td></tr>
      <tr><td style="padding:28px 32px 8px 32px;">
        <p style="${p(13, C.muted, "letter-spacing:3px;text-transform:uppercase;font-weight:600;")}">${escapeHtml(input.headline)}</p>
        <h1 style="${p(38, C.ink, "font-weight:700;text-transform:uppercase;margin-top:12px;line-height:40px;")}">Você tá<br><span style="color:${C.violet};">na lista.</span></h1>
        <p style="${p(15, C.body, "margin-top:16px;")}">${first ? `${escapeHtml(first)}, ` : ""}${escapeHtml(input.insiderName)} liberou o seu acesso à ${escapeHtml(input.title)}. O ingresso é gratuito, pessoal e vale uma única entrada.</p>
      </td></tr>
      <tr><td style="padding:8px 32px 0 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${row("Quando", when)}${row("Onde", where)}</table></td></tr>
      <tr><td align="center" style="padding:28px 32px 8px 32px;"><a href="${escapeHtml(input.ticketUrl)}" style="display:inline-block;background-color:${C.fill};color:#ffffff;font-family:${FONT};font-size:14px;font-weight:700;letter-spacing:2px;text-transform:uppercase;text-decoration:none;padding:16px 28px;border-radius:4px;">Ver meu ingresso</a></td></tr>
      <tr><td style="padding:16px 32px 32px 32px;"><p style="${p(12, C.muted)}">Leve um documento com foto: a entrada é 18+ e o nome na lista precisa bater com o documento. Dúvidas: <a href="mailto:${support}" style="color:${C.body};">${support}</a>.</p></td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const text = [
    input.headline,
    "",
    "VOCÊ TÁ NA LISTA.",
    "",
    `${first ? `${first}, ` : ""}${input.insiderName} liberou o seu acesso à ${input.title}.`,
    "O ingresso é gratuito, pessoal e vale uma única entrada.",
    "",
    `Quando: ${when}`,
    `Onde: ${where}`,
    "",
    `Ver meu ingresso: ${input.ticketUrl}`,
    "",
    "Leve um documento com foto: a entrada é 18+ e o nome na lista precisa bater com o documento.",
    `Dúvidas: ${COMPANY.supportEmail}`,
  ].join("\n");

  return { subject, preheader, html, text };
}
