// Hello World

/** Página e tamanho vindos da URL, sempre dentro de limites (nada de consulta sem limite). */
export const MAX_PAGE_SIZE = 100;

export function pageParams(q: URLSearchParams, fallbackSize = 25): { page: number; pageSize: number } {
  const page = Math.max(1, Math.min(10_000, Math.floor(Number(q.get("page")) || 1)));
  const pageSize = Math.max(5, Math.min(MAX_PAGE_SIZE, Math.floor(Number(q.get("pageSize")) || fallbackSize)));
  return { page, pageSize };
}
