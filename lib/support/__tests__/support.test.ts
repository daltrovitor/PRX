// Hello World
import { beforeEach, describe, expect, it } from "vitest";
import { resetSupportMemory } from "@/lib/support/repository";
import { TEAM_LABEL, adminAct, adminTickets, memberReply, memberResolve, memberTickets, openTicket } from "@/lib/support/service";
import { makeProtocol, newTicketSchema } from "@/lib/support/types";
import { createPartnerLead, listPartnerLeads, updatePartnerLead } from "@/lib/partner-leads/repository";
import { partnerLeadSchema } from "@/lib/partner-leads/types";

const ana = { id: "u-ana", name: "Ana Souza", email: "ana@prx.dev" };
const bia = { id: "u-bia", name: "Bia Lima", email: "bia@prx.dev" };
const admin = { name: "Vitor", email: "vitor@prx.dev" };
const ticket = { topic: "pass" as const, subject: "Voucher não abre", message: "O QR Code do voucher não abre no balcão." };

beforeEach(() => resetSupportMemory());

describe("SAC", () => {
  it("protocolo no formato PRX-AAAAMMDD-XXXXXX com a data de Brasília", () => {
    expect(makeProtocol(new Date("2026-10-18T02:00:00Z"), () => 0)).toBe("PRX-20261017-222222");
    expect(newTicketSchema.safeParse({ ...ticket, message: "curta" }).success).toBe(false);
  });

  it("membro abre, equipe responde (assinada como Equipe PRX), membro reabre e encerra", async () => {
    const opened = await openTicket(ana, ticket);
    expect(opened.protocol).toMatch(/^PRX-\d{8}-[2-9A-Z]{6}$/);
    expect(opened.status).toBe("open");
    expect(opened.messages).toHaveLength(1);

    const answered = await adminAct(admin, { id: opened.id, reply: "Gere um novo voucher que já liberamos." });
    expect(answered.status).toBe("answered");
    expect(answered.messages[1]).toMatchObject({ author: "team", authorName: "Vitor" });

    const [mine] = await memberTickets(ana);
    expect(mine.messages[1].authorName).toBe(TEAM_LABEL);

    expect((await memberReply(ana, opened.id, "Funcionou, mas o desconto veio menor.")).status).toBe("open");
    const done = await memberResolve(ana, opened.id);
    expect(done.status).toBe("resolved");
    expect(done.resolvedAt).not.toBeNull();
  });

  it("ninguém vê nem mexe na solicitação de outra pessoa", async () => {
    const opened = await openTicket(ana, ticket);
    expect(await memberTickets(bia)).toEqual([]);
    await expect(memberReply(bia, opened.id, "Mensagem de outra pessoa aqui.")).rejects.toThrow("não encontrada");
    await expect(memberResolve(bia, opened.id)).rejects.toThrow("não encontrada");
  });

  it("limita a 5 solicitações em aberto e filtra a fila do admin por status", async () => {
    for (let i = 0; i < 5; i++) await openTicket(ana, ticket);
    await expect(openTicket(ana, ticket)).rejects.toThrow("5 solicitações");
    const { items, total } = await adminTickets({ status: "open", page: 0 });
    expect(total).toBe(5);
    await adminAct(admin, { id: items[0].id, status: "resolved" });
    expect((await adminTickets({ status: "open", page: 0 })).total).toBe(4);
    await expect(adminAct(admin, { id: items[1].id })).rejects.toThrow("resposta ou escolha");
  });
});

describe("Seja um parceiro", () => {
  const lead = {
    businessName: "Juistreet",
    document: "",
    categoryId: "gastronomia",
    city: "Goiânia",
    contactName: "Ana Souza",
    relation: "dono",
    email: "ANA@juistreet.com",
    phone: "(62) 99999-0000",
    link: "@juistreet",
    offer: "Suco grátis na primeira visita.",
    consent: true,
  };

  it("valida o pedido e normaliza e-mail e telefone", () => {
    const parsed = partnerLeadSchema.parse(lead);
    expect(parsed).toMatchObject({ email: "ana@juistreet.com", phone: "62999990000" });
    expect(partnerLeadSchema.safeParse({ ...lead, consent: false }).success).toBe(false);
    expect(partnerLeadSchema.safeParse({ ...lead, document: "11.111.111/1111-11" }).success).toBe(false);
    expect(partnerLeadSchema.safeParse({ ...lead, categoryId: "inexistente" }).success).toBe(false);
  });

  it("vira lead novo com aceite registrado e anda no funil", async () => {
    const created = await createPartnerLead(partnerLeadSchema.parse(lead), ana.id);
    expect(created).toMatchObject({ status: "new", submittedBy: ana.id });
    expect(created.consentAt).not.toBe("");
    const updated = await updatePartnerLead(created.id, { status: "contacted", note: "Ligar segunda." });
    expect(updated).toMatchObject({ status: "contacted", note: "Ligar segunda." });
    expect((await listPartnerLeads("contacted")).some((l) => l.id === created.id)).toBe(true);
  });
});
