// Hello World

/** Fora do app por mais que isso, com a conta do banco ativa: a volta pede senha ou biometria. */
export const LOCK_AFTER_MS = 60_000;

/**
 * Tela de entrada dedicada (senha ou biometria) no lugar do app:
 *  - conta lembrada neste aparelho e sem sessão: é uma entrada;
 *  - sessão ativa: só quando a conta PRX BANK está aberta e funcionando, a cada entrada no app.
 *    Antes disso o app abre direto, mesmo com a conta lembrada neste aparelho;
 *  - logo depois de entrar por ela, enquanto a oferta de biometria não é respondida.
 */
export function needsQuickLogin(state: { hasKnownAccount: boolean; hasSession: boolean; requiresUnlock: boolean; unlocked: boolean; offering: boolean }): boolean {
  if (!state.hasSession) return state.hasKnownAccount;
  return state.offering || (state.requiresUnlock && !state.unlocked);
}

/** Voltou ao app depois de tempo suficiente para pedir senha ou biometria de novo? */
export function shouldRelock(awayMs: number, requiresUnlock: boolean): boolean {
  return requiresUnlock && awayMs >= LOCK_AFTER_MS;
}
