// Hello World
import { beforeEach, describe, expect, it } from "vitest";
import { userStore } from "@/lib/auth";
import { rememberBirthDate } from "@/lib/live/buyer";
import { reserveTicket } from "@/lib/live/service";
import { generateMemberCode, memberCodeOf, normalizeMemberCode } from "@/lib/members/member-code";
import { resetPushMemory, saveSubscription } from "@/lib/push/repository";
import { sendPushToUser } from "@/lib/push/send";
import { addInsider, createEdition, setEditionStatus } from "@/lib/resenha/admin";
import { cancelInvite, insiderInvites, inviteMember, memberResenhas, searchCandidates } from "@/lib/resenha/invites";
import { resetInvitesMemory } from "@/lib/resenha/invites-repository";
import { getResenhaRepository, resetResenhaMemory } from "@/lib/resenha/repository";
import { decideRequest, insiderEditions, submitRequest } from "@/lib/resenha/service";

const DAY = 86_400_000;
const PARTY = new Date(Date.now() + 14 * DAY).toISOString();
let seq = 0;
const uniq = () => `${Date.now()}${++seq}`;
const POLICY = { organizerName: "Organizador de teste", cancellationPolicy: "Política de teste: entrada gratuita, sem reembolso a fazer." };

beforeEach(() => {
  resetResenhaMemory();
  resetInvitesMemory();
  resetPushMemory();
  delete (globalThis as { __prxLiveState?: unknown }).__prxLiveState;
});

async function setup(quota = 2) {
  const edition = await createEdition({ hostName: "Bia", hostArticle: "da", startsAt: PARTY, endsAt: null, venue: "Casa da Bia", city: "Goiânia, GO", address: "Rua A, 1", capacity: null, ...POLICY }, "admin@prx.dev");
  await setEditionStatus(edition.id, "open");
  const manu = await addInsider(edition.id, { mode: "create", name: "Manu Silva", email: `manu${uniq()}@exemplo.com`, handle: "manu", kind: "insider", quota });
  const [link] = await getResenhaRepository().listParticipations({ editionId: edition.id });
  return { edition, insider: manu.insider, link: link.id };
}

async function member(name: string, birthDate = "2000-05-10") {
  const user = userStore.createUser(`m${uniq()}@exemplo.com`, name, "Senha#2026x");
  await rememberBirthDate(user.id, birthDate, { source: "signup", verified: false });
  return { user, code: (await memberCodeOf(user.id))! };
}

describe("ID PRX", () => {
  it("formato PRX-XXXXXX sem letras ambíguas, aceito com ou sem prefixo", () => {
    expect(generateMemberCode(() => 0)).toBe("PRX-222222");
    expect(normalizeMemberCode("prx 7k3m9q")).toBe("PRX-7K3M9Q");
    expect(normalizeMemberCode("7K3M9Q")).toBe("PRX-7K3M9Q");
    expect(normalizeMemberCode("PRX-7K3M9O")).toBeNull();
  });

  it("cada conta tem o seu, estável", async () => {
    const a = await member("Ana Clara");
    const b = await member("Bruno Lima");
    expect(a.code).not.toBe(b.code);
    expect(await memberCodeOf(a.user.id)).toBe(a.code);
  });
});

describe("convite da Resenha pelo app", () => {
  it("o Insider acha por nome ou ID; menor de idade nem aparece", async () => {
    const { insider, link } = await setup();
    const adult = await member("Carla Resenha");
    await member("Carlinhos Resenha", "2013-01-01");
    const byName = await searchCandidates(insider, link, "resenha");
    expect(byName.map((m) => m.name)).toEqual(["Carla Resenha"]);
    expect((await searchCandidates(insider, link, adult.code.toLowerCase()))[0]).toMatchObject({ memberCode: adult.code, status: "available" });
  });

  it("convidado vê a Resenha, compra o ingresso e não pode mais ser descartado pelo Insider", async () => {
    const { insider, link, edition } = await setup();
    const guest = await member("Duda Convidada");
    const outsider = await member("Edu Sem Convite");

    expect(await memberResenhas(guest.user.id)).toEqual([]);
    await inviteMember(insider, link, guest.code);
    const [view] = await memberResenhas(guest.user.id);
    expect(view).toMatchObject({ headline: "RESENHA 001 — DA BIA", insiderName: "Manu Silva", ticket: "none" });
    expect(await memberResenhas(outsider.user.id)).toEqual([]);

    await expect(reserveTicket(outsider.user, { eventId: edition.eventId, batchId: "lista" })).rejects.toMatchObject({ status: 409 });
    const ticket = await reserveTicket(guest.user, { eventId: edition.eventId, batchId: "lista" });
    expect(ticket.status).toBe("valid");

    const [invite] = await insiderInvites(insider, link);
    expect(invite).toMatchObject({ memberName: "Duda Convidada", ticket: "valid" });
    await expect(cancelInvite(insider, invite.id)).rejects.toMatchObject({ status: 409 });
  });

  it("cada convite ocupa um PASS, junto com os pedidos liberados; cancelar devolve", async () => {
    const { insider, link } = await setup(2);
    const a = await member("Fe Um");
    const b = await member("Gui Dois");
    const c = await member("Hel Tres");
    await inviteMember(insider, link, a.code);
    await expect(inviteMember(insider, link, a.code)).rejects.toMatchObject({ status: 409 });
    await inviteMember(insider, link, b.code);
    await expect(inviteMember(insider, link, c.code)).rejects.toMatchObject({ status: 409, message: expect.stringContaining("PASSes acabaram") });

    const [stats] = (await insiderEditions(insider, "https://prx.app.br")).map((e) => e.stats);
    expect(stats).toMatchObject({ quota: 2, approved: 0, invited: 2, left: 0 });

    // Pedido pelo link também respeita a cota cheia de convites.
    const code = (await getResenhaRepository().getParticipation(link))!.code;
    const { token } = await submitRequest("001", { code, name: "Pedido Pelo Link", email: `p${uniq()}@exemplo.com`, whatsapp: "", instagram: "", birthDate: "2000-01-01", consent: true });
    const request = (await getResenhaRepository().getRequestByToken(token))!;
    await expect(decideRequest({ kind: "insider", insider }, request.id, "approve")).rejects.toMatchObject({ status: 409 });

    const first = (await insiderInvites(insider, link)).find((i) => i.memberName === "Fe Um")!;
    await cancelInvite(insider, first.id);
    expect(await memberResenhas(a.user.id)).toEqual([]);
    await inviteMember(insider, link, c.code);
  });

  it("recusa menor de idade, a si mesmo e lista fechada", async () => {
    const { insider, link, edition } = await setup();
    const minor = await member("Ian Menor", "2012-03-03");
    await expect(inviteMember(insider, link, minor.code)).rejects.toMatchObject({ status: 422 });
    await expect(inviteMember(insider, link, (await memberCodeOf(insider.userId))!)).rejects.toMatchObject({ status: 409 });
    await setEditionStatus(edition.id, "closed");
    const late = await member("Jo Atrasado");
    await expect(inviteMember(insider, link, late.code)).rejects.toMatchObject({ status: 409, message: expect.stringContaining("fechou") });
  });
});

describe("notificação no celular", () => {
  it("sem as chaves VAPID não envia nada e não quebra", async () => {
    const { user } = await member("Kai Push");
    await saveSubscription({ userId: user.id, endpoint: "https://push.example.com/abc", p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg", userAgent: "" });
    expect(await sendPushToUser(user.id, { title: "Teste", body: "Corpo", url: "/#profile" })).toBe(0);
  });
});
