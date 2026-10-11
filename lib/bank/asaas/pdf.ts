// Hello World

/**
 * Junta fotos JPEG num PDF (uma página A4 por foto), sem dependências: o JPEG
 * entra inteiro no PDF (filtro DCTDecode), nada é recomprimido. Usado para
 * mandar frente e verso do documento num arquivo só, porque cada grupo de
 * documentos do Asaas aceita um arquivo por vez (um novo envio substitui o
 * anterior). Outros formatos devolvem null: o membro envia pela tela.
 */

export type FileKind = "jpeg" | "png" | "pdf" | "other";

export function sniffKind(bytes: Uint8Array): FileKind {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "pdf";
  return "other";
}

interface JpegInfo {
  width: number;
  height: number;
  components: 1 | 3;
}

/** Lê largura, altura e canais do marcador SOF. CMYK e precisão diferente de 8 bits não entram. */
export function jpegInfo(bytes: Uint8Array): JpegInfo | null {
  if (sniffKind(bytes) !== "jpeg") return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      const precision = bytes[i + 4];
      const height = (bytes[i + 5] << 8) | bytes[i + 6];
      const width = (bytes[i + 7] << 8) | bytes[i + 8];
      const components = bytes[i + 9];
      if (precision !== 8 || width === 0 || height === 0 || (components !== 1 && components !== 3)) return null;
      return { width, height, components };
    }
    if (length < 2) return null;
    i += 2 + length;
  }
  return null;
}

const A4 = { width: 595, height: 842 };
const MARGIN = 24;

const encoder = new TextEncoder();

/** PDF com uma foto por página, centralizada e proporcional dentro da A4. null se alguma não for JPEG válido. */
export function jpegsToPdf(images: readonly Uint8Array[]): Uint8Array | null {
  const infos = images.map(jpegInfo);
  if (images.length === 0 || infos.some((info) => info === null)) return null;

  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let size = 0;
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === "string" ? encoder.encode(part) : part;
    chunks.push(bytes);
    size += bytes.length;
  };
  const object = (id: number, parts: Array<string | Uint8Array>) => {
    offsets[id] = size;
    push(`${id} 0 obj\n`);
    for (const part of parts) push(part);
    push("\nendobj\n");
  };

  // Objetos: 1 catálogo, 2 páginas, depois (página, imagem, conteúdo) por foto.
  const pageIds = images.map((_, n) => 3 + n * 3);
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  object(1, ["<< /Type /Catalog /Pages 2 0 R >>"]);
  object(2, [`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${images.length} >>`]);
  images.forEach((jpeg, n) => {
    const info = infos[n]!;
    const [pageId, imageId, contentId] = [pageIds[n], pageIds[n] + 1, pageIds[n] + 2];
    const scale = Math.min((A4.width - 2 * MARGIN) / info.width, (A4.height - 2 * MARGIN) / info.height);
    const w = Math.round(info.width * scale * 100) / 100;
    const h = Math.round(info.height * scale * 100) / 100;
    const x = Math.round(((A4.width - w) / 2) * 100) / 100;
    const y = Math.round(((A4.height - h) / 2) * 100) / 100;
    const draw = `q ${w} 0 0 ${h} ${x} ${y} cm /Im0 Do Q`;
    object(pageId, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.width} ${A4.height}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`]);
    object(imageId, [
      `<< /Type /XObject /Subtype /Image /Width ${info.width} /Height ${info.height} /ColorSpace /${info.components === 1 ? "DeviceGray" : "DeviceRGB"} /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
      jpeg,
      "\nendstream",
    ]);
    object(contentId, [`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`]);
  });

  const count = 3 + images.length * 3;
  const xref = size;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let id = 1; id < count; id++) push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}
