// Hello World
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { buildDocumentFile } from "@/lib/kyc/document-file";

/** Foto de verdade no formato pedido (o servidor decodifica e converte). */
const photo = async (format: "jpeg" | "png" | "webp") => new Uint8Array(await sharp({ create: { width: 40, height: 24, channels: 3, background: "#c8c8c8" } })[format]().toBuffer());
const pagesOf = async (blob: Blob) => (await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()))).getPageCount();

describe("arquivo único do documento", () => {
  it("frente e verso em WebP viram um PDF só, uma página por foto", async () => {
    const file = await buildDocumentFile([await photo("webp"), await photo("webp")], "identidade");
    expect(file.blob.type).toBe("application/pdf");
    expect(file.filename).toBe("identidade.pdf");
    expect(await pagesOf(file.blob)).toBe(2);
  });

  it("foto + PDF de várias páginas no mesmo grupo", async () => {
    const scan = await PDFDocument.create();
    scan.addPage();
    scan.addPage();
    const file = await buildDocumentFile([await photo("jpeg"), await scan.save()], "comprovante");
    expect(await pagesOf(file.blob)).toBe(3);
  });

  it("uma foto só segue em JPEG; o que não é imagem é recusado com o motivo", async () => {
    const single = await buildDocumentFile([await photo("png")], "selfie");
    expect(single.blob.type).toBe("image/jpeg");
    expect(single.filename).toBe("selfie.jpg");
    await expect(buildDocumentFile([new TextEncoder().encode("texto qualquer")], "x")).rejects.toMatchObject({ status: 422 });
    await expect(buildDocumentFile([], "x")).rejects.toMatchObject({ status: 422 });
  });
});
