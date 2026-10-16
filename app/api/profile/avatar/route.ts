// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/security";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse } from "@/lib/partners/http";
import { AVATAR_MAX_BYTES, removeAvatar, setAvatar } from "@/lib/profile/avatar";

const NO_STORE = { "Cache-Control": "no-store" };

/** Só a própria pessoa troca a sua foto (sessão), com limite de tentativas. */
async function owner(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) throw new PartnerError("Entre na sua conta para continuar.", 401);
  const limit = checkRateLimit(`avatar:${user.id}`, 10, 600);
  if (!limit.allowed) throw new PartnerError(`Muitas trocas seguidas. Tente em ${Math.ceil(limit.resetInSeconds / 60)} min.`, 429);
  return user;
}

/** POST /api/profile/avatar — envia ou troca a foto de perfil (multipart, campo "file"). */
export async function POST(req: NextRequest) {
  try {
    const user = await owner(req);
    const length = Number(req.headers.get("content-length") ?? 0);
    if (length > AVATAR_MAX_BYTES + 64 * 1024) throw new PartnerError("Foto acima de 8 MB. Escolha outra.", 422);
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw new PartnerError("Escolha uma foto.", 422);
    const avatarUrl = await setAvatar(user.id, { bytes: new Uint8Array(await file.arrayBuffer()), type: file.type });
    return NextResponse.json({ success: true, avatarUrl }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Não foi possível trocar a foto.");
  }
}

/** DELETE /api/profile/avatar — remove a foto (volta para as iniciais). */
export async function DELETE(req: NextRequest) {
  try {
    const user = await owner(req);
    await removeAvatar(user.id);
    return NextResponse.json({ success: true }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Não foi possível remover a foto.");
  }
}
