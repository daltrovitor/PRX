// Hello World
import { z } from "zod";
import { passwordProblem } from "@/lib/password-policy";
import { PartnerError } from "@/lib/partners/errors";
import { verifyAccountPassword } from "@/lib/partners/access";
import { removeAvatar, setAvatar } from "@/lib/profile/avatar";
import { setInsiderPassword } from "@/lib/resenha/access";
import { getResenhaRepository } from "@/lib/resenha/repository";
import { PHOTO_PATTERN } from "@/lib/resenha/signup";
import { insiderProfileSchema, type Insider } from "@/lib/resenha/types";

/**
 * O próprio Insider edita os dados dele no portal: nome, @, foto e senha. A foto
 * nova também vira a foto de perfil da conta no app (é a mesma conta).
 */

export const insiderSelfEditSchema = z.object({
  name: insiderProfileSchema.shape.name,
  handle: insiderProfileSchema.shape.handle,
  photo: z
    .string()
    .max(4_000_000)
    .refine((v) => v === "" || PHOTO_PATTERN.test(v), "Foto inválida. Envie uma imagem JPG, PNG ou WebP.")
    .default(""),
  removePhoto: z.boolean().default(false),
  currentPassword: z.string().max(128).default(""),
  newPassword: z.string().max(128).default(""),
});
export type InsiderSelfEdit = z.output<typeof insiderSelfEditSchema>;

export async function updateOwnProfile(insider: Insider, input: InsiderSelfEdit): Promise<Insider> {
  // Valida a troca de senha antes de mexer em qualquer dado.
  if (input.newPassword) {
    if (!(await verifyAccountPassword(insider.email, input.currentPassword))) throw new PartnerError("A senha atual está incorreta.", 401);
    const problem = passwordProblem(input.newPassword);
    if (problem) throw new PartnerError(problem, 422);
  }

  let avatarUrl = insider.avatarUrl;
  const photo = PHOTO_PATTERN.exec(input.photo);
  if (photo) {
    avatarUrl = await setAvatar(insider.userId, { bytes: Buffer.from(photo[2], "base64"), type: photo[1] });
  } else if (input.removePhoto) {
    await removeAvatar(insider.userId);
    avatarUrl = "";
  }

  const updated = await getResenhaRepository().updateInsider(insider.id, { name: input.name, handle: input.handle, avatarUrl });
  if (input.newPassword) await setInsiderPassword(insider.userId, insider.email, input.newPassword);
  return updated;
}
