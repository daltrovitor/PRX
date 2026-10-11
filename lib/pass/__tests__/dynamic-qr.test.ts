// Hello World
import { beforeEach, describe, expect, it } from "vitest";
import { PASS_QR_PERIOD_S, issuePassQr, parsePassInput, verifyPassInput } from "@/lib/pass/dynamic-qr";
import { passStore } from "@/lib/pass-store";
import { validateCode } from "@/lib/validation";
import type { Validator } from "@/lib/validation/actor";
import { listValidations } from "@/lib/validation/log";

/** QR dinâmico do PRX PASS: dados sintéticos, modo memória. */

const V = { id: "vch_test_1", code: "PRX-TEST-0001", userId: "usr_test_1" };
const T0 = Date.UTC(2026, 9, 11, 12, 0, 30);
const minutes = (n: number) => n * 60_000;

describe("token do momento", () => {
  it("vale na janela atual e na vizinha (tolerância de relógio)", () => {
    const token = issuePassQr(V, T0);
    expect(token.payload).toMatch(/^PRX_PASS2::PRX-TEST-0001::\d+::[A-Za-z0-9_-]{16}$/);
    expect(token.period).toBe(PASS_QR_PERIOD_S);
    expect(verifyPassInput(parsePassInput(token.payload), V, T0)).toBe("ok");
    expect(verifyPassInput(parsePassInput(token.payload), V, T0 + minutes(1))).toBe("ok");
  });

  it("print antigo expira em poucos minutos", () => {
    const token = issuePassQr(V, T0);
    expect(verifyPassInput(parsePassInput(token.payload), V, T0 + minutes(3))).toBe("expired");
    expect(verifyPassInput(parsePassInput(`PRX-TEST-0001 ${token.momentCode}`), V, T0 + minutes(3))).toBe("expired");
  });

  it("assinatura adulterada, outro titular ou outro voucher não passam", () => {
    const token = issuePassQr(V, T0);
    const [prefix, code, step, sig] = token.payload.split("::");
    const forged = `${prefix}::${code}::${step}::${sig.slice(0, -1)}${sig.endsWith("A") ? "B" : "A"}`;
    expect(verifyPassInput(parsePassInput(forged), V, T0)).toBe("invalid");
    expect(verifyPassInput(parsePassInput(token.payload), { ...V, userId: "outra_pessoa" }, T0)).toBe("invalid");
    expect(verifyPassInput(parsePassInput(token.payload), { ...V, code: "PRX-TEST-0002" }, T0)).toBe("invalid");
    // Janela no futuro além da tolerância.
    const future = issuePassQr(V, T0 + minutes(5));
    expect(verifyPassInput(parsePassInput(future.payload), V, T0)).toBe("invalid");
  });

  it("código do voucher + 6 dígitos funciona quando a câmera falha", () => {
    const token = issuePassQr(V, T0);
    expect(token.momentCode).toMatch(/^\d{6}$/);
    expect(verifyPassInput(parsePassInput(`prx-test-0001 ${token.momentCode}`), V, T0)).toBe("ok");
    expect(verifyPassInput(parsePassInput(`PRX-TEST-0001-${token.momentCode}`), V, T0)).toBe("ok");
    const wrong = String((Number(token.momentCode) + 1) % 1_000_000).padStart(6, "0");
    expect(verifyPassInput(parsePassInput(`PRX-TEST-0001 ${wrong}`), V, T0)).toBe("invalid");
  });

  it("código ou QR antigos (estáticos) não trazem prova", () => {
    expect(verifyPassInput(parsePassInput("PRX-TEST-0001"), V, T0)).toBe("missing");
    expect(verifyPassInput(parsePassInput("PRX_PASS::PRX-TEST-0001::Cafe"), V, T0)).toBe("missing");
  });
});

describe("baixa no balcão", () => {
  const staff: Validator = { role: "staff", userId: "stf_pass", name: "Balcão Teste", canValidateTickets: false, canValidateBenefits: true };
  let code = "";
  let seq = 0;

  beforeEach(() => {
    (globalThis as { __prxValidationLog?: unknown[] }).__prxValidationLog?.splice(0);
    seq += 1;
    code = `PRX-T${String(seq).padStart(3, "0")}-0001`;
    passStore.createVoucher({
      code,
      benefitId: "ben_test",
      benefitTitle: "Benefício de teste",
      partnerId: "",
      partnerName: "Parceiro de teste",
      discountLabel: "10% OFF",
      status: "valid",
      qrPayload: `PRX_PASS::${code}::Teste`,
      redeemedAt: "11/10 12:00",
      terms: "Teste",
      expiresAt: null,
      userEmail: "titular@exemplo.com",
      userName: "Titular Teste",
      userId: "usr_titular",
    });
  });

  const voucherOf = () => passStore.getVouchers().find((v) => v.code === code)!;

  it("código estático só consulta; baixa exige o QR do momento", async () => {
    const lookup = await validateCode(staff, code, "lookup");
    expect(lookup).toMatchObject({ ok: true, kind: "voucher", canRedeem: false });
    const refused = await validateCode(staff, code, "confirm");
    expect(refused).toMatchObject({ ok: false, error: expect.stringContaining("prova do momento") });
    expect(voucherOf().status).toBe("valid");
  });

  it("QR dinâmico dá baixa uma única vez", async () => {
    const v = voucherOf();
    const token = issuePassQr({ id: v.id, code: v.code, userId: v.userId });
    await expect(validateCode(staff, token.payload, "lookup")).resolves.toMatchObject({ ok: true, canRedeem: true });
    await expect(validateCode(staff, token.payload, "confirm")).resolves.toMatchObject({ ok: true, voucher: { status: "used" } });
    await expect(validateCode(staff, token.payload, "confirm")).resolves.toMatchObject({ ok: false, error: expect.stringContaining("já foi utilizado") });
    const log = await listValidations({ page: 1, pageSize: 20, kind: "voucher" });
    expect(log.entries.map((e) => e.outcome)).toEqual(["refused", "accepted"]);
  });

  it("operador sem permissão de benefícios é recusado e fica registrado", async () => {
    const doorOnly: Validator = { role: "staff", userId: "stf_door", name: "Portaria", canValidateTickets: true, canValidateBenefits: false };
    await expect(validateCode(doorOnly, code, "lookup")).rejects.toMatchObject({ status: 403 });
    expect((await listValidations({ page: 1, pageSize: 20, outcome: "refused" })).total).toBe(1);
  });
});
