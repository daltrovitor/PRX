// Hello World
import { afterEach, describe, expect, it, vi } from "vitest";
import { LOCK_AFTER_MS, needsQuickLogin, shouldRelock } from "@/lib/lock";
import { bankAccountIsActive } from "@/lib/bank/lock";
import { getBankRepository, sandboxActivate } from "@/lib/bank/repository";

afterEach(() => vi.unstubAllEnvs());

type Gate = Parameters<typeof needsQuickLogin>[0];
const gate = (over: Partial<Gate> = {}): Gate => ({ hasKnownAccount: false, hasSession: false, requiresUnlock: false, unlocked: false, offering: false, ...over });

describe("bloqueio do app com a conta do banco ativa", () => {
  it("sem conta do banco ativa o app abre direto, mesmo com a conta lembrada neste aparelho", () => {
    expect(needsQuickLogin(gate({ hasKnownAccount: true, hasSession: true }))).toBe(false);
    expect(needsQuickLogin(gate({ hasSession: true }))).toBe(false);
  });

  it("com a conta do banco ativa pede senha ou biometria a cada entrada, até desbloquear", () => {
    expect(needsQuickLogin(gate({ hasSession: true, requiresUnlock: true }))).toBe(true);
    expect(needsQuickLogin(gate({ hasKnownAccount: true, hasSession: true, requiresUnlock: true }))).toBe(true);
    expect(needsQuickLogin(gate({ hasKnownAccount: true, hasSession: true, requiresUnlock: true, unlocked: true }))).toBe(false);
  });

  it("conta lembrada sem sessão é uma entrada: sempre a tela dedicada", () => {
    expect(needsQuickLogin(gate({ hasKnownAccount: true }))).toBe(true);
    expect(needsQuickLogin(gate())).toBe(false);
  });

  it("logo depois de entrar pela tela dedicada, ela fica até responder à oferta de biometria", () => {
    expect(needsQuickLogin(gate({ hasKnownAccount: true, hasSession: true, offering: true }))).toBe(true);
  });

  it("volta ao app: só pede de novo depois de 1 minuto fora e com a conta do banco ativa", () => {
    expect(shouldRelock(LOCK_AFTER_MS, true)).toBe(true);
    expect(shouldRelock(LOCK_AFTER_MS - 1, true)).toBe(false);
    expect(shouldRelock(10 * 60_000, false)).toBe(false);
  });
});

describe("conta PRX BANK aberta e funcionando", () => {
  const newUser = () => `usr_${Math.random().toString(36).slice(2)}`;

  it("só conta quando está ativa, e ler a conta não cria a linha", async () => {
    const id = newUser();
    expect(await bankAccountIsActive(id)).toBe(false);
    expect(await getBankRepository(id).findAccount(id)).toBeNull();
    // Pendente (abertura ainda não confirmada): sem bloqueio.
    await getBankRepository(id).getOrCreateAccount(id);
    expect(await bankAccountIsActive(id)).toBe(false);
    sandboxActivate(id);
    expect(await bankAccountIsActive(id)).toBe(true);
  });

  it("em produção com o Asaas, conta ativa sem vínculo com a subconta é resto de sandbox e não conta", async () => {
    vi.stubEnv("ASAAS_ENVIRONMENT", "production");
    const id = newUser();
    sandboxActivate(id);
    expect(await bankAccountIsActive(id)).toBe(false);
  });
});
