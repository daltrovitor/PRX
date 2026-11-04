// Hello World

/**
 * Hosts que o otimizador do Next (/_next/image) pode buscar. Precisa bater com
 * images.remotePatterns de next.config.ts (pentest M2: o curinga "**" fazia do
 * otimizador um proxy aberto para qualquer host da internet).
 */
const OPTIMIZABLE_HOSTS: RegExp[] = [/(^|\.)supabase\.co$/i, /^lh3\.googleusercontent\.com$/i, /^cdn\.prx\.app\.br$/i];

/**
 * false para imagem https de um host fora da lista: o componente deve renderizá-la
 * com `unoptimized` (o navegador busca direto), em vez de passar pelo otimizador.
 * Caminhos locais, data/blob URLs e imports estáticos seguem o fluxo normal.
 */
export function isOptimizableImage(src: unknown): boolean {
  if (typeof src !== "string") return true;
  if (src.startsWith("/") && !src.startsWith("//")) return true;
  try {
    const url = new URL(src);
    if (url.protocol !== "https:" && url.protocol !== "http:") return true;
    return url.protocol === "https:" && OPTIMIZABLE_HOSTS.some((host) => host.test(url.hostname));
  } catch {
    return true;
  }
}
