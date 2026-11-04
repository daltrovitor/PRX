// Hello World
import { beforeEach, describe, expect, it } from "vitest";
import { LEGAL_SEEDS, MONEY_MAP_QUESTIONS, seedItem } from "@/lib/legal/checklist-data";
import { checklistMetrics, getLegalChecklist, legalPatchSchema, resetLegalChecklistMemory, updateLegalItem } from "@/lib/legal/checklist-store";
import { getWaitlistSignups, joinWaitlist } from "@/lib/waitlist";

beforeEach(() => resetLegalChecklistMemory());

describe("dados do checklist jurídico", () => {
  it("cobre o documento: matriz, frentes, 20 documentos e as 10 perguntas do Mapa do Dinheiro", () => {
    const by = (section: string) => LEGAL_SEEDS.filter((s) => s.section === section);
    expect(LEGAL_SEEDS.filter((s) => s.category.startsWith("1."))).toHaveLength(17);
    expect(by("documentos")).toHaveLength(20);
    expect(by("dinheiro").map((s) => s.title)).toEqual([...MONEY_MAP_QUESTIONS]);
    expect(MONEY_MAP_QUESTIONS).toHaveLength(10);
    expect(new Set(LEGAL_SEEDS.map((s) => s.id)).size).toBe(LEGAL_SEEDS.length);
    for (const s of LEGAL_SEEDS) expect(s.id).toMatch(/^[a-z0-9-]{2,60}$/);
  });

  it("começa pendente, com o enquadramento do BANK como bloqueador", async () => {
    const { items, metrics, persistence } = await getLegalChecklist();
    expect(persistence).toBe("memory");
    expect(items.find((i) => i.id === "f-bank-enquadramento")?.status).toBe("blocker");
    expect(metrics).toMatchObject({ total: LEGAL_SEEDS.length, done: 0, blockers: 1, percentDone: 0 });
    expect(items.find((i) => i.id === "m-bank")?.responsible).toBe("Preferencialmente parceiro BaaS autorizado pelo BCB");
  });
});

describe("andamento", () => {
  it("atualiza status, responsável e parecer, com autoria", async () => {
    const result = await updateLegalItem({ id: "m-coins", status: "done", responsible: "Dra. Ana (jurídico)", notes: "Pontos de fidelidade, sem conversão em reais." }, "admin@prx.dev");
    expect(result.item).toMatchObject({ status: "done", responsible: "Dra. Ana (jurídico)", updatedBy: "admin@prx.dev" });
    expect(result.metrics.done).toBe(1);
    const again = await getLegalChecklist();
    expect(again.items.find((i) => i.id === "m-coins")?.notes).toContain("fidelidade");
  });

  it("recusa item inexistente e patch vazio ou inválido", async () => {
    await expect(updateLegalItem({ id: "nao-existe", status: "done" }, "admin")).rejects.toThrow(/não encontrado/);
    expect(legalPatchSchema.safeParse({ id: "m-bank" }).success).toBe(false);
    expect(legalPatchSchema.safeParse({ id: "m-bank", status: "aprovado" }).success).toBe(false);
    expect(legalPatchSchema.safeParse({ id: "../x", status: "done" }).success).toBe(false);
  });

  it("calcula o percentual e as críticas em aberto", () => {
    const base = seedItem(LEGAL_SEEDS[0]);
    const items = [
      { ...base, priority: "CRITICA" as const, status: "done" as const },
      { ...base, priority: "CRITICA" as const, status: "pending" as const },
      { ...base, priority: "ALTA" as const, status: "blocker" as const },
      { ...base, priority: "MEDIA" as const, status: "in_review" as const },
    ];
    expect(checklistMetrics(items)).toEqual({ total: 4, done: 1, inReview: 1, pending: 1, blockers: 1, criticalOpen: 1, percentDone: 25 });
  });
});

describe("lista de espera no admin", () => {
  it("devolve os leads da memória, do mais recente, com origem e aceite", async () => {
    await joinWaitlist({ email: `a-${Date.now()}@exemplo.com`, name: "Ana", phone: "11912345678", age: 17, consent: true }, "em-breve");
    await new Promise((r) => setTimeout(r, 5));
    const latest = `b-${Date.now()}@exemplo.com`;
    await joinWaitlist({ email: latest, name: "Bia", phone: "1133334444", age: 25, consent: true }, "prx.app.br");
    const leads = await getWaitlistSignups();
    expect(leads[0]).toMatchObject({ email: latest, name: "Bia", phone: "1133334444", age: 25, source: "prx.app.br" });
    expect(leads[0].consentAt).toBe(leads[0].createdAt);
    expect(leads.some((l) => l.source === "em-breve" && l.name === "Ana" && l.phone === "11912345678" && l.age === 17)).toBe(true);
  });
});
