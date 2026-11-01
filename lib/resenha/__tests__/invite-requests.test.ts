// Hello World
import { beforeEach, describe, expect, it } from "vitest";
import { userStore } from "@/lib/auth";
import { rememberBirthDate } from "@/lib/live/buyer";
import { reserveTicket } from "@/lib/live/service";
import { memberCodeOf } from "@/lib/members/member-code";
import { resetPushMemory } from "@/lib/push/repository";
import { addInsider, createEdition, createInsider, decideInsiderSignup, resetInsiderPassword, setEditionStatus, updateInsiderProfile } from "@/lib/resenha/admin";
import { verifyAccountPassword } from "@/lib/partners/access";
import { PASSWORD_WORDS, generateInsiderPassword } from "@/lib/resenha/password";
import { cancelInvite, insiderInvites, inviteMember, memberResenhas } from "@/lib/resenha/invites";
import { resetInvitesMemory } from "@/lib/resenha/invites-repository";
import { decideInviteRequest, insiderInviteRequests, memberResenhaCatalog, requestInvite } from "@/lib/resenha/invite-requests";
import { resetInviteRequestsMemory } from "@/lib/resenha/invite-requests-repository";
import { getResenhaRepository, resetResenhaMemory } from "@/lib/resenha/repository";
import { insiderProfileSchema } from "@/lib/resenha/types";
import { insiderForUser } from "@/lib/resenha/access";
import { insiderDenial, INSIDER_PENDING, INSIDER_REJECTED } from "@/lib/resenha/session";
import { insiderSignupSchema, signupInsider } from "@/lib/resenha/signup";

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

describe("cadastro de Insiders no admin", () => {
  it("senha individual: palavras fáceis, sem repetir, e cada Insider tem a sua", () => {
    const first = generateInsiderPassword();
    expect(first).toMatch(/^([A-Z][a-z]+-){4}\d{2}$/);
    expect(new Set(first.split("-").slice(0, 4)).size).toBe(4);
    expect(new Set(Array.from({ length: 50 }, () => generateInsiderPassword())).size).toBe(50);
    expect(new Set(PASSWORD_WORDS).size).toBe(PASSWORD_WORDS.length);
    expect(PASSWORD_WORDS.every((w) => /^[A-Za-z]+$/.test(w))).toBe(true);
  });

  it("cadastra com foto e @, aparece no catálogo e a senha gerada entra no login", async () => {
    const photo = "https://exemplo.com/manu.webp";
    const profile = insiderProfileSchema.parse({ name: "Ana Foto", handle: "@AnaFoto", avatarUrl: photo });
    const created = await createInsider({ ...profile, mode: "create", email: `ana${uniq()}@exemplo.com` });
    expect(created.insider).toMatchObject({ name: "Ana Foto", handle: "anafoto", avatarUrl: photo });
    expect(created.temporaryPassword).toMatch(/^([A-Z][a-z]+-){4}\d{2}$/);
    expect(await verifyAccountPassword(created.insider.email, created.temporaryPassword!)).toBe(true);

    const edition = await createEdition({ hostName: "Bia", hostArticle: "da", startsAt: PARTY, endsAt: null, venue: "Casa", city: "Goiânia, GO", address: "Rua A, 1", capacity: null, ...POLICY }, "admin@prx.dev");
    await setEditionStatus(edition.id, "open");
    await addInsider(edition.id, { mode: "create", name: "Ana Foto", email: created.insider.email, handle: "", kind: "insider", quota: 3 });
    const guest = await member("Hugo Catalogo");
    const [entry] = (await memberResenhaCatalog(guest.user.id)).entries;
    expect(entry.insiders[0]).toMatchObject({ name: "Ana Foto", handle: "anafoto", avatarUrl: photo });
  });

  it("editar muda foto, nome e @; nova senha troca o login", async () => {
    const created = await createInsider({ mode: "create", email: `bia${uniq()}@exemplo.com`, name: "Bia Antiga", handle: "", avatarUrl: "" });
    const updated = await updateInsiderProfile(created.insider.id, { name: "Bia Nova", handle: "bianova", avatarUrl: "https://exemplo.com/bia.webp" });
    expect(updated).toMatchObject({ name: "Bia Nova", handle: "bianova", avatarUrl: "https://exemplo.com/bia.webp" });

    const reset = await resetInsiderPassword(created.insider.id);
    expect(reset.temporaryPassword).not.toBe(created.temporaryPassword);
    expect(await verifyAccountPassword(created.insider.email, created.temporaryPassword!)).toBe(false);
    expect(await verifyAccountPassword(created.insider.email, reset.temporaryPassword)).toBe(true);
    await expect(createInsider({ mode: "create", email: created.insider.email, name: "Outra", handle: "", avatarUrl: "" })).rejects.toMatchObject({ status: 409 });
  });
});

describe("auto-cadastro do Insider no portal", () => {
  const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const signup = (over: Record<string, unknown> = {}) => insiderSignupSchema.parse({ name: "Caio Novo", handle: "@@CaioNovo", email: `caio${uniq()}@exemplo.com`, password: "Senha#2026x", photo: PIXEL, ...over });

  it("@ digitado a mais é ignorado e a foto vai para o perfil da conta", async () => {
    const input = signup();
    expect(input.handle).toBe("caionovo");
    expect(insiderSignupSchema.parse({ ...input, handle: "caio@novo" }).handle).toBe("caionovo");
    const { insider } = await signupInsider(input);
    expect(insider).toMatchObject({ status: "pending", active: false, handle: "caionovo" });
    expect(insider.avatarUrl).toMatch(/^data:image\/webp;base64,/);
    expect(userStore.findByEmail(input.email)?.avatarUrl).toBe(insider.avatarUrl);
  });

  it("fica sem acesso até o admin aprovar; a mesma conta vale como membro", async () => {
    const input = signup();
    const { insider } = await signupInsider(input);
    const user = userStore.findByEmail(input.email)!;
    expect(await verifyAccountPassword(input.email, input.password)).toBe(true);
    expect(await insiderForUser(user)).toBeNull();
    expect(await insiderDenial(user)).toBe(INSIDER_PENDING);
    await expect(signupInsider(input)).rejects.toMatchObject({ status: 409 });

    await decideInsiderSignup(insider.id, "approve");
    expect(await insiderForUser(user)).toMatchObject({ name: "Caio Novo", status: "approved" });
    await expect(decideInsiderSignup(insider.id, "approve")).rejects.toMatchObject({ status: 409 });
  });

  it("recusado continua fora e o admin ainda pode aprovar depois", async () => {
    const input = signup({ photo: "" });
    const { insider } = await signupInsider(input);
    await decideInsiderSignup(insider.id, "reject");
    const user = userStore.findByEmail(input.email)!;
    expect(await insiderForUser(user)).toBeNull();
    expect(await insiderDenial(user)).toBe(INSIDER_REJECTED);
    await decideInsiderSignup(insider.id, "approve");
    expect(await insiderForUser(user)).not.toBeNull();
  });

  it("conta PRX existente exige a senha dela; senha fraca não cria conta", async () => {
    const existing = await member("Dani Conta");
    await expect(signupInsider(signup({ email: existing.user.email, password: "errada" }))).rejects.toMatchObject({ status: 401 });
    const { insider, existingAccount } = await signupInsider(signup({ email: existing.user.email, password: "Senha#2026x" }));
    expect(existingAccount).toBe(true);
    expect(insider.userId).toBe(existing.user.id);

    const weak = signup({ password: "abc" });
    await expect(signupInsider(weak)).rejects.toMatchObject({ status: 422 });
    expect(userStore.findByEmail(weak.email)).toBeUndefined();
  });

  it("pendente não aparece no catálogo e não pode ser reativado sem aprovação", async () => {
    const { insider } = await signupInsider(signup());
    await expect(import("@/lib/resenha/admin").then((m) => m.setInsiderActive(insider.id, true))).rejects.toMatchObject({ status: 409 });
  });
});
