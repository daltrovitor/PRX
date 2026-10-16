// Hello World
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/client";
import { requireAdmin } from "@/lib/partners/http";
import { PartnerError } from "@/lib/partners/errors";
import { compressImageDataUrl } from "@/lib/media/compression";
import { incidentResponse } from "@/lib/incidents";

/** Pasta do bucket para o tipo pedido; só estas existem (o tipo vira caminho, então nada livre). "brand": materiais oficiais. */
function uploadFolder(value: FormDataEntryValue | null): "benefits" | "logos" | "banners" | "brand" | null {
  switch (String(value || "benefit")) {
    case "brand":
      return "brand";
    case "benefit":
      return "benefits";
    case "logo":
      return "logos";
    case "banner":
      return "banners";
    default:
      return null;
  }
}
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];

/** Extensão sempre derivada do tipo do arquivo (constante do código), nunca do nome enviado. */
function extensionFor(mime: string): "jpg" | "png" | "webp" | "gif" | "svg" | null {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/svg+xml":
      return "svg";
    default:
      return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);

    const formData = await req.formData();
    const file = formData.get("file");
    const folder = uploadFolder(formData.get("type"));

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
    }
    // Path traversal: o tipo vira nome de pasta, então só valores conhecidos.
    if (!folder) {
      return NextResponse.json({ error: "Tipo de imagem inválido." }, { status: 400 });
    }

    const allowedMimeTypes = ALLOWED_MIME_TYPES;
    const fileExt = extensionFor(file.type);
    if (!fileExt) {
      return NextResponse.json(
        { error: "Formato de arquivo inválido. Envie JPG, PNG, WEBP, GIF ou SVG." },
        { status: 400 }
      );
    }

    // Max 10MB
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Arquivo muito grande. O tamanho máximo permitido é 10MB." },
        { status: 400 }
      );
    }

    const filePath = `${folder}/${Date.now()}_${crypto.randomBytes(6).toString("hex")}.${fileExt}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 1. Upload to Supabase Storage Bucket 'benefits'
    if (supabaseAdmin) {
      // Ensure bucket exists
      try {
        await supabaseAdmin.storage.createBucket("benefits", {
          public: true,
          fileSizeLimit: 10485760,
          allowedMimeTypes,
        });
      } catch {
        // Bucket may already exist
      }

      const { error: uploadError } = await supabaseAdmin.storage
        .from("benefits")
        .upload(filePath, buffer, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) return incidentResponse(new Error(`Supabase Storage: ${uploadError.message}`), "Erro no upload da imagem.");

      const { data: publicUrlData } = supabaseAdmin.storage
        .from("benefits")
        .getPublicUrl(filePath);

      return NextResponse.json({
        success: true,
        url: publicUrlData.publicUrl,
        path: filePath,
        fileName: file.name,
      });
    }

    // 2. Fallback: Data URL compactada com gzip para economizar espaço no banco
    const base64Data = `data:${file.type};base64,${buffer.toString("base64")}`;
    const compressedUrl = await compressImageDataUrl(base64Data);
    return NextResponse.json({
      success: true,
      url: compressedUrl,
      fileName: file.name,
    });
  } catch (error) {
    if (error instanceof PartnerError && error.status < 500) return NextResponse.json({ error: error.message }, { status: error.status });
    return incidentResponse(error, "Erro inesperado ao fazer upload.");
  }
}
