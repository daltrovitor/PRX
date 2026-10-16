// Hello World
import crypto from "crypto";
import sharp from "sharp";
import { userStore } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/client";
import { PartnerError, dbError } from "@/lib/partners/errors";

/**
 * Foto de perfil do membro. O arquivo é decodificado e regravado aqui no
 * servidor (512×512, WebP): só imagem de verdade passa, e os metadados da
 * câmera (inclusive GPS) saem. Fica no bucket público "avatars", numa pasta
 * por pessoa e com nome aleatório; trocar ou remover apaga o arquivo antigo.
 * Não é a selfie da abertura do PRX BANK (essa fica no bucket privado de
 * documentos e nunca vira foto de perfil, nem o contrário).
 */

export const AVATAR_BUCKET = "avatars";
export const AVATAR_MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp"]);
const SIZE = 512;

export async function processAvatar(bytes: Uint8Array): Promise<Buffer> {
  try {
    return await sharp(bytes, { failOn: "error", limitInputPixels: 40_000_000 })
      .rotate()
      .resize(SIZE, SIZE, { fit: "cover", position: "attention" })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new PartnerError("Não conseguimos ler esta imagem. Envie uma foto JPG, PNG ou WebP.", 422);
  }
}

/** Caminho do arquivo no bucket, se a URL for de uma foto enviada para cá. */
function ownPath(url: string | null | undefined, userId: string): string | null {
  const marker = `/storage/v1/object/public/${AVATAR_BUCKET}/`;
  const at = url?.indexOf(marker) ?? -1;
  if (!url || at < 0) return null;
  const path = decodeURIComponent(url.slice(at + marker.length));
  return path.startsWith(`${userId}/`) && !path.includes("..") ? path : null;
}

async function currentUrl(userId: string): Promise<string | null> {
  if (!supabaseAdmin) return userStore.findById(userId)?.avatarUrl ?? null;
  const { data } = await supabaseAdmin.from("profiles").select("avatar_url").eq("id", userId).maybeSingle();
  return (data as { avatar_url?: string | null } | null)?.avatar_url ?? null;
}

async function saveUrl(userId: string, url: string | null): Promise<void> {
  if (!supabaseAdmin) {
    if (!userStore.updateUser(userId, { avatarUrl: url ?? "" })) throw new PartnerError("Conta não encontrada.", 404);
    return;
  }
  const { error } = await supabaseAdmin.from("profiles").update({ avatar_url: url, updated_at: new Date().toISOString() }).eq("id", userId);
  if (error) throw dbError(error, "Não foi possível salvar a foto de perfil");
}

export async function setAvatar(userId: string, file: { bytes: Uint8Array; type: string }): Promise<string> {
  if (!ACCEPTED.has(file.type)) throw new PartnerError("Envie uma foto JPG, PNG ou WebP.", 422);
  if (file.bytes.byteLength === 0) throw new PartnerError("Arquivo vazio.", 422);
  if (file.bytes.byteLength > AVATAR_MAX_BYTES) throw new PartnerError("Foto acima de 8 MB. Escolha outra.", 422);
  const image = await processAvatar(file.bytes);
  const previous = await currentUrl(userId);

  if (!supabaseAdmin) {
    const url = `data:image/webp;base64,${image.toString("base64")}`;
    await saveUrl(userId, url);
    return url;
  }
  await supabaseAdmin.storage.createBucket(AVATAR_BUCKET, { public: true, fileSizeLimit: 1024 * 1024, allowedMimeTypes: ["image/webp"] }).catch(() => undefined);
  const path = `${userId}/${crypto.randomUUID()}.webp`;
  const { error } = await supabaseAdmin.storage.from(AVATAR_BUCKET).upload(path, image, { contentType: "image/webp", upsert: false, cacheControl: "31536000" });
  if (error) throw new PartnerError(`Envio da foto indisponível agora: ${error.message}`, 503);
  const url = supabaseAdmin.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
  await saveUrl(userId, url);
  const old = ownPath(previous, userId);
  if (old) await supabaseAdmin.storage.from(AVATAR_BUCKET).remove([old]).catch(() => undefined);
  return url;
}

export async function removeAvatar(userId: string): Promise<void> {
  const previous = await currentUrl(userId);
  await saveUrl(userId, null);
  const old = ownPath(previous, userId);
  if (old && supabaseAdmin) await supabaseAdmin.storage.from(AVATAR_BUCKET).remove([old]).catch(() => undefined);
}
