// Hello World

/**
 * Importação de parceiro + benefícios a partir de texto colado.
 * Leitor fixo (sem IA): entende o modelo de cadastro do parceiro e uma lista
 * de benefícios, uma linha cada. Tudo vira rascunho editável antes de gravar.
 */
import { formatDocument, inferDocumentType, isValidCpf, isValidDocument, onlyDigits } from "@/lib/partners/documents";

export interface BenefitDraft {
  key: string;
  title: string;
  description: string;
  discountLabel: string;
}

export interface ImportDraft {
  tradeName: string;
  legalName: string;
  document: string;
  categoryId: string;
  location: string;
  representative: { name: string; document: string; role: string; email: string; phone: string };
  loginEmail: string;
  benefits: BenefitDraft[];
}

export const DEFAULT_LOCATION = "Goiânia, GO";
export const MAX_LABEL = 24;

const BULLET = /^[\s•·●▪◦*\-–—]+/;
const EMAIL = /[^\s@:;,]+@[^\s@:;,]+\.[^\s@:;,]+/;

type FieldKey = "tradeName" | "legalName" | "document" | "repName" | "repDocument" | "role" | "repEmail" | "phone";

const FIELD_PATTERNS: ReadonlyArray<readonly [FieldKey, RegExp]> = [
  ["tradeName", /^nome\s+fantasia\b/i],
  ["legalName", /^raz[ãa]o\s+social\b/i],
  ["document", /^cnpj\b/i],
  ["repName", /^nome\s+completo\b/i],
  ["repDocument", /^cpf\b/i],
  ["role", /^cargo\b/i],
  ["repEmail", /^e-?mail\b/i],
  ["phone", /^(telefone|celular|whatsapp|fone)\b/i],
];

/** Categoria sugerida pelas palavras do texto; vazio quando nada bate (o admin escolhe). */
const CATEGORY_HINTS: ReadonlyArray<readonly [string, RegExp]> = [
  ["viagens", /interc[aâ]mbio|turismo|viage[nm]s?|hostel|hotel|aeroporto|embarque|passagem/i],
  ["gastronomia", /restaurante|pizzaria|hamburguer|lanchonete|caf[eé]|gastronomia|sorveteria|padaria|\bbar\b/i],
  ["beleza", /beleza|barbearia|sal[aã]o|est[eé]tica|cabelo|\bspa\b/i],
  ["esportes", /academia|esporte|fitness|crossfit|corrida|treino/i],
  ["educacao", /escola|curso|idioma|faculdade|educa[cç][aã]o|ingl[eê]s/i],
  ["moda", /\bmoda\b|sneaker|roupa|cal[cç]ado|vestu[aá]rio/i],
  ["tecnologia", /tecnologia|software|inform[aá]tica|celular|eletr[oô]nico/i],
  ["entretenimento", /\bshows?\b|evento|ingresso|cinema|festival/i],
  ["saude-mental", /psic[oó]logo|terapia|sa[uú]de mental|mindfulness/i],
  ["automoveis", /carro|autom[oó]vel|ve[ií]culo|\bmoto\b|mobilidade/i],
  ["imoveis", /co-?living|im[oó]vel|moradia/i],
];

const capitalize = (text: string) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);
const tidy = (text: string) => text.replace(/[\s ]+/g, " ").trim();

export function inferCategory(text: string): string {
  return CATEGORY_HINTS.find(([, pattern]) => pattern.test(text))?.[0] ?? "";
}

/** Rótulo curto da oferta (até 24 caracteres): percentual, valor, "Grátis" ou um genérico. */
export function suggestLabel(text: string): string {
  const percent = /(\d{1,3})\s*%/.exec(text);
  if (percent) return `${percent[1]}% OFF`;
  const money = /R\$\s*(\d[\d.,]*)|(\d[\d.,]*)\s*reais/i.exec(text);
  const amount = (money?.[1] ?? money?.[2] ?? "").replace(/[.,]+$/, "");
  if (amount) return `R$ ${amount}`.slice(0, MAX_LABEL);
  if (/gr[aá]tis|gratuit|cortesia|brinde/i.test(text)) return "Grátis";
  return "Exclusivo PRX";
}

/** "Título: descrição" separa no primeiro dois-pontos; sem ele, a linha inteira vira o título quando cabe. */
function splitLine(line: string): { title: string; description: string } {
  const colon = /^(.{2,60}?):\s+(.+)$/.exec(line);
  if (colon) return { title: colon[1].trim(), description: capitalize(colon[2].trim()) };
  if (line.length <= 80) return { title: line, description: "" };
  const connector = /\s(pra|para)\s/i.exec(line);
  if (connector && connector.index >= 3 && connector.index <= 60) {
    return { title: line.slice(0, connector.index).trim(), description: capitalize(line.slice(connector.index + connector[0].length).trim()) };
  }
  const cut = line.slice(0, 50);
  return { title: cut.slice(0, Math.max(cut.lastIndexOf(" "), 10)).trim(), description: line };
}

/** Uma linha por benefício; repetidas e títulos de seção (terminados em ":") são ignorados. */
export function parseBenefits(text: string): BenefitDraft[] {
  const seen = new Set<string>();
  const out: BenefitDraft[] = [];
  for (const raw of text.normalize("NFC").split(/\r?\n/)) {
    const line = tidy(raw.replace(BULLET, ""));
    if (!line || line.endsWith(":")) continue;
    const identity = line.toLowerCase().replace(/[.\s]+$/, "");
    if (seen.has(identity)) continue;
    seen.add(identity);
    const { title, description } = splitLine(line);
    out.push({ key: `b${out.length}`, title, description, discountLabel: suggestLabel(line) });
  }
  return out;
}

export function parsePartner(text: string): Omit<ImportDraft, "categoryId" | "benefits"> {
  const found: Record<FieldKey, string> = { tradeName: "", legalName: "", document: "", repName: "", repDocument: "", role: "", repEmail: "", phone: "" };
  let loginEmail = "";
  for (const raw of text.normalize("NFC").split(/\r?\n/)) {
    const line = tidy(raw.replace(BULLET, ""));
    if (!line) continue;
    // "Qual e-mail você quer usar para fazer login: ..." não é o e-mail de quem assina.
    if (/login/i.test(line)) {
      if (!loginEmail) loginEmail = EMAIL.exec(line)?.[0].toLowerCase() ?? "";
      continue;
    }
    const field = FIELD_PATTERNS.find(([, pattern]) => pattern.test(line));
    if (!field) continue;
    const value = line.replace(field[1], "").replace(/^[\s:=–—-]+/, "").trim();
    if (!found[field[0]]) found[field[0]] = value;
  }
  const digits = onlyDigits(found.document);
  const docType = inferDocumentType(digits);
  const cpfDigits = onlyDigits(found.repDocument);
  const repEmail = (EMAIL.exec(found.repEmail)?.[0] ?? found.repEmail).toLowerCase();
  return {
    tradeName: found.tradeName,
    legalName: found.legalName,
    document: docType ? formatDocument(docType, digits) : found.document,
    location: DEFAULT_LOCATION,
    representative: {
      name: found.repName,
      document: cpfDigits.length === 11 ? formatDocument("CPF", cpfDigits) : found.repDocument,
      role: found.role,
      email: repEmail,
      phone: found.phone,
    },
    loginEmail,
  };
}

export function parseImport(partnerText: string, benefitsText: string): ImportDraft {
  const partner = parsePartner(partnerText);
  return {
    ...partner,
    categoryId: inferCategory(`${partner.tradeName} ${partner.legalName} ${benefitsText}`),
    benefits: parseBenefits(benefitsText),
  };
}

const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/** Mesmas regras que o servidor aplica, para o admin ver o problema antes de confirmar. */
export function draftIssues(draft: ImportDraft): string[] {
  const issues: string[] = [];
  if (draft.tradeName.trim().length < 2) issues.push("Informe o nome fantasia.");
  if (draft.legalName.trim().length < 2) issues.push("Informe a razão social.");
  const digits = onlyDigits(draft.document);
  const type = inferDocumentType(digits);
  if (!type || !isValidDocument(type, digits)) issues.push("CNPJ ou CPF inválido.");
  if (!draft.categoryId) issues.push("Escolha a categoria.");
  if (draft.location.trim().length < 2) issues.push("Informe a cidade ou o alcance.");
  const cpf = onlyDigits(draft.representative.document);
  if (cpf && !isValidCpf(cpf)) issues.push("CPF de quem assina é inválido.");
  if (draft.representative.email && !looksLikeEmail(draft.representative.email)) issues.push("E-mail de quem assina é inválido.");
  if (draft.loginEmail && !looksLikeEmail(draft.loginEmail)) issues.push("E-mail de login inválido.");
  draft.benefits.forEach((b, i) => {
    const name = b.title.trim() || `Benefício ${i + 1}`;
    if (b.title.trim().length < 2 || b.title.length > 80) issues.push(`${name}: o título precisa ter de 2 a 80 caracteres.`);
    if (!b.discountLabel.trim() || b.discountLabel.length > MAX_LABEL) issues.push(`${name}: o rótulo precisa ter de 1 a ${MAX_LABEL} caracteres.`);
    if (b.description.length > 1000) issues.push(`${name}: a descrição passa de 1000 caracteres.`);
  });
  return issues;
}
