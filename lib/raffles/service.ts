// Hello World
import { PartnerError } from "@/lib/partners/errors";
import { ageOn } from "@/lib/family/age";
import { verifiedBirthDate } from "@/lib/bank/access";
import { bankAccountIsActive } from "@/lib/bank/lock";
import { isActiveFounder } from "@/lib/founders/members";
import { hasActiveSubscription } from "@/lib/subscriptions/service";
import { memberContacts } from "@/lib/admin/members";
import { getRafflesRepository } from "@/lib/raffles/repository";
import { drawWinners, entriesHash, maskedName, newSeed } from "@/lib/raffles/draw";
import { LOCKED_AFTER_PUBLISH, raffleInputSchema, type Raffle, type RaffleInput } from "@/lib/raffles/types";

/**
 * Regras dos sorteios. Publicar exige a autorização legal informada e o aceite
 * de quem publica; a participação é gratuita e a elegibilidade é conferida
 * aqui; o encerramento congela a lista; a apuração é verificável e o resultado
 * mostra os ganhadores só com o primeiro nome e a inicial.
 */

const repo = () => getRafflesRepository();
const log = (raffleId: string, actor: string, action: string, detail = "") => repo().insertEvent({ raffleId, actor, action, detail });

export async function saveRaffle(raw: unknown, actor: string, id?: string): Promise<Raffle> {
  const parsed = raffleInputSchema.safeParse(raw);
  if (!parsed.success) throw new PartnerError(parsed.error.issues[0]?.message ?? "Confira o sorteio.", 422);
  const input = parsed.data;
  if (!id) {
    const created = await repo().insert(
      { ...input, legalAckBy: null, legalAckAt: null, status: "draft", seed: null, commitHash: null, entriesHash: null, entriesCount: null, publicEntropy: "", winners: [], drawnAt: null },
      actor
    );
    await log(created.id, actor, "created", created.title);
    return created;
  }
  const current = await repo().get(id);
  if (!current) throw new PartnerError("Sorteio não encontrado.", 404);
  if (current.status === "drawn" || current.status === "cancelled" || current.status === "closed") throw new PartnerError("Sorteio encerrado não pode ser editado.", 409);
  if (current.status !== "draft") {
    const changed = LOCKED_AFTER_PUBLISH.filter((k) => JSON.stringify(input[k]) !== JSON.stringify((current as unknown as RaffleInput)[k]));
    if (changed.length > 0) throw new PartnerError("Depois de publicado, só dá para mudar título, descrição, imagem e texto das regras.", 409);
  }
  const saved = await repo().update(id, input);
  if (!saved) throw new PartnerError("Sorteio não encontrado.", 404);
  await log(id, actor, "edited");
  return saved;
}

/** Publica: confere a base legal, gera a semente secreta e mostra só o hash dela. */
export async function publishRaffle(id: string, acknowledged: boolean, actor: string, now = new Date()): Promise<Raffle> {
  const r = await repo().get(id);
  if (!r) throw new PartnerError("Sorteio não encontrado.", 404);
  if (r.status !== "draft") throw new PartnerError("Só rascunhos podem ser publicados.", 409);
  if (!r.authorizationNumber || !r.authorizationIssuer) throw new PartnerError("Informe o número e o órgão da autorização do sorteio antes de publicar.", 422);
  if (!r.regulationUrl) throw new PartnerError("Publique o regulamento e informe o link antes de publicar.", 422);
  if (r.authorizationValidUntil && Date.parse(`${r.authorizationValidUntil}T23:59:59-03:00`) < Date.parse(r.drawAt)) throw new PartnerError("A autorização vence antes da data do sorteio.", 422);
  if (Date.parse(r.endsAt) <= now.getTime()) throw new PartnerError("As inscrições já teriam terminado. Ajuste as datas.", 422);
  if (!acknowledged) throw new PartnerError("Confirme que a autorização e o regulamento informados são válidos para este sorteio.", 422);
  const { seed, commitHash } = newSeed();
  const saved = await repo().update(id, { status: "published", seed, commitHash, legalAckBy: actor, legalAckAt: now.toISOString() }, "draft");
  if (!saved) throw new PartnerError("O sorteio mudou enquanto você publicava. Atualize a página.", 409);
  await log(id, actor, "published", `Autorização ${r.authorizationIssuer} nº ${r.authorizationNumber} · hash de compromisso ${commitHash}`);
  return saved;
}

export async function setPaused(id: string, paused: boolean, actor: string): Promise<Raffle> {
  const saved = await repo().update(id, { status: paused ? "paused" : "published" }, paused ? "published" : "paused");
  if (!saved) throw new PartnerError(paused ? "Só sorteios com inscrições abertas podem ser pausados." : "Este sorteio não está pausado.", 409);
  await log(id, actor, paused ? "paused" : "resumed");
  return saved;
}

export async function cancelRaffle(id: string, reason: string, actor: string): Promise<Raffle> {
  const r = await repo().get(id);
  if (!r) throw new PartnerError("Sorteio não encontrado.", 404);
  if (r.status === "drawn" || r.status === "cancelled") throw new PartnerError("Este sorteio já foi encerrado.", 409);
  if (reason.trim().length < 5) throw new PartnerError("Informe o motivo do cancelamento (os participantes veem).", 422);
  const saved = await repo().update(id, { status: "cancelled" }, r.status);
  if (!saved) throw new PartnerError("O sorteio mudou. Atualize a página.", 409);
  await log(id, actor, "cancelled", reason.trim());
  return saved;
}

/** Encerra as inscrições: numera as participações pela ordem e fixa o hash da lista. */
export async function closeRaffle(id: string, actor: string): Promise<Raffle> {
  const r = await repo().get(id);
  if (!r) throw new PartnerError("Sorteio não encontrado.", 404);
  if (r.status !== "published" && r.status !== "paused") throw new PartnerError("Só sorteios com inscrições abertas ou pausadas podem ser encerrados.", 409);
  const entries = (await repo().allEntries(id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const numbered = entries.map((e, i) => ({ id: e.id, userId: e.userId, entryNumber: i + 1 }));
  await repo().setEntryNumbers(id, numbered.map(({ id: entryId, entryNumber }) => ({ id: entryId, entryNumber })));
  const hash = entriesHash(numbered);
  const saved = await repo().update(id, { status: "closed", entriesHash: hash, entriesCount: numbered.length }, r.status);
  if (!saved) throw new PartnerError("O sorteio mudou. Atualize a página.", 409);
  await log(id, actor, "closed", `${numbered.length} participação(ões) · hash da lista ${hash}`);
  return saved;
}

/** Encerra sozinho quem já passou do fim das inscrições (ao listar). */
async function closeIfEnded(r: Raffle, now: Date): Promise<Raffle> {
  if ((r.status === "published" || r.status === "paused") && Date.parse(r.endsAt) <= now.getTime()) {
    return closeRaffle(r.id, "encerramento automático").catch(() => r);
  }
  return r;
}

/** Apura: revela a semente e sorteia (uma vaga por pessoa). O número público é opcional (ex.: Loteria Federal). */
export async function drawRaffle(id: string, publicEntropy: string, actor: string, now = new Date()): Promise<Raffle> {
  let r = await repo().get(id);
  if (!r) throw new PartnerError("Sorteio não encontrado.", 404);
  r = await closeIfEnded(r, now);
  if (r.status !== "closed") throw new PartnerError("Encerre as inscrições antes de sortear.", 409);
  if (Date.parse(r.drawAt) > now.getTime()) throw new PartnerError("Ainda não chegou a data do sorteio informada no regulamento.", 409);
  if (!r.seed || !r.entriesHash) throw new PartnerError("Sorteio sem semente ou lista registrada: não dá para apurar.", 409);
  const entries = (await repo().allEntries(id)).filter((e) => e.entryNumber !== null).map((e) => ({ id: e.id, userId: e.userId, entryNumber: e.entryNumber as number }));
  const drawn = drawWinners({ seed: r.seed, entriesHash: r.entriesHash, publicEntropy, entries, winners: r.winnersCount });
  const contacts = await memberContacts(drawn.map((w) => w.userId));
  const winners = drawn.map((w) => ({ ...w, displayName: maskedName(contacts.get(w.userId)?.name ?? "") }));
  const saved = await repo().update(id, { status: "drawn", publicEntropy: publicEntropy.trim().slice(0, 200), winners, drawnAt: now.toISOString() }, "closed");
  if (!saved) throw new PartnerError("O sorteio mudou. Atualize a página.", 409);
  await log(id, actor, "drawn", `${winners.length} ganhador(es) · semente revelada ${r.seed}${publicEntropy.trim() ? ` · número público ${publicEntropy.trim()}` : ""}`);
  return saved;
}

/* -------------------------------------------------------------------------- */
/* Membro                                                                      */
/* -------------------------------------------------------------------------- */

export interface RaffleEligibility {
  eligible: boolean;
  reason: string | null;
}

export async function raffleEligibility(r: Raffle, userId: string, now = new Date()): Promise<RaffleEligibility> {
  if (r.minAge !== null) {
    const birth = await verifiedBirthDate(userId);
    if (!birth) return { eligible: false, reason: "Confirme sua data de nascimento no Perfil para participar." };
    if (ageOn(birth.birthDate, now) < r.minAge) return { eligible: false, reason: `Sorteio para maiores de ${r.minAge} anos.` };
  }
  if (r.requiresActiveBank) {
    if (!(await bankAccountIsActive(userId))) return { eligible: false, reason: "Sorteio para quem tem a conta PRX BANK ativa." };
  }
  if (r.foundersOnly && !(await isActiveFounder(userId, now))) return { eligible: false, reason: "Sorteio exclusivo para Founders da PRX." };
  if (r.subscribersOnly && !(await hasActiveSubscription(userId, now))) return { eligible: false, reason: "Sorteio exclusivo para assinantes da PRX." };
  return { eligible: true, reason: null };
}

export async function enterRaffle(userId: string, raffleId: string, now = new Date()): Promise<{ entries: number }> {
  const r = await repo().get(raffleId);
  if (!r || r.status === "draft") throw new PartnerError("Sorteio não encontrado.", 404);
  if (r.status !== "published") throw new PartnerError(r.status === "paused" ? "As inscrições estão pausadas." : "As inscrições deste sorteio estão encerradas.", 409);
  if (Date.parse(r.startsAt) > now.getTime()) throw new PartnerError("As inscrições ainda não começaram.", 409);
  if (Date.parse(r.endsAt) <= now.getTime()) throw new PartnerError("As inscrições deste sorteio estão encerradas.", 409);
  const eligibility = await raffleEligibility(r, userId, now);
  if (!eligibility.eligible) throw new PartnerError(eligibility.reason ?? "Você não pode participar.", 403);
  const mine = await repo().entriesOf(raffleId, userId);
  if (mine.length >= r.maxEntriesPerUser) throw new PartnerError(r.maxEntriesPerUser === 1 ? "Você já está participando." : "Você já usou todas as suas participações.", 409);
  await repo().insertEntry({ raffleId, userId, slot: mine.length + 1 });
  return { entries: mine.length + 1 };
}

/** O que o app mostra: nunca a semente antes do sorteio. */
export type PublicRaffle = Omit<Raffle, "seed" | "legalAckBy" | "winners" | "createdAt" | "updatedAt"> & {
  seed: string | null;
  winners: Array<{ position: number; displayName: string; entryNumber: number; isMe: boolean }>;
  myEntries: number;
  eligibility: RaffleEligibility;
};

export async function memberRaffles(userId: string, now = new Date()): Promise<PublicRaffle[]> {
  const { items } = await repo().list({ statuses: ["published", "paused", "closed", "drawn", "cancelled"], offset: 0, limit: 50 });
  const mine = await repo().myEntryCounts(userId);
  const visible = items.filter((r) => r.status !== "cancelled" || mine.has(r.id));
  const fresh = await Promise.all(visible.map((r) => closeIfEnded(r, now)));
  return Promise.all(
    fresh.map(async (r) => {
      const { seed, legalAckBy: _ack, winners, createdAt: _c, updatedAt: _u, ...rest } = r;
      void _ack;
      void _c;
      void _u;
      return {
        ...rest,
        seed: r.status === "drawn" ? seed : null,
        winners: winners.map((w) => ({ position: w.position, displayName: w.displayName, entryNumber: w.entryNumber, isMe: w.userId === userId })),
        myEntries: mine.get(r.id) ?? 0,
        eligibility: r.status === "published" ? await raffleEligibility(r, userId, now) : { eligible: false, reason: null },
      };
    })
  );
}
