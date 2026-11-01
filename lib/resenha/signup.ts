// Hello World
import { z } from "zod";
import { createAccount, discardAccount } from "@/lib/accounts";
import { passwordProblem } from "@/lib/password-policy";
import { PartnerError } from "@/lib/partners/errors";
import { verifyAccountPassword } from "@/lib/partners/access";
import { setAvatar } from "@/lib/profile/avatar";
import { findAccountByEmail } from "@/lib/resenha/access";
import { getResenhaRepository } from "@/lib/resenha/repository";
import { insiderInputSchema, insiderProfileSchema, type Insider } from "@/lib/resenha/types";

/**
 * Auto-cadastro do Insider no portal (insider.<domínio>). A conta criada é uma conta
 * PRX comum: o mesmo e-mail e a mesma senha entram no app como membro, e a foto vira
 * a foto de perfil. Quem já tem conta PRX usa a senha dela e só ganha o cadastro de
 * Insider. O cadastro nasce "pending" e só entra no portal depois que o admin aprova.
 */

const PHOTO_PATTERN = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=]+)$/;

export const insiderSignupSchema = z.object({
  name: insiderProfileSchema.shape.name,
  handle: insiderProfileSchema.shape.handle,
  email: insiderInputSchema.shape.email,
  password: z.string().min(1, "Informe a senha.").max(128, "Senha muito longa."),
  photo: z
    .string()
    .max(4_000_000)
    .refine((v) => v === "" || PHOTO_PATTERN.test(v), "Foto inválida. Envie uma imagem JPG, PNG ou WebP.")
    .default(""),
});
export type InsiderSignupInput = z.output<typeof insiderSignupSchema>;

const EXISTING_MESSAGE: Record<Insider["status"], string> = {
  pending: "Seu cadastro já foi enviado e está aguardando a aprovação da equipe PRX.",
  approved: "Você já é Insider. Entre no portal com este e-mail.",
  rejected: "Este cadastro não foi aprovado. Fale com a equipe PRX.",
};

export async function signupInsider(input: InsiderSignupInput): Promise<{ insider: Insider; existingAccount: boolean }> {
  const repo = getResenhaRepository();
  const known = await repo.getInsiderByEmail(input.email);
  if (known) throw new PartnerError(EXISTING_MESSAGE[known.status], 409);

  const account = await findAccountByEmail(input.email);
  let userId: string;
  if (account) {
    // A conta já existe: só quem sabe a senha dela pode usá-la como Insider.
    if (!(await verifyAccountPassword(input.email, input.password))) {
      throw new PartnerError("Já existe uma conta PRX com este e-mail. Digite a senha dela para usá-la como Insider.", 401);
    }
    userId = account.id;
  } else {
    const problem = passwordProblem(input.password);
    if (problem) throw new PartnerError(problem, 422);
    userId = (await createAccount({ email: input.email, fullName: input.name, password: input.password })).id;
  }

  try {
    const photo = PHOTO_PATTERN.exec(input.photo);
    const avatarUrl = photo ? await setAvatar(userId, { bytes: Buffer.from(photo[2], "base64"), type: photo[1] }) : "";
    const insider = await repo.insertInsider({ userId, email: input.email, name: input.name, handle: input.handle, avatarUrl, active: false, status: "pending" });
    return { insider, existingAccount: Boolean(account) };
  } catch (error) {
    if (!account) await discardAccount(userId);
    throw error;
  }
}
