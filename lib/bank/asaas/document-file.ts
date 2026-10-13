// Hello World
import { PDFDocument } from "pdf-lib";
import { PartnerError } from "@/lib/partners/errors";

/**
 * O arquivo único que vai para um grupo de documentos do Asaas, a partir do que
 * o membro enviou (foto em JPG, PNG, WebP ou HEIF, ou PDF):
 *   - foto: rotação do celular corrigida (EXIF), até 2000 px, em JPEG;
 *   - várias partes (frente e verso, foto + PDF): um PDF só, uma página por foto
 *     (A4) e as páginas dos PDFs na ordem, porque cada grupo do Asaas aceita um
 *     arquivo por vez (um novo envio substitui o anterior);
 *   - uma parte só: a foto vai em JPEG e o PDF vai como veio.
 * Nada é enviado se uma parte não puder ser lida: o membro recebe o motivo.
 */

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const MAX_SIDE = 2000;
const A4: [number, number] = [595.28, 841.89];
const MARGIN = 24;

export interface DocumentUpload {
  blob: Blob;
  filename: string;
}

type Part = { kind: "jpeg"; bytes: Uint8Array } | { kind: "pdf"; bytes: Uint8Array };

/** Formatos de foto que o servidor converte (SVG e outros nunca entram). */
const PHOTO_FORMATS = new Set(["jpeg", "png", "webp", "heif"]);

const isPdf = (bytes: Uint8Array) => bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;

const UNREADABLE = "Não deu para ler uma das fotos. Envie em JPG, PNG ou PDF, com o documento inteiro e nítido.";

/** Foto em qualquer formato que o servidor lê → JPEG de pé, sem transparência. null = formato que não dá para ler (ex.: HEIC do iPhone fora do Safari). */
export async function photoToJpeg(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    const { default: sharp } = await import("sharp");
    const image = sharp(bytes, { failOn: "error" });
    const { format } = await image.metadata();
    if (!format || !PHOTO_FORMATS.has(format)) return null;
    const out = await image
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
    return new Uint8Array(out);
  } catch {
    return null;
  }
}

async function normalize(bytes: Uint8Array): Promise<Part> {
  if (isPdf(bytes)) return { kind: "pdf", bytes };
  const jpeg = await photoToJpeg(bytes);
  if (!jpeg) throw new PartnerError(UNREADABLE, 422);
  return { kind: "jpeg", bytes: jpeg };
}

async function mergeToPdf(parts: Part[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const part of parts) {
    if (part.kind === "pdf") {
      let source: PDFDocument;
      try {
        source = await PDFDocument.load(part.bytes);
      } catch {
        throw new PartnerError("Um dos PDFs está protegido por senha ou danificado. Envie uma foto do documento ou outro PDF.", 422);
      }
      for (const page of await doc.copyPages(source, source.getPageIndices())) doc.addPage(page);
      continue;
    }
    const image = await doc.embedJpg(part.bytes);
    const page = doc.addPage(A4);
    const scale = Math.min((A4[0] - MARGIN * 2) / image.width, (A4[1] - MARGIN * 2) / image.height, 1);
    const width = image.width * scale;
    const height = image.height * scale;
    page.drawImage(image, { x: (A4[0] - width) / 2, y: (A4[1] - height) / 2, width, height });
  }
  return doc.save();
}

/** Junta as partes num arquivo que o Asaas aceita. `name` sem extensão. */
export async function buildDocumentFile(parts: Uint8Array[], name: string): Promise<DocumentUpload> {
  if (parts.length === 0) throw new PartnerError("Escolha o arquivo do documento.", 422);
  const normalized = await Promise.all(parts.map(normalize));
  const single = normalized.length === 1 ? normalized[0] : null;
  const bytes = single ? single.bytes : await mergeToPdf(normalized);
  const pdf = !single || single.kind === "pdf";
  if (bytes.length > MAX_DOCUMENT_BYTES) throw new PartnerError("O documento passou de 10 MB. Envie fotos menores ou um PDF mais leve.", 422);
  return { blob: new Blob([bytes as BlobPart], { type: pdf ? "application/pdf" : "image/jpeg" }), filename: `${name}.${pdf ? "pdf" : "jpg"}` };
}
