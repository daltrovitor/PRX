// Hello World

/**
 * Limpeza do que vai para os registros e logs de chamadas ao banco parceiro.
 * Nada de segredo é gravado (chaves de API, tokens, senhas) e dados pessoais
 * ficam mascarados: o suficiente para o admin entender um erro ("CEP não
 * localizado", "CPF inválido"), nunca o dado completo.
 */

const SECRET = "[removido]";
const MAX_STRING = 500;
const MAX_ITEMS = 50;
const MAX_DEPTH = 8;
const MAX_JSON_CHARS = 20_000;

/** Campos que nunca são gravados (comparação sem maiúsculas, hífen ou sublinhado). */
const SECRET_KEYS = new Set(["apikey", "accesstoken", "authtoken", "token", "password", "senha", "secret", "authorization", "clientsecret", "refreshtoken"]);

const norm = (key: string) => key.toLowerCase().replace(/[-_\s]/g, "");

const digits = (value: string) => value.replace(/\D/g, "");

/** CPF/CNPJ como nos comprovantes Pix: só os dígitos do meio. */
export function maskDocumentNumber(value: string): string {
  const d = digits(value);
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
  if (d.length === 14) return `**.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-**`;
  return d.length > 4 ? `${"*".repeat(d.length - 2)}${d.slice(-2)}` : "***";
}

export function maskEmail(value: string): string {
  const [user, domain] = value.split("@");
  if (!domain) return "***";
  return `${user.slice(0, 1)}***@${domain}`;
}

export function maskPhone(value: string): string {
  const d = digits(value);
  return d.length >= 10 ? `(${d.slice(-11, -9) || d.slice(0, 2)}) *****-**${d.slice(-2)}` : "***";
}

/** Primeiro nome e iniciais: "Ana Souza Lima" → "Ana S. L." */
export function maskName(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  return [parts[0], ...parts.slice(1).map((p) => `${p[0]}.`)].join(" ");
}

/** Mantém o começo e o fim de um identificador longo (chave Pix, linha digitável, conta). */
export function maskMiddle(value: string, keepStart = 3, keepEnd = 2): string {
  const v = value.trim();
  if (v.length <= keepStart + keepEnd) return "***";
  return `${v.slice(0, keepStart)}***${v.slice(-keepEnd)}`;
}

function maskUrl(value: string): string {
  try {
    return `${new URL(value).origin}/… (link omitido)`;
  } catch {
    return "(link omitido)";
  }
}

/** CPF, CNPJ e e-mails soltos em textos livres (mensagens de erro do banco parceiro, descrições). */
export function scrubText(text: string): string {
  return text
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, (m) => maskDocumentNumber(m))
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, (m) => maskDocumentNumber(m))
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (m) => maskEmail(m))
    .replace(/\b(bearer)\s+[A-Za-z0-9._~+/=-]{8,}/gi, `$1 ${SECRET}`)
    .replace(/\b(api[_-]?key|access[_-]?token|auth[_-]?token|secret|token)(["']?\s*[:=]\s*["']?)[^\s"',;]{6,}/gi, `$1$2${SECRET}`);
}

type Masker = (value: string) => string;

/** Como mascarar cada campo pessoal conhecido das APIs de banco. */
const FIELD_MASKS: Record<string, Masker> = {
  cpfcnpj: maskDocumentNumber,
  cpf: maskDocumentNumber,
  cnpj: maskDocumentNumber,
  email: maskEmail,
  loginemail: maskEmail,
  mobilephone: maskPhone,
  phone: maskPhone,
  name: maskName,
  ownername: maskName,
  accountname: maskName,
  tradingname: maskName,
  birthdate: (v) => (v.length >= 4 ? `${v.slice(0, 4)}-**-**` : "***"),
  ownerbirthdate: (v) => (v.length >= 4 ? `${v.slice(0, 4)}-**-**` : "***"),
  address: (v) => (v.trim().length > 3 ? `${v.trim().slice(0, 3)}***` : "***"),
  addressnumber: () => "***",
  complement: () => "***",
  pixaddresskey: (v) => maskMiddle(v, 3, 2),
  addresskey: (v) => maskMiddle(v, 3, 2),
  identificationfield: (v) => maskMiddle(v, 5, 4),
  barcode: (v) => maskMiddle(v, 5, 4),
  account: (v) => maskMiddle(v, 0, 2),
  accountdigit: () => "*",
  payload: (v) => `${v.slice(0, 20)}… (${v.length} caracteres)`,
  encodedimage: () => "(imagem omitida)",
  onboardingurl: maskUrl,
};

function sanitizeValue(value: unknown, key: string | null, depth: number): unknown {
  if (value === null || value === undefined) return value ?? null;
  const k = key ? norm(key) : "";
  if (k && SECRET_KEYS.has(k) && typeof value !== "object") return SECRET;
  if (typeof value === "string") {
    const masker = k ? FIELD_MASKS[k] : undefined;
    const out = masker ? masker(value) : scrubText(value);
    return out.length > MAX_STRING ? `${out.slice(0, MAX_STRING)}… (+${out.length - MAX_STRING})` : out;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    // Números de documento às vezes chegam como número.
    return k && FIELD_MASKS[k] && typeof value === "number" ? FIELD_MASKS[k](String(value)) : value;
  }
  if (depth >= MAX_DEPTH) return "(…)";
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ITEMS).map((item) => sanitizeValue(item, key, depth + 1));
    return value.length > MAX_ITEMS ? [...items, `(+${value.length - MAX_ITEMS} itens)`] : items;
  }
  if (typeof Blob !== "undefined" && value instanceof Blob) return { arquivo: true, tipo: value.type || null, bytes: value.size };
  if (typeof FormData !== "undefined" && value instanceof FormData) return sanitizeForm(value);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) out[childKey] = sanitizeValue(child, childKey, depth + 1);
    return out;
  }
  return String(value);
}

/** Multipart (envio de documento): só nomes de campo, tipo e tamanho do arquivo. */
function sanitizeForm(form: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  form.forEach((value, field) => {
    out[field] = typeof value === "string" ? sanitizeValue(value, field, 1) : { arquivo: value.name || "arquivo", tipo: value.type || null, bytes: value.size };
  });
  return out;
}

/** Corpo pronto para o jsonb: sem segredos, com dados pessoais mascarados e tamanho limitado. */
export function sanitizePayload(value: unknown): unknown {
  if (value === undefined) return null;
  const clean = sanitizeValue(value, null, 0);
  const json = JSON.stringify(clean);
  if (json && json.length > MAX_JSON_CHARS) return { truncado: true, previa: json.slice(0, MAX_JSON_CHARS) };
  return clean;
}
