// Hello World
/**
 * Frases do manifesto PRX. Para adicionar ou remover, edite só esta lista.
 * Cada frase cabe em duas linhas: separe as linhas com " / ".
 * A primeira é a padrão (servidor, SEO e quando não há sessão).
 */
export const TAGLINES: readonly string[] = [
  "O futuro não se assiste. / Se constrói.",
];

const STORAGE_KEY = "prx:tagline";

/** Índice da frase da sessão: sorteado uma vez e guardado no sessionStorage. */
export function sessionTaglineIndex(): number {
  if (TAGLINES.length <= 1) return 0;
  try {
    const saved = Number(sessionStorage.getItem(STORAGE_KEY));
    if (Number.isInteger(saved) && saved >= 0 && saved < TAGLINES.length) return saved;
    const pick = Math.floor(Math.random() * TAGLINES.length);
    sessionStorage.setItem(STORAGE_KEY, String(pick));
    return pick;
  } catch {
    return 0;
  }
}
