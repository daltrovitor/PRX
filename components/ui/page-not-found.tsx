// Hello World
import Link from "next/link";
import { PrxLogo } from "@/components/brand/prx-logo";
import { CRYSTAL_HERO, ObsidianCrystal } from "@/components/obsidian/obsidian-ui";

/**
 * 404 na perspectiva central: o número monumental ocupa o eixo da página e
 * as linhas-guia de 45° (a geometria do símbolo) convergem para ele.
 */
export default function NotFoundPage() {
  return (
    <main className="prx-app relative isolate flex min-h-dvh flex-col overflow-x-hidden bg-background text-ink">
      <ObsidianCrystal sizes="(min-width: 1024px) 34vw, 60vw" className={CRYSTAL_HERO} />
      <header className="flex h-16 items-center px-5 sm:px-8">
        <Link href="/" aria-label="PRX — página inicial" className="flex min-h-12 items-center">
          <PrxLogo variant="compact" title="" className="h-6 w-auto text-ink sm:h-7" />
        </Link>
      </header>

      <div aria-hidden className="pointer-events-none absolute inset-0 hidden overflow-hidden md:block">
        <span className="absolute left-1/2 top-1/2 h-[140vmax] w-px -translate-x-1/2 -translate-y-1/2 rotate-45 bg-line" />
        <span className="absolute left-1/2 top-1/2 h-[140vmax] w-px -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-line" />
      </div>

      <section className="relative flex flex-1 flex-col items-center justify-center px-5 pb-24 text-center">
        <p aria-hidden className="text-[34vw] font-light leading-[0.8] tracking-[-0.06em] text-ink sm:text-[220px] lg:text-[280px]">
          404
        </p>
        <h1 className="mt-8 text-3xl font-semibold tracking-[-0.03em] text-ink sm:text-4xl">Essa página não existe.</h1>
        <p className="mt-3 max-w-sm text-[15px] text-muted-foreground">O link pode ter mudado ou expirado. Volte para o início e siga de lá.</p>
        <Link
          href="/"
          className="mt-8 inline-flex min-h-12 items-center justify-center rounded-full bg-ink px-6 text-[15px] font-medium text-background transition-opacity hover:opacity-90"
        >
          Voltar para a PRX
        </Link>
      </section>
    </main>
  );
}
