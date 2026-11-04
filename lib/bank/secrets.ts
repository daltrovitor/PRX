// Hello World
import crypto from "crypto";

/**
 * Cifra das chaves de API das contas no banco parceiro (AES-256-GCM). O texto cifrado leva o id da
 * chave usada ("k" = BANK_ENCRYPTION_KEY, "s" = derivada da service role do
 * Supabase), então ligar BANK_ENCRYPTION_KEY depois não perde as chaves antigas.
 * Formato: v1:<kid>:<iv>:<tag>:<dados>, tudo em base64url.
 */

type KeyId = "k" | "s";
type Env = Record<string, string | undefined>;

function keyFor(kid: KeyId, env: Env): Buffer | null {
  if (kid === "k") {
    const raw = (env.BANK_ENCRYPTION_KEY ?? "").trim();
    return raw.length >= 32 ? crypto.createHash("sha256").update(`prx-bank-key:v1:${raw}`).digest() : null;
  }
  const serviceRole = (env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY || "").trim();
  return serviceRole ? crypto.createHash("sha256").update(`prx-bank-key:srk:v1:${serviceRole}`).digest() : null;
}

/** Chave preferida para cifrar: a dedicada; na falta dela, a derivada. */
function currentKey(env: Env): { kid: KeyId; key: Buffer } {
  for (const kid of ["k", "s"] as const) {
    const key = keyFor(kid, env);
    if (key) return { kid, key };
  }
  throw new Error("PRX: defina BANK_ENCRYPTION_KEY (32+ caracteres) para guardar as chaves das contas.");
}

export function encryptSecret(plain: string, env: Env = process.env): string {
  const { kid, key } = currentKey(env);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", kid, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(":");
}

export function decryptSecret(sealed: string, env: Env = process.env): string {
  const [version, kid, iv, tag, data] = sealed.split(":");
  if (version !== "v1" || (kid !== "k" && kid !== "s") || !iv || !tag || !data) throw new Error("[bank] segredo em formato desconhecido.");
  const key = keyFor(kid, env);
  if (!key) throw new Error(`[bank] chave de cifra "${kid}" ausente neste ambiente.`);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
