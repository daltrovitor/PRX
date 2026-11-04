// Hello World
import Link from "next/link";
import type { ReactNode } from "react";
import { PrxLogo } from "@/components/brand/prx-logo";
import { AppThemeScope } from "@/components/marketing/app-theme-scope";
import { CRYSTAL_HERO, ObsidianCrystal } from "@/components/obsidian/obsidian-ui";
import { cn } from "@/lib/utils";

/*
 * Moldura das páginas públicas (documentos legais e Sou Pai):
 * cabeçalho em vidro, rodapé corporativo e o tema do Modelo Padrão.
 * Server Component: nada aqui precisa de JavaScript no navegador.
 */

const NAV = [
  { href: "/", label: "Início" },
  { href: "/sou-pai", label: "Sou Pai" },
  { href: "/termos", label: "Termos" },
  { href: "/privacidade", label: "Privacidade" },
];

export function SiteHeader({ cta = true }: { cta?: boolean }) {
  return (
    <header className="glass-bar sticky top-0 z-40 border-x-0 border-t-0">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-6 lg:h-[72px] lg:px-10">
        <Link href="/" className="flex min-h-12 cursor-pointer items-center" aria-label="PRX — página inicial">
          <PrxLogo variant="compact" title="" className="h-6 w-auto text-ink sm:h-7" />
        </Link>
        <nav aria-label="Produtos PRX" className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <a key={item.href} href={item.href} className="inline-flex min-h-12 cursor-pointer items-center rounded-lg px-3.5 text-[15px] font-medium text-muted-foreground transition-colors hover:bg-surface hover:text-ink">
              {item.label}
            </a>
          ))}
        </nav>
        {cta && (
          <Link
            href="/"
            className="inline-flex min-h-12 cursor-pointer items-center rounded-xl bg-ink px-5 text-[15px] font-semibold text-background transition-opacity hover:opacity-90"
          >
            Abrir o app
          </Link>
        )}
      </div>
    </header>
  );
}

import { PrxFooter } from "@/components/marketing/prx-footer";

export function SiteFooter() {
  return <PrxFooter onDark={false} />;
}

/** Página pública completa: tema, cabeçalho, conteúdo e rodapé. */
export function SitePage({ children, className, cta = true }: { children: ReactNode; className?: string; cta?: boolean }) {
  return (
    <div className={cn("prx-app relative isolate flex min-h-dvh flex-col overflow-x-clip bg-background text-foreground selection:bg-[#6c0cf0] selection:text-white", className)}>
      <AppThemeScope />
      <div aria-hidden className="prx-ambient" />
      <ObsidianCrystal sizes="(min-width: 1024px) 34vw, 60vw" className={CRYSTAL_HERO} />
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-lg focus:bg-ink focus:px-4 focus:py-3 focus:text-background">
        Pular para o conteúdo
      </a>
      <SiteHeader cta={cta} />
      <main id="conteudo" className="relative z-10 flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
