// Hello World
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyGeneralApproval, openSubaccount } from "@/lib/bank/asaas/onboarding";
import { executeOutgoing, maskDocument, prepareBill, preparePix } from "@/lib/bank/asaas/cash-out";
import { assertNightLimit, nightWindowStart } from "@/lib/bank/asaas/limits";
import { validateWithdraw } from "@/lib/bank/asaas/withdraw-validation";
import { handleAsaasEvent } from "@/lib/bank/asaas/webhooks";
import { asaasPixKey } from "@/lib/asaas/transfers";
import { ASAAS_TEST_ENV, USER_ID, fakeAsaas, testDeps } from "./asaas-fakes";

const CREATED = { id: "acc_out", walletId: "wal_out", apiKey: "$aact_hmlg_out", accountNumber: null };
const noWait = async () => undefined;

beforeEach(() => {
  for (const [key, value] of Object.entries(ASAAS_TEST_ENV)) vi.stubEnv(key, value);
});
afterEach(() => vi.unstubAllEnvs());

async function activeAccount(routes: Parameters<typeof fakeAsaas>[0], balance = 1000) {
  const fake = fakeAsaas({ "POST /accounts": { body: CREATED }, "GET /finance/balance": { body: { balance } }, ...routes });
  const ctx = testDeps(fake.client);
  await openSubaccount(USER_ID, ctx.deps);
  await applyGeneralApproval((await ctx.store.getSubaccount(USER_ID))!, "APPROVED", null, ctx.deps);
  return { ...ctx, calls: fake.calls };
}

describe("limite noturno de Pix", () => {
  it("período noturno vai das 20h às 6h de Brasília", () => {
    expect(nightWindowStart(new Date("2026-10-02T00:30:00Z"))).toBe("2026-10-01T23:00:00.000Z"); // 21h30 BRT
    expect(nightWindowStart(new Date("2026-10-02T07:00:00Z"))).toBe("2026-10-01T23:00:00.000Z"); // 4h BRT
    expect(nightWindowStart(new Date("2026-10-01T23:00:00Z"))).toBe("2026-10-01T23:00:00.000Z"); // 20h BRT
    expect(nightWindowStart(new Date("2026-10-01T15:00:00Z"))).toBeNull(); // 12h BRT
    expect(nightWindowStart(new Date("2026-10-02T09:00:00Z"))).toBeNull(); // 6h BRT
  });

  it("soma o que já saiu na noite", async () => {
    const night = new Date("2026-10-02T01:00:00Z");
    await expect(assertNightLimit(200, night, async () => 900)).rejects.toMatchObject({ status: 403 });
    await expect(assertNightLimit(100, night, async () => 900)).resolves.toBeUndefined();
    await expect(assertNightLimit(5000, new Date("2026-10-01T15:00:00Z"), async () => 0)).resolves.toBeUndefined();
  });
});

describe("preparo de Pix e contas", () => {
  it("formata a chave como o Asaas pede", () => {
    expect(asaasPixKey("529.982.247-25", "cpf")).toEqual({ pixAddressKey: "52998224725", pixAddressKeyType: "CPF" });
    expect(asaasPixKey("+55 (11) 98765-4321", "phone")).toEqual({ pixAddressKey: "11987654321", pixAddressKeyType: "PHONE" });
    expect(asaasPixKey("Ana@PRX.dev", "email")).toEqual({ pixAddressKey: "ana@prx.dev", pixAddressKeyType: "EMAIL" });
    expect(maskDocument("52998224725")).toBe("***.982.247-**");
    expect(maskDocument("04252011000110")).toBe("**.252.011/0001-**");
  });

  it("recusa sem saldo e registra o pedido aguardando confirmação", async () => {
    const poor = await activeAccount({}, 50);
    await expect(preparePix(USER_ID, { method: "key", key: "ana@prx.dev", amount: 100, description: "" }, poor.deps, [])).rejects.toMatchObject({ status: 409 });

    const { deps, store } = await activeAccount({});
    const prepared = await preparePix(USER_ID, { method: "key", key: "ana@prx.dev", amount: 100, description: "Almoço" }, deps, []);
    expect(prepared).toMatchObject({ kind: "pix_key", amount: 100, recipient: "E-mail ana@prx.dev" });
    expect((await store.getOutgoing(prepared.requestId))?.status).toBe("awaiting_confirmation");
  });

  it("QR Code com valor fixo ignora o valor digitado e mostra recebedor e instituição", async () => {
    const decoded = { payload: "000201...", value: 30, totalValue: 30, canBePaidWithDifferentValue: false, receiver: { name: "Padaria Sol", ispbName: "Banco X", cpfCnpj: "04252011000110" } };
    const { deps, calls } = await activeAccount({ "POST /pix/qrCodes/decode": { body: decoded } });
    const prepared = await preparePix(USER_ID, { method: "qr", payload: "00020126580014br.gov.bcb.pix", amount: 999, description: "" }, deps, []);
    expect(prepared).toMatchObject({ kind: "pix_qr", amount: 30, recipient: "Padaria Sol", institution: "Banco X", document: "**.252.011/0001-**" });
    expect(calls.find((c) => c.path === "/pix/qrCodes/decode")?.apiKey).toBe(CREATED.apiKey);
  });

  it("conta: valor do boleto e tarifa entram na conferência do saldo", async () => {
    const simulation = { fee: 2, bankSlipInfo: { value: 99, dueDate: "2026-10-10", companyName: "Energia SA", bank: "Banco Y" } };
    const tight = await activeAccount({ "POST /bill/simulate": { body: simulation } }, 100);
    await expect(prepareBill(USER_ID, { identificationField: "8".repeat(48), description: "" }, tight.deps, [])).rejects.toMatchObject({ status: 409 });
    const ok = await activeAccount({ "POST /bill/simulate": { body: simulation } }, 200);
    await expect(prepareBill(USER_ID, { identificationField: "8".repeat(48), description: "" }, ok.deps, [])).resolves.toMatchObject({ kind: "bill", amount: 99, fee: 2, recipient: "Energia SA", dueDate: "2026-10-10" });
  });
});

describe("execução e validação de saque", () => {
  it("Pix por chave sai uma vez só, com externalReference = id do pedido", async () => {
    const { deps, store, calls } = await activeAccount({ "POST /transfers": { body: { id: "tra_1", status: "PENDING", value: 100 } } });
    const prepared = await preparePix(USER_ID, { method: "key", key: "(11) 98765-4321", amount: 100, description: "" }, deps, []);
    // Celular digitado sem +55 é lido como CPF inválido → telefone; o Asaas recebe 11 dígitos.
    const done = await executeOutgoing(USER_ID, prepared.requestId, deps, []);
    expect(done).toMatchObject({ status: "requested", providerRef: "tra_1" });
    expect(calls.find((c) => c.path === "/transfers")?.body).toMatchObject({ value: 100, pixAddressKey: "11987654321", pixAddressKeyType: "PHONE", externalReference: prepared.requestId });
    await expect(executeOutgoing(USER_ID, prepared.requestId, deps, [])).rejects.toMatchObject({ status: 409 });
    expect(calls.filter((c) => c.path === "/transfers")).toHaveLength(1);
    expect((await store.getOutgoing(prepared.requestId))?.providerRef).toBe("tra_1");
  });

  it("pedido vencido não é executado", async () => {
    const { deps, store, calls } = await activeAccount({ "POST /transfers": { body: { id: "tra_x", status: "PENDING", value: 10 } } });
    const prepared = await preparePix(USER_ID, { method: "key", key: "ana@prx.dev", amount: 10, description: "" }, deps, []);
    const later = { ...deps, now: () => new Date(Date.now() + 11 * 60_000) };
    await expect(executeOutgoing(USER_ID, prepared.requestId, later, [])).rejects.toMatchObject({ status: 409 });
    expect((await store.getOutgoing(prepared.requestId))?.status).toBe("expired");
    expect(calls.some((c) => c.path === "/transfers")).toBe(false);
  });

  it("recusa do Asaas falha o pedido; resultado incerto mantém o pedido em aberto", async () => {
    const refused = await activeAccount({ "POST /transfers": { status: 400, body: { errors: [{ code: "x", description: "Chave não encontrada." }] } } });
    const a = await preparePix(USER_ID, { method: "key", key: "ana@prx.dev", amount: 10, description: "" }, refused.deps, []);
    await expect(executeOutgoing(USER_ID, a.requestId, refused.deps, [])).rejects.toMatchObject({ status: 422, message: "Não encontramos essa chave Pix. Confira e tente de novo." });
    expect((await refused.store.getOutgoing(a.requestId))?.status).toBe("failed");

    const unsure = await activeAccount({ "POST /transfers": { status: 504 } });
    const b = await preparePix(USER_ID, { method: "key", key: "ana@prx.dev", amount: 10, description: "" }, unsure.deps, []);
    // Resultado incerto: a pessoa confere o extrato antes de repetir (nunca paga duas vezes).
    await expect(executeOutgoing(USER_ID, b.requestId, unsure.deps, [])).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/Confira o extrato/) });
    expect((await unsure.store.getOutgoing(b.requestId))?.status).toBe("requested");
  });

  it("validação de saque aprova só o que o membro confirmou, com o mesmo valor", async () => {
    const { deps, store } = await activeAccount({ "POST /transfers": { body: { id: "tra_v", status: "PENDING", value: 40 } } });
    const prepared = await preparePix(USER_ID, { method: "key", key: "ana@prx.dev", amount: 40, description: "" }, deps, []);
    const transfer = { id: "tra_v", value: 40, externalReference: prepared.requestId };

    // Ainda não confirmado: recusa.
    await expect(validateWithdraw({ type: "TRANSFER", transfer }, deps, noWait)).resolves.toMatchObject({ status: "REFUSED" });
    await executeOutgoing(USER_ID, prepared.requestId, deps, []);
    await expect(validateWithdraw({ type: "TRANSFER", transfer: { ...transfer, value: 41 } }, deps, noWait)).resolves.toMatchObject({ status: "REFUSED" });
    await expect(validateWithdraw({ type: "BILL", bill: transfer }, deps, noWait)).resolves.toMatchObject({ status: "REFUSED" });
    await expect(validateWithdraw({ type: "TRANSFER", transfer }, deps, noWait)).resolves.toEqual({ status: "APPROVED" });
    await expect(validateWithdraw({ type: "TRANSFER", transfer }, deps, noWait)).resolves.toEqual({ status: "APPROVED" });
    expect((await store.getOutgoing(prepared.requestId))?.status).toBe("approved");

    await expect(validateWithdraw({ type: "TRANSFER", transfer: { id: "tra_desconhecida", value: 40 } }, deps, noWait)).resolves.toMatchObject({ status: "REFUSED" });
    await expect(validateWithdraw({ type: "MOBILE_PHONE_RECHARGE", mobilePhoneRecharge: { id: "r", value: 10 } }, deps, noWait)).resolves.toMatchObject({ status: "REFUSED" });
  });
});

describe("eventos de saída", () => {
  it("TRANSFER_DONE conclui o pedido, lança no extrato e avisa uma vez", async () => {
    const { deps, store, mirror } = await activeAccount({ "POST /transfers": { body: { id: "tra_d", status: "PENDING", value: 25 } } });
    const prepared = await preparePix(USER_ID, { method: "key", key: "ana@prx.dev", amount: 25, description: "Cinema" }, deps, []);
    await executeOutgoing(USER_ID, prepared.requestId, deps, []);
    const event = { id: "evt_done", event: "TRANSFER_DONE", account: { id: "acc_out" }, transfer: { id: "tra_d", value: 25, externalReference: prepared.requestId } };
    await handleAsaasEvent(event, deps);
    await handleAsaasEvent(event, deps);

    expect((await store.getOutgoing(prepared.requestId))?.status).toBe("done");
    expect(mirror.transactions).toEqual([expect.objectContaining({ kind: "pix_out", direction: "out", amount: 25, counterparty: "E-mail ana@prx.dev", description: "Cinema", providerRef: "tra_d" })]);
    const sent = (await store.listNotifications(USER_ID, 10)).filter((n) => n.eventType === "TRANSFER_DONE");
    expect(sent).toHaveLength(1);
    expect(sent[0].title).toMatch(/^Pix enviado com sucesso! R\$\s25,00 para E-mail ana@prx\.dev\.$/);
  });

  it("TRANSFER_FAILED marca falha e avisa o estorno; BILL_PAID lança a conta paga", async () => {
    const { deps, store, mirror } = await activeAccount({ "POST /transfers": { body: { id: "tra_f", status: "PENDING", value: 15 } } });
    const prepared = await preparePix(USER_ID, { method: "key", key: "ana@prx.dev", amount: 15, description: "" }, deps, []);
    await executeOutgoing(USER_ID, prepared.requestId, deps, []);
    await handleAsaasEvent({ id: "evt_f", event: "TRANSFER_FAILED", account: { id: "acc_out" }, transfer: { id: "tra_f", value: 15, failReason: "Conta destino encerrada" } }, deps);
    expect(await store.getOutgoing(prepared.requestId)).toMatchObject({ status: "failed", failReason: "Conta destino encerrada" });
    const failed = (await store.listNotifications(USER_ID, 10)).find((n) => n.eventType === "TRANSFER_FAILED");
    expect(`${failed?.title} ${failed?.body}`).toMatch(/Falha na transferência de R\$\s15,00\. O valor foi estornado ao seu saldo\./);

    await handleAsaasEvent({ id: "evt_bill", event: "BILL_PAID", account: { id: "acc_out" }, bill: { id: "bill_1", value: 80 } }, deps);
    expect(mirror.transactions[0]).toMatchObject({ kind: "bill", direction: "out", amount: 80, providerRef: "bill_1" });
    const paid = (await store.listNotifications(USER_ID, 10)).find((n) => n.eventType === "BILL_PAID");
    expect(`${paid?.title} ${paid?.body}`).toMatch(/Boleto pago com sucesso! Pagamento de R\$\s80,00 compensado\./);
  });
});
