// Hello World
import type { ReactNode } from "react";
import { SitePage } from "@/components/marketing/site-chrome";
import { TERMS_VERSION } from "@/lib/legal-version";

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

const updated = new Date(`${TERMS_VERSION}T12:00:00-03:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });

/** Documento legal com sumário navegável e tipografia de leitura longa. */
export function LegalDocument({ title, intro, sections, meta }: { title: string; intro: ReactNode; sections: ReadonlyArray<LegalSection>; meta?: ReactNode }) {
  return (
    <SitePage>
      <article className="mx-auto grid max-w-[1200px] gap-10 px-4 pb-24 pt-12 sm:px-6 lg:grid-cols-[260px_1fr] lg:gap-16 lg:px-10 lg:pt-16">
        <header className="lg:col-span-2">
          <p className="text-[13px] font-medium text-muted-foreground">
            {meta ?? (
              <>
                Versão {TERMS_VERSION} · atualizada em {updated}
              </>
            )}
          </p>
          <h1 className="mt-3 max-w-3xl text-[40px] font-semibold leading-[1.05] tracking-[-0.04em] text-ink sm:text-6xl">{title}</h1>
          <div className="mt-5 max-w-2xl text-[17px] leading-relaxed text-muted-foreground">{intro}</div>
        </header>

        <nav aria-label="Sumário" className="lg:sticky lg:top-24 lg:self-start">
          <h2 className="text-[13px] font-semibold text-ink">Sumário</h2>
          <ol className="mt-3 space-y-0.5 border-l border-line">
            {sections.map((section, index) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="-ml-px flex min-h-12 cursor-pointer items-center border-l border-transparent pl-4 text-[14px] text-muted-foreground transition-colors hover:border-ink hover:text-ink"
                >
                  {index + 1}. {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="min-w-0 space-y-12">
          {sections.map((section, index) => (
            <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`} className="scroll-mt-24">
              <h2 id={`${section.id}-title`} className="text-2xl font-semibold tracking-[-0.03em] text-ink sm:text-[28px]">
                {index + 1}. {section.title}
              </h2>
              <div className="legal-prose mt-4 space-y-4 text-[16px] leading-[1.75] text-ink/85 [&_a]:cursor-pointer [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_li]:pl-1 [&_strong]:font-semibold [&_strong]:text-ink [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
                {section.body}
              </div>
            </section>
          ))}
        </div>
      </article>
    </SitePage>
  );
}
