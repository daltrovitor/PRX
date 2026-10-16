// Hello World
import crypto from "crypto";

/**
 * Apuração auditável dos sorteios (compromisso e revelação):
 *   1. ao publicar, a PRX gera uma semente secreta e mostra só o SHA-256 dela;
 *   2. ao encerrar, fixa a lista de participações (numeradas pela ordem) e
 *      mostra o SHA-256 da lista;
 *   3. no sorteio, revela a semente e soma um número público opcional (ex.:
 *      resultado da Loteria Federal). Cada vaga é HMAC-SHA256(semente,
 *      "hashDaLista|númeroPúblico|posição") módulo o total de participações
 *      ainda no páreo; quem ganha sai do páreo (uma vaga por pessoa).
 * Qualquer pessoa com a semente, a lista e o número público refaz a conta.
 */

export const sha256 = (value: string): string => crypto.createHash("sha256").update(value, "utf8").digest("hex");

export function newSeed(): { seed: string; commitHash: string } {
  const seed = crypto.randomBytes(32).toString("hex");
  return { seed, commitHash: sha256(seed) };
}

export interface DrawEntry {
  id: string;
  userId: string;
  entryNumber: number;
}

/** Lista congelada no encerramento: ids na ordem das participações. */
export function entriesHash(entries: ReadonlyArray<DrawEntry>): string {
  return sha256([...entries].sort((a, b) => a.entryNumber - b.entryNumber).map((e) => `${e.entryNumber}:${e.id}`).join("\n"));
}

export interface DrawnWinner {
  position: number;
  entryId: string;
  userId: string;
  entryNumber: number;
}

export function drawWinners(input: { seed: string; entriesHash: string; publicEntropy: string; entries: ReadonlyArray<DrawEntry>; winners: number }): DrawnWinner[] {
  let pool = [...input.entries].sort((a, b) => a.entryNumber - b.entryNumber);
  const out: DrawnWinner[] = [];
  for (let position = 1; position <= input.winners && pool.length > 0; position++) {
    const digest = crypto.createHmac("sha256", input.seed).update(`${input.entriesHash}|${input.publicEntropy.trim()}|${position}`).digest("hex");
    const index = Number(BigInt(`0x${digest}`) % BigInt(pool.length));
    const chosen = pool[index];
    out.push({ position, entryId: chosen.id, userId: chosen.userId, entryNumber: chosen.entryNumber });
    pool = pool.filter((e) => e.userId !== chosen.userId);
  }
  return out;
}

/** Confere uma apuração publicada: a semente bate com o compromisso e os ganhadores saem iguais. */
export function verifyDraw(input: { seed: string; commitHash: string; entriesHash: string; publicEntropy: string; entries: ReadonlyArray<DrawEntry>; winners: ReadonlyArray<Pick<DrawnWinner, "entryId">>; count: number }): boolean {
  if (sha256(input.seed) !== input.commitHash) return false;
  if (entriesHash(input.entries) !== input.entriesHash) return false;
  const again = drawWinners({ seed: input.seed, entriesHash: input.entriesHash, publicEntropy: input.publicEntropy, entries: input.entries, winners: input.count });
  return again.length === input.winners.length && again.every((w, i) => w.entryId === input.winners[i].entryId);
}

/** Nome do ganhador com privacidade: primeiro nome e inicial do último sobrenome. */
export function maskedName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Membro PRX";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}
