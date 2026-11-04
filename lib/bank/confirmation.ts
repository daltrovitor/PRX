// Hello World
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isPublicSupabaseKey } from "@/lib/supabase/client";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { z } from "zod";
import { PartnerError } from "@/lib/partners/errors";
import { checkRateLimitPersistent } from "@/lib/security";
import { PasskeyError, transactionOptions, verifyTransaction } from "@/lib/passkeys/service";

/**
 * Confirmação de cada saída de dinheiro: biometria do aparelho (WebAuthn,
 * desafio amarrado ao pedido) ou, sem biometria cadastrada, a senha da conta.
 * O uso único vem da troca de status atômica do pedido, não do desafio.
 */

/** A biometria é presa ao aparelho em que foi ativada: em outro aparelho, a senha continua valendo. */
export type ConfirmationOffer =
  | { method: "passkey"; options: NonNullable<Awaited<ReturnType<typeof transactionOptions>>>["options"]; sealed: string; passwordFallback: true }
  | { method: "password" };

export const proofSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("passkey"),
    sealed: z.string().min(10).max(4000),
    response: z.custom<AuthenticationResponseJSON>((v) => typeof v === "object" && v !== null && typeof (v as { id?: unknown }).id === "string", "Biometria inválida."),
  }),
  z.object({ type: z.literal("password"), password: z.string().min(1, "Digite sua senha.").max(200) }),
]);
export type ConfirmationProof = z.output<typeof proofSchema>;

export async function confirmationOffer(req: NextRequest, userId: string, requestId: string): Promise<ConfirmationOffer> {
  const passkey = await transactionOptions(req, userId, requestId);
  return passkey ? { method: "passkey", ...passkey, passwordFallback: true } : { method: "password" };
}

/** Senha conferida no Supabase Auth (a sessão aberta para isso é descartada). */
async function verifyPassword(email: string, password: string): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.URL || "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.ANON_KEY || "";
  if (!url || !isPublicSupabaseKey(anon)) throw new PartnerError("Confirmação por senha indisponível neste ambiente.", 503);
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new PartnerError("Senha incorreta. Quem entra só com o Google ativa a biometria no Perfil para confirmar operações.", 401);
}

export async function verifyProof(req: NextRequest, user: { id: string; email: string }, requestId: string, proof: ConfirmationProof): Promise<void> {
  const rate = await checkRateLimitPersistent(`bank_confirm_${user.id}`, 8, 600);
  if (!rate.allowed) throw new PartnerError(`Muitas tentativas de confirmação. Aguarde ${rate.resetInSeconds}s.`, 429);
  if (proof.type === "password") return verifyPassword(user.email, proof.password);
  try {
    await verifyTransaction(req, proof.sealed, proof.response, user.id, requestId);
  } catch (err) {
    if (err instanceof PasskeyError) throw new PartnerError(err.message, err.status === 403 ? 403 : 401);
    throw err;
  }
}
