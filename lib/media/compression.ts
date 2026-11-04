// Hello World
import zlib from "node:zlib";

/** Prefixo que identifica dados de imagem comprimidos para armazenamento no banco de dados. */
export const PRX_COMPRESSED_PREFIX = "prx:gz:";

export interface CompressImageOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  mimeType?: string;
  minBytesToCompress?: number;
}

/** Cache em memória de imagens descomprimidas para evitar descompressão repetida no app. */
const DECOMPRESSED_CACHE = new Map<string, string>();
const MAX_CACHE_SIZE = 200;

function rememberInCache(compressed: string, decompressed: string): void {
  if (DECOMPRESSED_CACHE.size >= MAX_CACHE_SIZE) {
    const oldestKey = DECOMPRESSED_CACHE.keys().next().value;
    if (oldestKey) DECOMPRESSED_CACHE.delete(oldestKey);
  }
  DECOMPRESSED_CACHE.set(compressed, decompressed);
}

/** Verifica se a string é um payload de imagem comprimido no padrão PRX. */
export function isCompressedImageData(value: unknown): boolean {
  return typeof value === "string" && value.startsWith(PRX_COMPRESSED_PREFIX);
}

/** Extrai tipo MIME de uma string compactada ou data URL. */
export function getCompressedMimeType(compressed: string): string {
  if (!isCompressedImageData(compressed)) return "image/webp";
  const body = compressed.slice(PRX_COMPRESSED_PREFIX.length);
  const semiIndex = body.indexOf(";");
  if (semiIndex > 0) return body.slice(0, semiIndex);
  return "image/webp";
}

/**
 * Compacta uma Data URL (base64) para gravação econômica no banco de dados.
 * Reduz strings de 100KB+ para uma fração do tamanho via gzip.
 */
export async function compressImageDataUrl(dataUrl: string): Promise<string> {
  if (!dataUrl || isCompressedImageData(dataUrl)) return dataUrl;
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return dataUrl;

  const mime = match[1];

  // Node.js environment
  if (typeof window === "undefined" || typeof zlib?.gzipSync === "function") {
    try {
      const compressedBuffer = zlib.gzipSync(Buffer.from(dataUrl, "utf-8"), { level: 9 });
      return `${PRX_COMPRESSED_PREFIX}${mime};base64,${compressedBuffer.toString("base64")}`;
    } catch {
      // Fallback para navegador se zlib falhar
    }
  }

  // Browser environment using CompressionStream
  try {
    if (typeof CompressionStream !== "undefined") {
      const stream = new Response(new Blob([dataUrl]).stream().pipeThrough(new CompressionStream("gzip")));
      const arrayBuffer = await stream.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
      const base64 = btoa(binary);
      return `${PRX_COMPRESSED_PREFIX}${mime};base64,${base64}`;
    }
  } catch {
    // Se não suportar stream de compressão, mantém dataUrl
  }

  return dataUrl;
}

/**
 * Descompacta um payload de imagem vindo do banco de dados para exibição no app.
 * Devolve uma Data URL válida (`data:image/...;base64,...`) pronta para o <Image> ou <img>.
 */
export async function decompressImageData(compressed: string): Promise<string> {
  if (!isCompressedImageData(compressed)) return compressed;

  const cached = DECOMPRESSED_CACHE.get(compressed);
  if (cached) return cached;

  const marker = ";base64,";
  const markerIndex = compressed.indexOf(marker);
  if (markerIndex === -1) return compressed;

  const base64Payload = compressed.slice(markerIndex + marker.length);

  // 1. Node.js environment
  if (typeof window === "undefined" || typeof zlib?.gunzipSync === "function") {
    try {
      const buffer = Buffer.from(base64Payload, "base64");
      const decompressed = zlib.gunzipSync(buffer).toString("utf-8");
      rememberInCache(compressed, decompressed);
      return decompressed;
    } catch {
      // Tenta fallback com browser stream
    }
  }

  // 2. Browser environment using DecompressionStream
  try {
    if (typeof DecompressionStream !== "undefined" && typeof atob === "function") {
      const binary = atob(base64Payload);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const stream = new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")));
      const decompressed = await stream.text();
      rememberInCache(compressed, decompressed);
      return decompressed;
    }
  } catch (err) {
    console.error("Falha ao descompactar imagem PRX:", err);
  }

  return compressed;
}

/**
 * Versão síncrona para Node.js / SSR / Server Components.
 * Se já estiver em cache no cliente, devolve instantaneamente.
 */
export function decompressImageDataSync(compressed: string): string {
  if (!isCompressedImageData(compressed)) return compressed;

  const cached = DECOMPRESSED_CACHE.get(compressed);
  if (cached) return cached;

  // Node.js SSR
  if (typeof window === "undefined" && typeof zlib?.gunzipSync === "function") {
    try {
      const marker = ";base64,";
      const markerIndex = compressed.indexOf(marker);
      if (markerIndex !== -1) {
        const base64Payload = compressed.slice(markerIndex + marker.length);
        const decompressed = zlib.gunzipSync(Buffer.from(base64Payload, "base64")).toString("utf-8");
        rememberInCache(compressed, decompressed);
        return decompressed;
      }
    } catch {
      // Ignora e devolve original
    }
  }

  return compressed;
}

/** Retorna a extensão de arquivo apropriada para o tipo MIME. */
function extensionForMime(mime: string): string {
  switch (mime) {
    case "image/webp":
      return "webp";
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    default:
      return "webp";
  }
}

/**
 * Compacta e redimensiona um arquivo de imagem no navegador antes de enviar à API ou ao banco.
 * Reduz fotos de celulares (5 MB a 15 MB) para cerca de 80 KB - 180 KB sem perda perceptível de nitidez.
 */
export async function compressImageFile(file: File, options?: CompressImageOptions): Promise<File> {
  // Ignora se não for imagem ou for SVG
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
    return file;
  }

  // No servidor (SSR), não há canvas/DOM
  if (typeof window === "undefined" || typeof document === "undefined") {
    return file;
  }

  const maxWidth = options?.maxWidth ?? 1600;
  const maxHeight = options?.maxHeight ?? 1600;
  const quality = options?.quality ?? 0.82;
  const mimeType = options?.mimeType ?? "image/webp";
  const minBytes = options?.minBytesToCompress ?? 50 * 1024;

  // Arquivo já pequeno e no formato pedido não precisa recompressão
  if (file.size <= minBytes && file.type === mimeType) {
    return file;
  }

  try {
    const objectUrl = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = reject;
      element.src = objectUrl;
    });

    URL.revokeObjectURL(objectUrl);

    let { naturalWidth: width, naturalHeight: height } = img;
    if (width === 0 || height === 0) return file;

    // Redimensionamento proporcional se exceder os limites
    if (width > maxWidth || height > maxHeight) {
      const ratio = Math.min(maxWidth / width, maxHeight / height);
      width = Math.max(1, Math.round(width * ratio));
      height = Math.max(1, Math.round(height * ratio));
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    // Fundo branco se for converter formato transparente para jpeg
    if (mimeType === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
    }

    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, mimeType, quality);
    });

    if (!blob) return file;

    // Se a compressão ficou maior que o original por alguma anomalia, preserva original
    if (blob.size >= file.size && file.type === mimeType) {
      return file;
    }

    const newExt = extensionForMime(blob.type);
    const newName = file.name.replace(/\.[^.]+$/, "") + `.${newExt}`;
    return new File([blob], newName, { type: blob.type, lastModified: Date.now() });
  } catch (err) {
    console.warn("Compressão de imagem falhou; enviando arquivo original:", err);
    return file;
  }
}
