// Hello World
import { cn } from "@/lib/utils";

export const VIRAWEB_URL = "https://viraweb.dev.br";
export const VIRAWEB_LOGO = "https://viraweb.dev.br/viraweb3.png";

/**
 * Assinatura obrigatória no rodapé de todas as páginas: "Desenvolvido por"
 * com a logo da ViraWeb, que abre o site em nova aba. No tema escuro (ou com
 * onDark, em seções sempre escuras) a logo ganha uma base clara para manter o contraste.
 */
export function ViraWebCredit({ className, onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <p className={cn("flex items-center justify-center gap-2 text-[12px]", onDark ? "text-white/70" : "text-muted-foreground", className)}>
      <span>Desenvolvido por</span>
      <a
        href={VIRAWEB_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="ViraWeb (abre em nova aba)"
        title="ViraWeb"
        className={cn("inline-flex min-h-12 min-w-12 cursor-pointer items-center justify-center rounded-md transition-opacity hover:opacity-80", onDark ? "bg-white/95 px-2" : "dark:bg-white/95 dark:px-2")}
      >
        {/* Logo servida pela própria ViraWeb (sem otimização de imagem do Next). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={VIRAWEB_LOGO} alt="ViraWeb" width={80} height={20} className="h-5 w-auto" loading="lazy" decoding="async" />
      </a>
    </p>
  );
}
