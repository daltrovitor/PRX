// Hello World
import { beforeEach, describe, expect, it } from "vitest";
import { userStore } from "@/lib/auth";
import { rememberBirthDate } from "@/lib/live/buyer";
import { getRafflesRepository, resetRafflesMemory } from "@/lib/raffles/repository";
import { closeRaffle, drawRaffle, enterRaffle, memberRaffles, publishRaffle, saveRaffle, setPaused } from "@/lib/raffles/service";
import { drawWinners, entriesHash, maskedName, sha256, verifyDraw } from "@/lib/raffles/draw";

const T0 = new Date("2026-10-16T12:00:00.000Z");
const base = {
  title: "Sorteio de ingressos VIP",
  prize: "2 ingressos VIP para o PRX LIVE",
  startsAt: "2026-10-16T00:00:00.000Z",
  endsAt: "2026-10-20T23:59:59.000Z",
  drawAt: "2026-10-21T20:00:00.000Z",
  winnersCount: 2,
};
const legal = { authorizationNumber: "04.000123/2026", authorizationIssuer: "SPA/MF", authorizationValidUntil: "2026-12-31", regulationUrl: "https://prx.app.br/regulamentos/vip" };
const member = (name: string) => userStore.createUser(`r${Date.now()}${Math.random().toString(36).slice(2, 7)}@prx.dev`, name, "Senha#2026x", "52998224725", "11988887777");

beforeEach(() => resetRafflesMemory());

describe("apuração verificável", () => {
  it("mesma semente, lista e número público dão os mesmos ganhadores; uma vaga por pessoa", () => {
    const entries = [
      { id: "e1", userId: "u1", entryNumber: 1 },
      { id: "e2", userId: "u1", entryNumber: 2 },
      { id: "e3", userId: "u2", entryNumber: 3 },
      { id: "e4", userId: "u3", entryNumber: 4 },
    ];
    const seed = "a".repeat(64);
    const hash = entriesHash(entries);
    const a = drawWinners({ seed, entriesHash: hash, publicEntropy: "12345", entries, winners: 3 });
    const b = drawWinners({ seed, entriesHash: hash, publicEntropy: "12345", entries: [...entries].reverse(), winners: 3 });
    expect(a).toEqual(b);
    expect(new Set(a.map((w) => w.userId)).size).toBe(3);
    expect(verifyDraw({ seed, commitHash: sha256(seed), entriesHash: hash, publicEntropy: "12345", entries, winners: a, count: 3 })).toBe(true);
    expect(verifyDraw({ seed: "b".repeat(64), commitHash: sha256(seed), entriesHash: hash, publicEntropy: "12345", entries, winners: a, count: 3 })).toBe(false);
    expect(maskedName("Ana Clara Souza")).toBe("Ana S.");
  });
});

describe("sorteios", () => {
  it("só publica com a autorização e o regulamento; participação gratuita, com limite e elegibilidade", async () => {
    const r = await saveRaffle({ ...base, minAge: 18 }, "admin@prx.dev");
    await expect(publishRaffle(r.id, true, "admin@prx.dev", T0)).rejects.toThrow(/autorização/);
    await saveRaffle({ ...base, minAge: 18, ...legal }, "admin@prx.dev", r.id);
    await expect(publishRaffle(r.id, false, "admin@prx.dev", T0)).rejects.toThrow(/Confirme/);
    const published = await publishRaffle(r.id, true, "admin@prx.dev", T0);
    expect(published.commitHash).toBe(sha256(published.seed!));
    // Regras do jogo travadas depois de publicar.
    await expect(saveRaffle({ ...base, minAge: 18, ...legal, winnersCount: 5 }, "admin@prx.dev", r.id)).rejects.toThrow(/só dá para mudar/);

    const ana = member("Ana Souza");
    await expect(enterRaffle(ana.id, r.id, T0)).rejects.toThrow(/data de nascimento/);
    await rememberBirthDate(ana.id, "2000-01-01", { source: "signup", verified: true });
    await expect(enterRaffle(ana.id, r.id, T0)).resolves.toEqual({ entries: 1 });
    await expect(enterRaffle(ana.id, r.id, T0)).rejects.toThrow(/já está participando/);
    const teen = member("Teen Lima");
    await rememberBirthDate(teen.id, "2012-01-01", { source: "signup", verified: true });
    await expect(enterRaffle(teen.id, r.id, T0)).rejects.toThrow(/maiores de 18/);

    // O app nunca recebe a semente antes do sorteio.
    const view = (await memberRaffles(ana.id, T0)).find((x) => x.id === r.id)!;
    expect(view).toMatchObject({ seed: null, myEntries: 1, commitHash: published.commitHash });
    await setPaused(r.id, true, "admin@prx.dev");
    const bia = member("Bia Rocha");
    await rememberBirthDate(bia.id, "1999-01-01", { source: "signup", verified: true });
    await expect(enterRaffle(bia.id, r.id, T0)).rejects.toThrow(/pausadas/);
  });

  it("encerra, apura na data, revela a semente e mostra o ganhador com privacidade", async () => {
    const r = await saveRaffle({ ...base, ...legal }, "admin@prx.dev");
    await publishRaffle(r.id, true, "admin@prx.dev", T0);
    const people = [member("Ana Souza"), member("Bia Rocha"), member("Caio Lima")];
    for (const p of people) await enterRaffle(p.id, r.id, T0);
    const closed = await closeRaffle(r.id, "admin@prx.dev");
    expect(closed).toMatchObject({ status: "closed", entriesCount: 3 });
    await expect(drawRaffle(r.id, "", "admin@prx.dev", new Date("2026-10-21T10:00:00Z"))).rejects.toThrow(/data do sorteio/);
    const drawn = await drawRaffle(r.id, "Loteria Federal 5990: 54321", "admin@prx.dev", new Date("2026-10-21T21:00:00Z"));
    expect(drawn.winners).toHaveLength(2);
    expect(drawn.winners.every((w) => /^[A-Z][a-z]+ [A-Z]\.$/.test(w.displayName))).toBe(true);

    // Qualquer um refaz a conta com o que foi publicado.
    const entries = (await getRafflesRepository().allEntries(r.id)).map((e) => ({ id: e.id, userId: e.userId, entryNumber: e.entryNumber! }));
    expect(verifyDraw({ seed: drawn.seed!, commitHash: drawn.commitHash!, entriesHash: drawn.entriesHash!, publicEntropy: drawn.publicEntropy, entries, winners: drawn.winners, count: 2 })).toBe(true);
    const view = (await memberRaffles(people[0].id, new Date("2026-10-22T00:00:00Z"))).find((x) => x.id === r.id)!;
    expect(view.seed).toBe(drawn.seed);
    expect(JSON.stringify(view.winners)).not.toContain(people[1].id);
  });
});
