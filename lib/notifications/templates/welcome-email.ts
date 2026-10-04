// Hello World
import { COMPANY } from "@/lib/company";
import { escapeHtml, firstName } from "@/lib/notifications/format";

/*
 * E-mail de boas-vindas PRX ("Você entrou. Welcome to PRX."), na identidade
 * Cyber-Luxury Obsidian: fundo obsidiana, títulos em caixa alta e violeta nos
 * destaques. Feito para clientes de e-mail: tabelas, estilos inline, colunas
 * híbridas (inline-block + tabela fantasma do Outlook) que empilham no celular
 * sem depender de media query, imagens PNG/JPG em 2x (public/email, geradas por
 * scripts/build-email-assets.mjs) e versão em texto puro.
 */

export interface WelcomeEmailInput {
  /** Nome completo do membro (a saudação usa o primeiro nome). */
  name: string;
  email: string;
  /** Endereço do app para os links (sem barra no fim). */
  siteUrl: string;
  /** Endereço de onde as imagens de /email são servidas. */
  assetsUrl: string;
  /** PRX COINS de boas-vindas. Zero esconde o selo "Seu saldo inicial". */
  startingCoins: number;
}

export interface RenderedEmail {
  subject: string;
  preheader: string;
  html: string;
  text: string;
}

const FONT = "'Barlow','Helvetica Neue',Helvetica,Arial,sans-serif";
const C = {
  bg: "#050508",
  card: "#0b0b14",
  cardLine: "#2a2342",
  line: "#23202f",
  ink: "#ffffff",
  body: "#c6c6d4",
  muted: "#8b8ba0",
  violet: "#9468fa",
  fill: "#7c3aed",
} as const;

interface TextStyle {
  size: number;
  line?: number;
  weight?: 300 | 400 | 500 | 600 | 700;
  color?: string;
  spacing?: number;
  upper?: boolean;
  italic?: boolean;
  align?: "left" | "center" | "right";
}

/** Estilo de texto em propriedades longas (o atalho `font:` falha no Outlook). */
function t({ size, line = 1.5, weight = 400, color = C.body, spacing = 0, upper = false, italic = false, align }: TextStyle): string {
  return [
    "margin:0",
    `font-family:${FONT}`,
    `font-size:${size}px`,
    `line-height:${Math.round(size * line)}px`,
    `font-weight:${weight}`,
    `color:${color}`,
    spacing ? `letter-spacing:${spacing}px` : "",
    upper ? "text-transform:uppercase" : "",
    italic ? "font-style:italic" : "",
    align ? `text-align:${align}` : "",
  ]
    .filter(Boolean)
    .join(";");
}

/** Colunas híbridas: lado a lado a partir de 600px, empilhadas abaixo disso. */
function columns(cells: ReadonlyArray<{ width: number; html: string; className?: string }>): string {
  const ghostOpen = `<!--[if mso]><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td width="${cells[0]?.width}" valign="top"><![endif]-->`;
  const body = cells
    .map((cell, i) => {
      const ghost = i === 0 ? "" : `<!--[if mso]></td><td width="${cell.width}" valign="top"><![endif]-->`;
      return `${ghost}<div class="${cell.className ?? "col"}" style="display:inline-block;width:100%;max-width:${cell.width}px;vertical-align:top;">${cell.html}</div>`;
    })
    .join("");
  return `${ghostOpen}${body}<!--[if mso]></td></tr></table><![endif]-->`;
}

const img = (src: string, width: number, alt: string, extra = "") =>
  `<img src="${src}" width="${width}" alt="${escapeHtml(alt)}" style="display:block;border:0;outline:none;text-decoration:none;height:auto;${extra}">`;

interface Pillar {
  key: "pass" | "bank" | "live" | "invest" | "level" | "me";
  name: string;
  hook: string;
  body: string;
}

const PILLARS: ReadonlyArray<Pillar> = [
  { key: "pass", name: "PASS", hook: "Benefícios que você realmente vai querer usar.", body: "Descontos, experiências, vantagens e acessos exclusivos em marcas parceiras." },
  { key: "bank", name: "BANK", hook: "Seu dinheiro, do seu jeito.", body: "Conta e soluções financeiras pensadas para uma geração que quer começar cedo a ter autonomia." },
  { key: "live", name: "LIVE", hook: "A vida também acontece offline.", body: "Festas, encontros, esporte, experiências e eventos criados pela PRX." },
  { key: "invest", name: "INVEST", hook: "Investir não precisa parecer coisa de adulto engravatado.", body: "Conteúdo e acesso a soluções para começar a construir o próximo capítulo do seu dinheiro." },
  { key: "level", name: "LEVEL", hook: "Ideia boa merece sair do bloco de notas.", body: "Mentorias, encontros e conexões para quem quer empreender, criar e fazer acontecer." },
  { key: "me", name: "ME", hook: "Performance também é saber cuidar da cabeça.", body: "Um espaço dedicado à saúde mental, autocuidado e acesso a profissionais." },
];

const COIN_POINTS: ReadonlyArray<{ icon: "trophy" | "gift" | "users"; text: string }> = [
  { icon: "trophy", text: "Mais ações, mais coins" },
  { icon: "gift", text: "Benefícios reais dentro e fora do app" },
  { icon: "users", text: "Suas escolhas constroem o seu próximo" },
];

const COIN_HABITS = ["Participar de desafios.", "Cuidar de você.", "Aprender.", "Construir.", "Fazer escolhas melhores."];

export function renderWelcomeEmail(input: WelcomeEmailInput): RenderedEmail {
  const site = input.siteUrl.replace(/\/+$/, "");
  const asset = (file: string) => `${input.assetsUrl.replace(/\/+$/, "")}/email/${file}`;
  const first = firstName(input.name);
  const hey = first ? `Hey, ${escapeHtml(first.toLocaleUpperCase("pt-BR"))}.` : "Hey.";
  const subject = "Você entrou. Welcome to PRX.";
  const preheader = "Aqui, suas escolhas valem. Conheça as PRX COINS e tudo o que tem aqui dentro.";
  const coins = Math.max(0, Math.floor(input.startingCoins));
  const legal = `${escapeHtml(COMPANY.legalName)}${COMPANY.cnpj ? ` · CNPJ ${escapeHtml(COMPANY.cnpj)}` : ""}`;
  const support = escapeHtml(COMPANY.supportEmail);

  const header = `
  <tr><td class="px" style="padding:28px 40px 22px 40px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td valign="middle"><a href="${site}" style="text-decoration:none;">${img(asset("prx-logo.png"), 104, "PRX")}</a></td>
      <td valign="middle" align="right" class="hide-sm" style="${t({ size: 9, spacing: 2.5, upper: true, color: C.muted, weight: 500, align: "right" })}">
        ${escapeHtml(COMPANY.tagline)}&nbsp;&nbsp;<span style="display:inline-block;width:32px;height:1px;line-height:1px;font-size:1px;background-color:${C.fill};vertical-align:middle;">&nbsp;</span>
      </td>
    </tr></table>
  </td></tr>`;

  const hero = `
  <tr><td class="hero px" background="${asset("hero.jpg")}" bgcolor="${C.bg}" valign="top" style="background-color:${C.bg};background-image:url('${asset("hero.jpg")}');background-position:right center;background-repeat:no-repeat;background-size:cover;padding:52px 40px 60px 40px;">
    <table role="presentation" class="hero-copy" width="330" cellpadding="0" cellspacing="0" border="0" style="width:330px;max-width:330px;"><tr><td>
      <p style="${t({ size: 13, weight: 600, spacing: 3, upper: true, color: C.ink })}">${hey}</p>
      <h1 class="h1" style="${t({ size: 40, line: 1.05, weight: 700, spacing: 0.5, upper: true, color: C.ink })};margin-top:14px;">Você entrou.<br>Welcome to <span style="color:${C.violet};">PRX.</span></h1>
      <p style="${t({ size: 15, line: 1.6 })};margin-top:18px;">A PRX nasceu de uma ideia simples: enquanto todo mundo fala sobre a próxima geração, a gente prefere construir com ela.</p>
      <p style="${t({ size: 15, line: 1.6, weight: 600, color: C.ink })};margin-top:12px;">Aqui, suas escolhas valem.</p>
    </td></tr></table>
  </td></tr>`;

  const coinText = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:0 0 18px 0;text-align:left;">
      <p style="${t({ size: 10, spacing: 2, upper: true, color: C.muted, weight: 500 })}">Dentro da PRX, bons comportamentos podem virar</p>
      <h2 style="${t({ size: 34, line: 1.05, weight: 700, spacing: 0.5, upper: true, color: C.ink })};margin-top:8px;">PRX COINS.</h2>
      <p style="${t({ size: 13, line: 1.6 })};margin-top:12px;">${COIN_HABITS.join("<br>")}</p>
      <p style="${t({ size: 13, line: 1.6, color: C.ink, weight: 500 })};margin-top:10px;">Você acumula. E troca por benefícios, experiências, produtos e acessos dentro da PRX.</p>
    </td></tr></table>`;

  const coinVisual = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:22px 0 18px 0;">
      ${img(asset("prx-coin.png"), 104, "Moeda PRX COINS")}
    </td></tr></table>`;

  const coinList = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="coin-list" style="padding:6px 0 18px 16px;border-left:1px solid ${C.line};text-align:left;">
      ${COIN_POINTS.map(
        (p, i) => `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${i > 0 ? `border-top:1px solid ${C.line};` : ""}"><tr>
        <td width="30" valign="middle" style="padding:12px 0;">${img(asset(`icon-${p.icon}.png`), 20, "")}</td>
        <td valign="middle" style="padding:12px 0;${t({ size: 10, line: 1.45, spacing: 1.4, upper: true, color: C.ink, weight: 500 })}">${p.text}</td>
      </tr></table>`,
      ).join("")}
    </td></tr></table>`;

  const coinsCard = `
  <tr><td class="px-card" style="padding:8px 20px 0 20px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.card}" style="background-color:${C.card};border:1px solid ${C.cardLine};border-radius:14px;border-collapse:separate;">
      <tr><td style="padding:28px 24px 6px 24px;font-size:0;text-align:center;">
        ${columns([
          { width: 250, html: coinText },
          { width: 110, html: coinVisual },
          { width: 150, html: coinList },
        ])}
      </td></tr>
      <tr><td style="padding:0 24px 22px 24px;${t({ size: 10, spacing: 2.5, upper: true, color: C.violet, weight: 600, align: "right" })}">Good choices. Real rewards.</td></tr>
    </table>
  </td></tr>`;

  const pillarCard = (p: Pillar) => `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:0 5px 10px 5px;">
      <a href="${site}" style="display:block;text-decoration:none;color:${C.ink};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.card}" style="background-color:${C.card};border:1px solid ${C.line};border-radius:12px;border-collapse:separate;">
        <tr><td style="padding:0;">${img(asset(`pillar-${p.key}.jpg`), 176, "", "width:100%;border-radius:11px 11px 0 0;")}</td></tr>
        <tr><td class="pillar-copy" valign="top" style="padding:4px 14px 16px 14px;height:196px;text-align:left;vertical-align:top;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td valign="middle">${img(asset(`icon-${p.key}.png`), 20, "")}</td>
            <td valign="middle" align="right">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr><td width="26" height="26" align="center" valign="middle" style="width:26px;height:26px;border:1px solid #4a4560;border-radius:13px;">${img(asset("icon-arrow.png"), 12, "")}</td></tr></table>
            </td>
          </tr></table>
          <h3 style="${t({ size: 16, line: 1.2, weight: 700, spacing: 1, upper: true, color: C.ink })};margin-top:12px;">PRX <span style="color:${C.violet};">${p.name}</span></h3>
          <p style="${t({ size: 12, line: 1.45, weight: 600, color: C.ink })};margin-top:8px;">${p.hook}</p>
          <p style="${t({ size: 12, line: 1.5, color: C.body })};margin-top:6px;">${p.body}</p>
        </td></tr>
      </table>
      </a>
    </td></tr></table>`;

  const ecosystem = `
  <tr><td class="px" style="padding:44px 40px 0 40px;">
    <h2 style="${t({ size: 28, line: 1.1, weight: 700, spacing: 0.5, upper: true, color: C.ink })}">O que tem aqui?</h2>
    <p style="${t({ size: 14, line: 1.55 })};margin-top:8px;">Um ecossistema completo para você viver, aprender, construir e conquistar.</p>
  </td></tr>
  <tr><td class="px-grid" style="padding:20px 17px 0 17px;font-size:0;text-align:center;">
    ${columns(PILLARS.slice(0, 3).map((p) => ({ width: 188, html: pillarCard(p), className: "col3" })))}
    ${columns(PILLARS.slice(3).map((p) => ({ width: 188, html: pillarCard(p), className: "col3" })))}
  </td></tr>`;

  const coinsChip =
    coins > 0
      ? `
      <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:16px auto 0 auto;"><tr>
        <td valign="middle" style="padding-right:10px;">${img(asset("prx-coin.png"), 30, "")}</td>
        <td valign="middle" style="text-align:left;">
          <p style="${t({ size: 9, spacing: 2, upper: true, color: C.muted, weight: 500 })}">Seu saldo inicial:</p>
          <p style="${t({ size: 17, line: 1.2, weight: 700, spacing: 1, upper: true, color: C.violet })}">${coins.toLocaleString("pt-BR")} PRX COINS</p>
        </td>
      </tr></table>`
      : "";

  const cta = `
  <tr><td class="px-card" style="padding:24px 20px 0 20px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.card}" style="background-color:${C.card};border:1px solid ${C.cardLine};border-radius:14px;border-collapse:separate;">
      <tr><td style="padding:26px 24px 26px 24px;font-size:0;text-align:center;">
        ${columns([
          {
            width: 140,
            html: `<p class="cta-side" style="${t({ size: 11, line: 1.7, spacing: 1.5, upper: true, italic: true, color: C.muted, weight: 500, align: "left" })};padding:4px 0 14px 0;">Explore.<br>Participe.<br>Ganhe PRX COINS.<br>Use seus benefícios.</p>`,
          },
          {
            width: 230,
            html: `
      <p style="${t({ size: 14, line: 1.4, weight: 600, color: C.ink, align: "center" })}">E isso é só o começo.</p>
      <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:14px auto 0 auto;"><tr>
        <td align="center" bgcolor="${C.fill}" style="border-radius:26px;border-collapse:separate;background-color:${C.fill};background-image:linear-gradient(90deg,#7c3aed,#4f46e5);">
          <a href="${site}" style="display:inline-block;padding:15px 28px;${t({ size: 13, line: 1.2, weight: 700, spacing: 2, upper: true, color: C.ink })};text-decoration:none;border-radius:26px;">Entrar na PRX&nbsp;&rarr;</a>
        </td>
      </tr></table>${coinsChip}`,
          },
          {
            width: 140,
            html: `<p class="cta-side" style="${t({ size: 17, line: 1.2, spacing: 1, upper: true, italic: true, color: C.violet, weight: 700, align: "right" })};padding:14px 0 4px 0;">Você no<br>próximo.</p>`,
          },
        ])}
      </td></tr>
    </table>
  </td></tr>`;

  const closing = `
  <tr><td class="px" style="padding:44px 40px 0 40px;font-size:0;">
    ${columns([
      {
        width: 270,
        html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:0 16px 22px 0;text-align:left;">
          <h2 style="${t({ size: 24, line: 1.15, weight: 700, spacing: 0.5, upper: true, color: C.ink })}">Você não entrou<br>em mais um app.</h2>
          <p style="${t({ size: 24, line: 1.15, weight: 700, spacing: 0.5, upper: true, color: C.violet })};margin-top:6px;">Você entrou<br>no próximo.</p>
        </td></tr></table>`,
      },
      {
        width: 250,
        html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="closing-copy" style="padding:0 0 22px 20px;border-left:1px solid ${C.line};text-align:left;">
          <p style="${t({ size: 13, line: 1.6 })}">A PRX vai crescer junto com quem está aqui dentro.<br>Então explore. Participe. Ganhe PRX COINS. Use seus benefícios.<br>E ajude a construir o que vem depois.</p>
          <div style="padding-top:18px;">${img(asset("prx-logo.png"), 96, "PRX")}</div>
          <p style="${t({ size: 10, spacing: 3, upper: true, color: C.muted, weight: 500 })};margin-top:10px;">the next pays</p>
        </td></tr></table>`,
      },
    ])}
  </td></tr>`;

  const footer = `
  <tr><td class="px" style="padding:30px 40px 0 40px;"><div style="border-top:1px solid ${C.line};height:1px;line-height:1px;font-size:1px;">&nbsp;</div></td></tr>
  <tr><td class="px" style="padding:18px 40px 0 40px;${t({ size: 10, line: 1.8, spacing: 2, upper: true, color: C.muted, weight: 500, align: "center" })}">
    Experiências&nbsp;&nbsp;·&nbsp;&nbsp;Pessoas&nbsp;&nbsp;·&nbsp;&nbsp;Escolhas&nbsp;&nbsp;·&nbsp;&nbsp;Próximos capítulos
  </td></tr>
  <tr><td class="px" style="padding:14px 40px 40px 40px;">
    <p style="${t({ size: 11, line: 1.6, color: C.muted, align: "center" })}">
      Dúvidas? Fale com a gente em <a href="mailto:${support}" style="color:${C.body};text-decoration:underline;">${support}</a>.<br>
      Você recebeu este e-mail porque criou sua conta PRX com ${escapeHtml(input.email)}.<br>
      <a href="${site}/termos" style="color:${C.body};text-decoration:underline;">Termos de Uso</a>&nbsp;·&nbsp;<a href="${site}/privacidade" style="color:${C.body};text-decoration:underline;">Política de Privacidade</a>&nbsp;·&nbsp;${legal}
    </p>
  </td></tr>`;

  const html = `<!doctype html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<!-- Hello World -->
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${subject}</title>
<!--[if !mso]><!--><link href="https://fonts.googleapis.com/css2?family=Barlow:ital,wght@0,400;0,500;0,600;0,700;1,500;1,700&display=swap" rel="stylesheet"><!--<![endif]-->
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
  :root { color-scheme: dark; supported-color-schemes: dark; }
  body { margin:0; padding:0; width:100% !important; background-color:${C.bg}; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table, td { border-collapse:collapse; mso-table-lspace:0; mso-table-rspace:0; }
  img { -ms-interpolation-mode:bicubic; }
  a { color:${C.violet}; }
  ::selection { background:${C.fill}; color:#ffffff; }
  @media only screen and (max-width:599px) {
    .px { padding-left:22px !important; padding-right:22px !important; }
    .px-card { padding-left:12px !important; padding-right:12px !important; }
    .px-grid { padding-left:12px !important; padding-right:12px !important; }
    .hero { background-image:url('${asset("hero-mobile.jpg")}') !important; background-position:center bottom !important; padding-top:36px !important; padding-bottom:300px !important; }
    .hero-copy { width:100% !important; max-width:100% !important; }
    .h1 { font-size:34px !important; line-height:36px !important; }
    .hide-sm { display:none !important; }
    .col3 { max-width:50% !important; }
    .pillar-copy { height:auto !important; }
    .coin-list, .closing-copy { border-left:0 !important; padding-left:0 !important; }
    .cta-side { text-align:center !important; }
  }
  @media only screen and (max-width:359px) {
    .col3 { max-width:100% !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${C.bg};">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${C.bg};opacity:0;">${preheader}${"&#847;&zwnj;&nbsp;".repeat(60)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="background-color:${C.bg};">
    <tr><td align="center" style="padding:0;">
      <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto;">
        ${header}
        ${hero}
        ${coinsCard}
        ${ecosystem}
        ${cta}
        ${closing}
        ${footer}
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    `${first ? `Hey, ${first}.` : "Hey."}`,
    "Você entrou.",
    "Welcome to PRX.",
    "",
    "A PRX nasceu de uma ideia simples: enquanto todo mundo fala sobre a próxima geração, a gente prefere construir com ela.",
    "Aqui, suas escolhas valem.",
    "",
    "PRX COINS",
    "Dentro da PRX, bons comportamentos podem virar PRX COINS.",
    ...COIN_HABITS,
    "Você acumula.",
    "E troca por benefícios, experiências, produtos e acessos dentro da PRX.",
    "Good choices. Real rewards.",
    "",
    "O que tem aqui?",
    ...PILLARS.flatMap((p) => ["", `PRX ${p.name}`, p.hook, p.body]),
    "",
    "E isso é só o começo.",
    "A PRX vai crescer junto com quem está aqui dentro.",
    "Então explore. Participe. Ganhe PRX COINS. Use seus benefícios.",
    "E ajude a construir o que vem depois.",
    ...(coins > 0 ? [`Seu saldo inicial: ${coins.toLocaleString("pt-BR")} PRX COINS`] : []),
    "",
    `Entrar na PRX: ${site}`,
    "",
    "Você não entrou em mais um app.",
    "Você entrou no próximo.",
    "",
    "PRX",
    "the next pays",
    "",
    "---",
    `Dúvidas? Fale com a gente em ${COMPANY.supportEmail}.`,
    `Você recebeu este e-mail porque criou sua conta PRX com ${input.email}.`,
    `Termos de Uso: ${site}/termos · Política de Privacidade: ${site}/privacidade`,
  ].join("\n");

  return { subject, preheader, html, text };
}
