// Hello World

/**
 * Leitura de planilhas de empresas no navegador do admin (CSV e XLSX), sem
 * biblioteca: o XLSX é um ZIP de XMLs, descompactado com DecompressionStream
 * (deflate-raw). Só lê a primeira aba. A validação de verdade (CNPJ, nomes)
 * acontece no servidor; aqui só transformamos as linhas no formato da API.
 */

export interface CompanyRow {
  cnpj: string;
  legalName: string;
  tradeName: string;
  category: string;
  identifiers: string[];
  notes: string;
}

const HEADER_ALIASES: Record<keyof CompanyRow, string[]> = {
  cnpj: ["cnpj", "documento", "cnpj da empresa"],
  legalName: ["razao social", "nome empresarial", "razao", "empresa", "nome", "legal name"],
  tradeName: ["nome fantasia", "fantasia", "marca", "trade name"],
  category: ["categoria", "segmento", "ramo", "category"],
  identifiers: ["chave pix", "chaves pix", "pix", "identificadores", "outros nomes", "apelidos"],
  notes: ["observacoes", "observacao", "notas", "obs"],
};

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Linhas cruas (primeira = cabeçalho) viram empresas. Sem cabeçalho reconhecido, assume CNPJ;razão social;nome fantasia;categoria. */
export function rowsToCompanies(table: string[][]): CompanyRow[] {
  const rows = table.filter((r) => r.some((c) => c.trim() !== ""));
  if (rows.length === 0) return [];
  const header = rows[0].map(norm);
  const col: Partial<Record<keyof CompanyRow, number>> = {};
  for (const key of Object.keys(HEADER_ALIASES) as Array<keyof CompanyRow>) {
    const index = header.findIndex((h) => HEADER_ALIASES[key].includes(h));
    if (index >= 0) col[key] = index;
  }
  const hasHeader = col.cnpj !== undefined;
  const map = hasHeader ? col : { cnpj: 0, legalName: 1, tradeName: 2, category: 3, identifiers: 4, notes: 5 };
  const body = hasHeader ? rows.slice(1) : rows;
  const cell = (r: string[], key: keyof CompanyRow) => (map[key] === undefined ? "" : (r[map[key]!] ?? "").trim());
  // Planilha guarda CNPJ como número: zeros à esquerda somem (01.234.567/… vira 1234567…).
  const cnpjOf = (raw: string) => (/^\d{12,13}$/.test(raw) ? raw.padStart(14, "0") : raw);
  return body.map((r) => ({
    cnpj: cnpjOf(cell(r, "cnpj")),
    legalName: cell(r, "legalName"),
    tradeName: cell(r, "tradeName"),
    category: cell(r, "category"),
    identifiers: cell(r, "identifiers")
      .split(/[|;\n]/)
      .map((s) => s.trim())
      .filter(Boolean),
    notes: cell(r, "notes"),
  }));
}

/** CSV com ; , ou tab, aspas e quebras de linha dentro de aspas. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [";", "\t", ","].reduce((best, d) => (firstLine.split(d).length > firstLine.split(best).length ? d : best), ";");
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(field);
      out.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    out.push(row);
  }
  return out;
}

/** Lista colada (uma empresa por linha: CNPJ;Razão social;Nome fantasia;Categoria). */
export const parsePasted = (text: string): CompanyRow[] => rowsToCompanies(parseCsv(text));

/* -------------------------------------------------------------------------- */
/* XLSX                                                                        */
/* -------------------------------------------------------------------------- */

type Inflate = (data: Uint8Array) => Promise<Uint8Array>;

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Arquivos do ZIP pelo diretório central (o mesmo que o Excel, LibreOffice e Google Planilhas gravam). */
export async function unzip(bytes: Uint8Array, wanted: (name: string) => boolean, inflate: Inflate = inflateRaw): Promise<Map<string, string>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Arquivo XLSX inválido.");
  const entries = view.getUint16(eocd + 10, true);
  let ptr = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const files = new Map<string, string>();
  for (let n = 0; n < entries; n++) {
    if (view.getUint32(ptr, true) !== 0x02014b50) throw new Error("Arquivo XLSX inválido.");
    const method = view.getUint16(ptr + 10, true);
    const size = view.getUint32(ptr + 20, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const local = view.getUint32(ptr + 42, true);
    const name = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
    ptr += 46 + nameLen + extraLen + commentLen;
    if (!wanted(name)) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + size);
    const data = method === 0 ? raw : method === 8 ? await inflate(raw) : null;
    if (!data) throw new Error("Compressão do XLSX não suportada.");
    files.set(name, decoder.decode(data));
  }
  return files;
}

const unescapeXml = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d))).replace(/&amp;/g, "&");

const textOf = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1])).join("");

function colIndex(ref: string): number {
  const letters = ref.replace(/\d+/g, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Primeira aba do XLSX como tabela de textos. */
export async function parseXlsx(bytes: Uint8Array, inflate?: Inflate): Promise<string[][]> {
  const files = await unzip(bytes, (name) => name === "xl/sharedStrings.xml" || name === "xl/workbook.xml" || name === "xl/_rels/workbook.xml.rels" || /^xl\/worksheets\/sheet\d+\.xml$/.test(name), inflate);
  const shared = [...(files.get("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  // A primeira aba do workbook pode não ser sheet1.xml: segue o relacionamento.
  const firstSheetRel = /<sheet\b[^>]*r:id="([^"]+)"/.exec(files.get("xl/workbook.xml") ?? "")?.[1];
  const target = firstSheetRel ? new RegExp(`Id="${firstSheetRel}"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Id="${firstSheetRel}"`).exec(files.get("xl/_rels/workbook.xml.rels") ?? "") : null;
  const path = target ? `xl/${(target[1] ?? target[2]).replace(/^\/?xl\//, "")}` : "xl/worksheets/sheet1.xml";
  const sheet = files.get(path) ?? [...files.entries()].find(([name]) => name.startsWith("xl/worksheets/"))?.[1];
  if (!sheet) throw new Error("Planilha sem abas.");
  const table: string[][] = [];
  for (const rowMatch of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const c of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const inner = c[2] ?? "";
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const type = /t="([^"]+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      const value = type === "s" ? (shared[Number(v)] ?? "") : type === "inlineStr" ? textOf(inner) : unescapeXml(v ?? "");
      const index = ref ? colIndex(ref) : row.length;
      while (row.length < index) row.push("");
      row[index] = value;
    }
    table.push(row);
  }
  return table;
}

/** Lê o arquivo escolhido (CSV ou XLSX) e devolve as empresas. */
export async function readCompaniesFile(file: File): Promise<CompanyRow[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) return rowsToCompanies(await parseXlsx(new Uint8Array(await file.arrayBuffer())));
  if (name.endsWith(".csv") || name.endsWith(".txt")) return rowsToCompanies(parseCsv(await file.text()));
  throw new Error("Use um arquivo .csv ou .xlsx (no Excel: Salvar como → Pasta de Trabalho do Excel ou CSV).");
}
