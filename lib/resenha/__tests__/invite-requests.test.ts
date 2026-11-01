// Hello World
import { beforeEach, describe, expect, it } from "vitest";
import { userStore } from "@/lib/auth";
import { rememberBirthDate } from "@/lib/live/buyer";
import { reserveTicket } from "@/lib/live/service";
import { memberCodeOf } from "@/lib/members/member-code";
import { resetPushMemory } from "@/lib/push/repository";
import { addInsider, createEdition, setEditionStatus } from "@/lib/resenha/admin";
import { cancelInvite, insiderInvites, inviteMember, memberResenhas } from "@/lib/resenha/invites";
import { resetInvitesMemory } from "@/lib/resenha/invites-repository";
import { decideInviteRequest, insiderInviteRequests, memberResenhaCatalog, requestInvite } from "@/lib/resenha/invite-requests";
import { resetInviteRequestsMemory } from "@/lib/resenha/invite-requests-repository";
import { getResenhaRepository, resetResenhaMemory } from "@/lib/resenha/repository";

const DAY = 86_400_000;
const PARTY = new Date(Date.now() + 14 * DAY).toISOString();
let seq = 0;
const uniq = () => `${Date.now()}${++seq}`;
const POLICY = { organizerName: "Organizador de teste", cancellationPolicy: "Política de teste: entrada gratuita, sem reembolso a fazer." };

beforeEach(() => {
  resetResenhaMemory();
  resetInvitesMemory();
  resetInviteRequestsMemory();
  resetPushMemory();
  delete (globalThis as { __prxLiveState?: unknown }).__prxLiveState;
});

async function setup(quota = 2) {
  const edition = await createEdition({ hostName: "Bia", hostArticle: "da", startsAt: PARTY, endsAt: null, venue: "Casa da Bia", city: "Goiânia, GO", address: "Rua A, 1", capacity: null, ...POLICY }, "admin@prx.dev");
  await setEditionStatus(edition.id, "open");
  const manu = await addInsider(edition.id, { mode: "create", name: "Manu Silva", email: `manu${uniq()}@exemplo.com`, handle: "manu", kind: "insider", quota });
  const leo = await addInsider(edition.id, { mode: "create", name: "Leo Costa", email: `leo${uniq()}@exemplo.com`, handle: "leo", kind: "insider", quota });
  const links = await getResenhaRepository().listParticipations({ editionId: edition.id });
  const linkOf = (insiderId: string) => links.find((l) => l.insiderId === insiderId)!.id;
  return { edition, manu: { insider: manu.insider, link: linkOf(manu.insider.id) }, leo: { insider: leo.insider, link: linkOf(leo.insider.id) } };
}

async function member(name: string, birthDate = "2000-05-10") {
  const user = userStore.createUser(`m${uniq()}@exemplo.com`, name, "Senha#2026x");
  await rememberBirthDate(user.id, birthDate, { source: "signup", verified: false });
  return { user, code: (await memberCodeOf(user.id))! };
}

describe("pedido de convite da Resenha pelo app", () => {
  it("catálogo mostra os Insiders da edição aberta; menor de idade não vê", async () => {
    await setup();
    const adult = await member("Ana Pedido");
    const teen = await member("Teo Pedido", "2013-01-01");
    const { entries } = await memberResenhaCatalog(adult.user.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].insiders.map((i) => i.name)).toEqual(["Leo Costa", "Manu Silva"]);
    expect(entries[0].request).toBeNull();
    expect(await memberResenhaCatalog(teen.user.id)).toEqual({ entries: [], minor: true });
    await expect(requestInvite(teen.user.id, entries[0].insiders[0].participationId)).rejects.toMatchObject({ status: 422 });
  });

  it("pedido aguarda o Insider; aprovado vira convite, usa PASS e libera a compra", async () => {
    const { edition, manu } = await setup();
    const guest = await member("Bruno Pedido");
    await requestInvite(guest.user.id, manu.link);

    const [entry] = (await memberResenhaCatalog(guest.user.id)).entries;
    expect(entry.request).toMatchObject({ status: "pending", insiderName: "Manu Silva" });
    await expect(reserveTicket(guest.user, { eventId: edition.eventId, batchId: "lista" })).rejects.toMatchObject({ status: 409 });

    const [pending] = await insiderInviteRequests(manu.insider, manu.link);
    expect(pending).toMatchObject({ memberName: "Bruno Pedido", memberCode: guest.code, status: "pending" });
    await decideInviteRequest(manu.insider, pending.id, "approve");

    expect((await insiderInviteRequests(manu.insider, manu.link))[0].status).toBe("approved");
    expect((await insiderInvites(manu.insider, manu.link))[0]).toMatchObject({ memberName: "Bruno Pedido", status: "invited" });
    expect((await memberResenhas(guest.user.id))[0]).toMatchObject({ insiderName: "Manu Silva" });
    expect((await memberResenhaCatalog(guest.user.id)).entries).toEqual([]);
    expect((await reserveTicket(guest.user, { eventId: edition.eventId, batchId: "lista" })).status).toBe("valid");
  });

  it("recusado não pede de novo, nem a outro Insider, na mesma edição", async () => {
    const { manu, leo } = await setup();
    const guest = await member("Carla Pedido");
    await requestInvite(guest.user.id, manu.link);
    await expect(requestInvite(guest.user.id, leo.link)).rejects.toMatchObject({ status: 409 });

    const [pending] = await insiderInviteRequests(manu.insider, manu.link);
    await decideInviteRequest(manu.insider, pending.id, "reject");
    await expect(decideInviteRequest(manu.insider, pending.id, "approve")).rejects.toMatchObject({ status: 409 });

    expect((await memberResenhaCatalog(guest.user.id)).entries[0].request).toMatchObject({ status: "rejected", insiderName: "Manu Silva" });
    await expect(requestInvite(guest.user.id, leo.link)).rejects.toMatchObject({ status: 409 });
    await expect(requestInvite(guest.user.id, manu.link)).rejects.toMatchObject({ status: 409 });
  });

  it("só o Insider escolhido decide o pedido", async () => {
    const { manu, leo } = await setup();
    const guest = await member("Duda Pedido");
    await requestInvite(guest.user.id, manu.link);
    const [pending] = await insiderInviteRequests(manu.insider, manu.link);
    await expect(decideInviteRequest(leo.insider, pending.id, "approve")).rejects.toMatchObject({ status: 404 });
    await expect(insiderInviteRequests(leo.insider, manu.link)).rejects.toMatchObject({ status: 404 });
  });

  it("Insider sem PASS não recebe pedido; convite direto fecha o pedido pendente", async () => {
    const { manu, leo } = await setup(1);
    const first = await member("Edu Pedido");
    const second = await member("Fabi Pedido");
    await inviteMember(manu.insider, manu.link, first.code);

    const [entry] = (await memberResenhaCatalog(second.user.id)).entries;
    expect(entry.insiders.find((i) => i.name === "Manu Silva")?.available).toBe(false);
    await expect(requestInvite(second.user.id, manu.link)).rejects.toMatchObject({ status: 409 });

    await requestInvite(second.user.id, leo.link);
    await inviteMember(leo.insider, leo.link, second.code);
    expect((await insiderInviteRequests(leo.insider, leo.link))[0].status).toBe("approved");
  });

  it("convite cancelado depois da aprovação aparece como cancelado, sem novo pedido", async () => {
    const { manu, leo } = await setup();
    const guest = await member("Gabi Pedido");
    await requestInvite(guest.user.id, manu.link);
    const [pending] = await insiderInviteRequests(manu.insider, manu.link);
    await decideInviteRequest(manu.insider, pending.id, "approve");
    const [invite] = await insiderInvites(manu.insider, manu.link);
    await cancelInvite(manu.insider, invite.id);

    expect((await memberResenhaCatalog(guest.user.id)).entries[0].request?.status).toBe("cancelled");
    await expect(requestInvite(guest.user.id, leo.link)).rejects.toMatchObject({ status: 409 });
  });
});
