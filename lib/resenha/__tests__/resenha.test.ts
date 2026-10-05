// Hello World
import { beforeEach, describe, expect, it } from "vitest";
import { userStore } from "@/lib/auth";
import { getLiveRepository } from "@/lib/live/repository";
import { listPublicEvents, reserveTicket } from "@/lib/live/service";
import { addInsider, adminOverview, createEdition, setEditionStatus, setInsiderActive, updateParticipation } from "@/lib/resenha/admin";
import { insiderForUser } from "@/lib/resenha/access";
import { getResenhaRepository, resetResenhaMemory } from "@/lib/resenha/repository";
import { decideRequest, guestView, insiderEditions, insiderRequests, publicEdition, submitRequest, type Actor } from "@/lib/resenha/service";
import type { RequestInput } from "@/lib/resenha/types";

const DAY = 86_400_000;
const PARTY = new Date(Date.now() + 14 * DAY).toISOString();
let seq = 0;
const uniq = () => `${Date.now()}${++seq}`;

beforeEach(() => {
  resetResenhaMemory();
  delete (globalThis as { __prxLiveState?: unknown }).__prxLiveState;
});

async function setup(options: { quota?: number; capacity?: number | null; status?: "draft" | "open" | "closed" } = {}) {
  const edition = await createEdition(
    { hostName: "Bia", hostArticle: "da", startsAt: PARTY, endsAt: null, venue: "Casa da Bia", city: "São Paulo, SP", address: "Rua A, 1", capacity: options.capacity ?? null },
    "admin@prx.dev"
  );
  if (options.status !== "draft") await setEditionStatus(edition.id, options.status ?? "open");
  const manu = await addInsider(edition.id, { mode: "create", name: "Manu Silva", email: `manu${uniq()}@exemplo.com`, handle: "manu", kind: "insider", quota: options.quota ?? 2 });
  return { edition, manu, actor: { kind: "insider", insider: manu.insider } satisfies Actor };
}

const guest = (code: string, n: number | string, birthDate = "2000-01-01"): RequestInput => ({
  code,
  name: `Convidado ${n} Silva`,
  email: `g${n}${uniq()}@exemplo.com`,
  whatsapp: "",
  instagram: "",
  birthDate,
  consent: true,
});

async function request(code: string, n: number | string) {
  const { token } = await submitRequest("001", guest(code, n));
  const found = await getResenhaRepository().getRequestByToken(token);
  if (!found) throw new Error("pedido não gravado");
  return found;
}

describe("edição e evento do PRX LIVE", () => {
  it("cria o evento da série resenha: só por lista, fora da agenda, com portaria da equipe", async () => {
    const { edition } = await setup();
    const event = await getLiveRepository().getEvent(edition.eventId);
    expect(event).toMatchObject({ series: "resenha", title: "Resenha da Bia", status: "published", staffCheckin: true });
    expect(edition.slug).toBe("001");
    expect((await listPublicEvents()).some((e) => e.id === edition.eventId)).toBe(false);

    const member = userStore.createUser(`m${uniq()}@exemplo.com`, "Membro Teste", "Senha1234");
    await expect(reserveTicket(member, { eventId: edition.eventId, batchId: "lista" })).rejects.toMatchObject({ status: 409, message: expect.stringContaining("só por lista") });
  });

  it("numera as edições em sequência", async () => {
    await setup();
    const second = await createEdition({ hostName: "Gabs", hostArticle: "do", startsAt: PARTY, endsAt: null, venue: "Casa", city: "SP", address: "", capacity: null }, "admin@prx.dev");
    expect(second).toMatchObject({ number: 2, slug: "002", hostArticle: "do" });
  });

  it("o resumo do admin traz links, cotas e lotação", async () => {
    const { edition, manu } = await setup({ quota: 5, capacity: 100 });
    const overview = await adminOverview("https://prx.app.br");
    const view = overview.editions.find((e) => e.id === edition.id);
    expect(view).toMatchObject({ headline: "RESENHA 001 — DA BIA", event: { capacity: 100, issued: 0 } });
    expect(view?.participations[0]).toMatchObject({ quota: 5, link: `https://prx.app.br/resenha/001?i=${manu.participation.code}`, stats: { left: 5, approved: 0 } });
  });
});

describe("página pública e pedido de acesso", () => {
  it("mostra a edição e o Insider do link; sem link, não dá para pedir", async () => {
    const { manu } = await setup();
    const withLink = await publicEdition("001", manu.participation.code);
    expect(withLink).toMatchObject({ canRequest: true, reason: null, insider: { name: "Manu Silva", kind: "insider" }, edition: { headline: "RESENHA 001 — DA BIA" } });
    expect(JSON.stringify(withLink)).not.toContain("Casa da Bia");

    const withoutLink = await publicEdition("001", null);
    expect(withoutLink).toMatchObject({ canRequest: false, insider: null, reason: expect.stringContaining("link de um Insider") });
    expect((await publicEdition("001", "inventado-xxxx")).canRequest).toBe(false);
  });

  it("rascunho e endereços inválidos não existem para o público", async () => {
    await setup({ status: "draft" });
    await expect(publicEdition("001", null)).rejects.toMatchObject({ status: 404 });
    await expect(publicEdition("abc", null)).rejects.toMatchObject({ status: 404 });
    await expect(publicEdition("999", null)).rejects.toMatchObject({ status: 404 });
  });

  it("recebe o pedido, bloqueia e-mail repetido, menor de 18 e link inexistente", async () => {
    const { manu } = await setup();
    const input = guest(manu.participation.code, "a");
    const { token } = await submitRequest("001", input);
    expect(token.length).toBeGreaterThanOrEqual(24);
    await expect(submitRequest("001", input)).rejects.toMatchObject({ status: 409 });

    const underage = new Date(Date.now() + 14 * DAY);
    underage.setFullYear(underage.getFullYear() - 17);
    await expect(submitRequest("001", guest(manu.participation.code, "b", underage.toISOString().slice(0, 10)))).rejects.toMatchObject({ status: 422, message: expect.stringContaining("18") });
    await expect(submitRequest("001", guest("nao-existe", "c"))).rejects.toMatchObject({ status: 404 });
  });

  it("lista fechada não recebe pedidos", async () => {
    const { manu, edition } = await setup();
    await setEditionStatus(edition.id, "closed");
    await expect(submitRequest("001", guest(manu.participation.code, "d"))).rejects.toMatchObject({ status: 409, message: "A lista fechou." });
    expect(await publicEdition("001", manu.participation.code)).toMatchObject({ canRequest: false, reason: "A lista fechou." });
  });

  it("Insider desativado perde o link na hora", async () => {
    const { manu } = await setup();
    await setInsiderActive(manu.insider.id, false);
    expect((await publicEdition("001", manu.participation.code)).insider).toBeNull();
    await expect(submitRequest("001", guest(manu.participation.code, "e"))).rejects.toMatchObject({ status: 404 });
    expect(await insiderForUser({ id: manu.insider.userId, email: manu.insider.email })).toBeNull();
  });
});

describe("liberar, recusar e remover", () => {
  it("liberar emite o ingresso gratuito e mostra o endereço e o QR só para quem está na lista", async () => {
    const { manu, actor, edition } = await setup();
    const pending = await request(manu.participation.code, "f");
    expect(await guestView(pending.token)).toMatchObject({ status: "pending", venue: null, address: null, ticket: null });

    const { request: approved, notice } = await decideRequest(actor, pending.id, "approve");
    expect(approved).toMatchObject({ status: "approved", decidedBy: `insider:${manu.insider.email}` });
    expect(notice).toMatchObject({ insiderName: "Manu Silva", event: { venue: "Casa da Bia" } });

    const ticket = await getLiveRepository().getTicket(approved.ticketId ?? "");
    expect(ticket).toMatchObject({ source: "invite", status: "valid", price: 0, eventId: edition.eventId, batchName: "Lista · Manu Silva" });

    const view = await guestView(pending.token);
    expect(view).toMatchObject({ status: "approved", venue: "Casa da Bia", address: "Rua A, 1" });
    expect(view.ticket?.qr).toBe(`PRX_LIVE::${ticket?.code}::${edition.eventId}`);
  });

  it("recusar vira 'ainda não' e dá para liberar depois", async () => {
    const { manu, actor } = await setup();
    const pending = await request(manu.participation.code, "g");
    expect((await decideRequest(actor, pending.id, "reject")).request.status).toBe("rejected");
    expect(await guestView(pending.token)).toMatchObject({ status: "rejected", ticket: null, venue: null });
    await expect(decideRequest(actor, pending.id, "reject")).rejects.toMatchObject({ status: 409 });
    expect((await decideRequest(actor, pending.id, "approve")).request.status).toBe("approved");
  });

  it("a cota (PASS) acaba; remover devolve o PASS e o admin passa da cota", async () => {
    const { manu, actor } = await setup({ quota: 1 });
    const [a, b, c] = [await request(manu.participation.code, "h1"), await request(manu.participation.code, "h2"), await request(manu.participation.code, "h3")];
    await decideRequest(actor, a.id, "approve");
    await expect(decideRequest(actor, b.id, "approve")).rejects.toMatchObject({ status: 409, message: expect.stringContaining("PASSes acabaram") });

    await decideRequest(actor, a.id, "revoke");
    expect((await decideRequest(actor, b.id, "approve")).request.status).toBe("approved");
    expect((await decideRequest({ kind: "admin", label: "admin:admin@prx.dev" }, c.id, "approve")).request.status).toBe("approved");
  });

  it("dois cliques simultâneos no último PASS liberam só um", async () => {
    const { manu, actor, edition } = await setup({ quota: 1 });
    const [a, b] = [await request(manu.participation.code, "i1"), await request(manu.participation.code, "i2")];
    const results = await Promise.allSettled([decideRequest(actor, a.id, "approve"), decideRequest(actor, b.id, "approve")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const approved = (await getResenhaRepository().listRequests({ editionInsiderId: manu.participation.id })).filter((r) => r.status === "approved");
    expect(approved).toHaveLength(1);
    const tickets = await getLiveRepository().listTickets({ eventId: edition.eventId });
    expect(tickets.filter((t) => t.status === "valid")).toHaveLength(1);
  });

  it("a lotação do evento vale mais que a cota", async () => {
    const { manu, actor } = await setup({ quota: 5, capacity: 1 });
    const [a, b] = [await request(manu.participation.code, "j1"), await request(manu.participation.code, "j2")];
    await decideRequest(actor, a.id, "approve");
    await expect(decideRequest(actor, b.id, "approve")).rejects.toMatchObject({ status: 409, message: "Evento lotado." });
    expect((await getResenhaRepository().getRequest(b.id))?.status).toBe("pending");
  });

  it("remover cancela o ingresso, mas não quem já entrou na festa", async () => {
    const { manu, actor } = await setup();
    const [a, b] = [await request(manu.participation.code, "k1"), await request(manu.participation.code, "k2")];
    const approvedA = (await decideRequest(actor, a.id, "approve")).request;
    const approvedB = (await decideRequest(actor, b.id, "approve")).request;

    await decideRequest(actor, a.id, "revoke");
    expect((await getLiveRepository().getTicket(approvedA.ticketId ?? ""))?.status).toBe("cancelled");
    expect(await guestView(a.token)).toMatchObject({ status: "revoked", ticket: null, venue: null });

    await getLiveRepository().updateTicket(approvedB.ticketId ?? "", { status: "used", checkedInAt: new Date().toISOString(), checkedInBy: "staff" }, ["valid"]);
    await expect(decideRequest(actor, b.id, "revoke")).rejects.toMatchObject({ status: 409, message: "Esta pessoa já entrou na festa." });
    const seen = await insiderRequests(manu.insider, manu.participation.id);
    expect(seen.find((r) => r.id === b.id)).toMatchObject({ status: "approved", checkedIn: true });
    expect(seen.find((r) => r.id === a.id)).toMatchObject({ status: "revoked", checkedIn: false });
    expect(await guestView(b.token)).toMatchObject({ status: "approved", ticket: { used: true } });
  });

  it("evento cancelado pela equipe: o convidado vê o aviso e nada de endereço ou QR", async () => {
    const { manu, actor, edition } = await setup();
    const [listed, waiting] = [await request(manu.participation.code, "o"), await request(manu.participation.code, "p")];
    await decideRequest(actor, listed.id, "approve");
    await getLiveRepository().updateEvent(edition.eventId, { status: "cancelled" });
    expect(await guestView(listed.token)).toMatchObject({ cancelled: true, venue: null, address: null, ticket: null });
    await expect(decideRequest(actor, waiting.id, "approve")).rejects.toMatchObject({ status: 409 });
    await expect(submitRequest("001", guest(manu.participation.code, "q"))).rejects.toMatchObject({ status: 409, message: "Esta Resenha foi cancelada." });
  });

  it("ingresso cancelado pelo admin tira a pessoa da lista", async () => {
    const { manu, actor } = await setup();
    const pending = await request(manu.participation.code, "l");
    const approved = (await decideRequest(actor, pending.id, "approve")).request;
    await getLiveRepository().updateTicket(approved.ticketId ?? "", { status: "cancelled", cancelledAt: new Date().toISOString() }, ["valid"]);
    expect(await guestView(pending.token)).toMatchObject({ status: "revoked", ticket: null });
  });
});

describe("isolamento entre Insiders", () => {
  it("cada Insider só enxerga e decide o que chegou pelo próprio link", async () => {
    const { manu, actor, edition } = await setup();
    const gabs = await addInsider(edition.id, { mode: "create", name: "Gabs Lima", email: `gabs${uniq()}@exemplo.com`, handle: "", kind: "guest", quota: 3 });
    const gabsActor: Actor = { kind: "insider", insider: gabs.insider };
    const forManu = await request(manu.participation.code, "m");

    await expect(decideRequest(gabsActor, forManu.id, "approve")).rejects.toMatchObject({ status: 404 });
    await expect(insiderRequests(gabs.insider, manu.participation.id)).rejects.toMatchObject({ status: 404 });
    expect(await insiderRequests(gabs.insider, gabs.participation.id)).toHaveLength(0);
    expect(await insiderRequests(manu.insider, manu.participation.id)).toHaveLength(1);

    const views = await insiderEditions(gabs.insider, "https://prx.app.br");
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({ kind: "guest", stats: { quota: 3, left: 3, pending: 0 }, link: `https://prx.app.br/resenha/001?i=${gabs.participation.code}` });
    expect((await decideRequest(actor, forManu.id, "approve")).request.status).toBe("approved");
  });

  it("o admin não baixa a cota abaixo do que já foi liberado", async () => {
    const { manu, actor } = await setup({ quota: 3 });
    for (const n of ["n1", "n2"]) await decideRequest(actor, (await request(manu.participation.code, n)).id, "approve");
    await expect(updateParticipation(manu.participation.id, { quota: 1 })).rejects.toMatchObject({ status: 409 });
    expect((await updateParticipation(manu.participation.id, { quota: 2 })).quota).toBe(2);
  });

  it("mudar um campo da participação não apaga os outros", async () => {
    const { manu } = await setup({ quota: 4 });
    const paused = await updateParticipation(manu.participation.id, { active: false });
    expect(paused).toMatchObject({ active: false, quota: 4, kind: "insider" });
    expect(await updateParticipation(manu.participation.id, { kind: "guest" })).toMatchObject({ active: false, quota: 4, kind: "guest" });
  });

  it("edição em rascunho não aparece no portal do Insider", async () => {
    const { manu } = await setup({ status: "draft" });
    expect(await insiderEditions(manu.insider, "https://prx.app.br")).toHaveLength(0);
  });
});
