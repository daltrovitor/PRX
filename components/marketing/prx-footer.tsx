// Hello World
"use client";

import Link from "next/link";
import { ViraWebCredit } from "@/components/brand/viraweb-credit";
import { COMPANY } from "@/lib/company";
import { cn } from "@/lib/utils";

interface PrxFooterProps {
  /** Se verdadeiro, usa a paleta Obsidian (#050508) para a landing e páginas escuras. */
  onDark?: boolean;
  className?: string;
}

/**
 * Rodapé Institucional e Legal PRX — Padrão Fintech / Faria Lima.
 * Design limpo, minimalista, moderno e com conformidade jurídica completa (LGPD e Propriedade Intelectual).
 */
export function PrxFooter({ onDark = false, className }: PrxFooterProps) {
  const currentYear = 2026;

  const legalLinks = [
    { label: "Termos de Uso", href: "/termos" },
    { label: "Política de Privacidade", href: "/privacidade" },
    { label: "Política de Cookies", href: "/privacidade#cookies" },
    { label: "Segurança", href: "/privacidade#seguranca" },
    { label: "Atendimento", href: `mailto:${COMPANY.supportEmail}` },
  ];

  return (
    <footer
      className={cn(
        "relative isolate w-full border-t transition-colors",
        onDark
          ? "border-white/[0.08] bg-[#050508] text-white"
          : "border-black/[0.08] bg-[#ffffff] text-[#0b0b10]",
        className,
      )}
    >
      {onDark && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(50rem_20rem_at_50%_120%,rgba(124,58,237,0.18),transparent_70%)]"
        />
      )}

      <div className="mx-auto max-w-[1200px] px-5 py-10 sm:px-8 sm:py-14">
        {/* Rodapé Principal (Primeiras Linhas + Navegação) */}
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className={cn("text-[14px] font-semibold tracking-[-0.01em] sm:text-[15px]", onDark ? "text-white" : "text-neutral-900")}>
              © {currentYear} PRX. Todos os direitos reservados.
            </p>
            <p className={cn("text-[13px] tracking-[0.04em]", onDark ? "text-white/70" : "text-neutral-500")}>
              PRX — Next is Yours.
            </p>
          </div>

          {/* Links Rápidos em Linha com Separador */}
          <nav aria-label="Links Legais e Institucionais">
            <ul className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] sm:text-[14px]">
              {legalLinks.map((item, idx) => (
                <li key={item.label} className="inline-flex items-center">
                  <Link
                    href={item.href}
                    className={cn(
                      "inline-flex min-h-11 cursor-pointer items-center transition-colors",
                      onDark
                        ? "text-white/75 hover:text-white"
                        : "text-neutral-600 hover:text-neutral-950",
                    )}
                  >
                    {item.label}
                  </Link>
                  {idx < legalLinks.length - 1 && (
                    <span
                      aria-hidden="true"
                      className={cn("mx-2 select-none", onDark ? "text-white/20" : "text-neutral-300")}
                    >
                      ·
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        </div>

        {/* Divisor Delicado */}
        <div
          className={cn(
            "my-8 h-px w-full",
            onDark ? "bg-white/[0.08]" : "bg-neutral-200/80",
          )}
        />

        {/* Bloco de Informação Legal (Menor, tom de nota jurídica / compliance) */}
        <div
          className={cn(
            "space-y-3 text-[11.5px] leading-relaxed tracking-normal sm:text-[12px]",
            onDark ? "text-white/45" : "text-neutral-500",
          )}
        >
          <p>
            As marcas, nomes, logotipos, conteúdos, imagens, produtos e serviços apresentados neste site são de propriedade da PRX ou de seus respectivos titulares. É proibida a reprodução, distribuição ou utilização sem autorização prévia.
          </p>
          <p>
            PRX respeita a sua privacidade e realiza o tratamento de dados pessoais em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018).
          </p>
          <div className="flex flex-col gap-2 pt-1 font-mono text-[11px] sm:flex-row sm:items-center sm:justify-between">
            <p className={onDark ? "text-white/60" : "text-neutral-600"}>
              CNPJ: {COMPANY.cnpjRaw} · {COMPANY.cityState}
            </p>
            <ViraWebCredit onDark={onDark} className="justify-start sm:justify-end" />
          </div>
        </div>
      </div>
    </footer>
  );
}
