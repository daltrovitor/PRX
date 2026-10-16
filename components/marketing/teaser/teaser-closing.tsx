// Hello World
import { PrxLogo } from "@/components/brand/prx-logo";
import { ViraWebCredit } from "@/components/brand/viraweb-credit";
import { Reveal } from "@/components/marketing/landing/landing-kit";
import { TEASER_FAQ } from "@/components/marketing/teaser/teaser-data";
import { TeaserWaitlist } from "@/components/marketing/teaser/teaser-waitlist";

/** Perguntas frequentes (details nativo: abre com teclado e leitor de tela sem JavaScript). */
export function TeaserFaq() {
  return (
    <section id="perguntas" aria-labelledby="faq-title" className="mx-auto max-w-[1440px] border-t border-white/10 px-5 py-24 sm:px-8 sm:py-32 lg:px-12">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
        <h2 id="faq-title" className="ob-display text-[clamp(36px,5vw,72px)] leading-[0.96] tracking-[0.03em] text-white lg:col-span-4">
          Perguntas
          <br />
          frequentes.
        </h2>
        <div className="border-t border-white/10 lg:col-span-8">
          {TEASER_FAQ.map((item) => (
            <details key={item.q} className="group border-b border-white/10">
              <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-6 py-4 text-[18px] font-medium tracking-[-0.01em] text-white transition-colors hover:text-[#c4b1fd] sm:text-[20px] [&::-webkit-details-marker]:hidden">
                {item.q}
                <span aria-hidden className="relative h-4 w-4 shrink-0 transition-transform duration-300 group-open:rotate-45">
                  <span className="absolute left-0 top-1/2 h-px w-4 -translate-y-1/2 bg-current" />
                  <span className="absolute left-1/2 top-0 h-4 w-px -translate-x-1/2 bg-current" />
                </span>
              </summary>
              <p className="max-w-[640px] pb-6 text-[16px] leading-relaxed text-white/75">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Chamada final com a Lista VIP. */
export function TeaserClosing() {
  return (
    <section id="lista-vip" aria-labelledby="final-title" className="relative isolate overflow-hidden border-t border-white/10">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(60%_70%_at_20%_110%,rgba(124,58,237,0.3),transparent_70%),radial-gradient(40%_40%_at_100%_0%,rgba(0,102,255,0.1),transparent_70%)]"
      />
      <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-12 px-5 py-24 sm:px-8 sm:py-36 lg:grid-cols-12 lg:px-12">
        <Reveal amount={0.5} className="lg:col-span-7">
          <h2 id="final-title" className="ob-display text-[clamp(48px,8.4vw,128px)] leading-[0.9] tracking-[0.02em] text-white">
            Seja avisado
            <br />
            primeiro.
          </h2>
          <p className="mt-8 max-w-[520px] text-pretty text-[17px] leading-relaxed text-white/75">
            A PRX abre em breve em prx.app.br. Entre na Lista de Espera VIP e receba o convite antes de todo mundo.
          </p>
        </Reveal>
        <Reveal index={1} amount={0.4} className="self-end lg:col-span-5">
          <TeaserWaitlist source="final" />
        </Reveal>
      </div>
    </section>
  );
}

/** Rodapé: marca, documentos legais e crédito. */
export function TeaserFooter() {
  return (
    <footer className="border-t border-white/10">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-5 py-10 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:px-12">
        <PrxLogo variant="full" title="PRX" className="h-7 w-auto text-white" />
        <nav aria-label="Documentos" className="flex flex-wrap items-center gap-x-6">
          <a href="/termos" className="inline-flex min-h-12 cursor-pointer items-center font-mono text-[12px] uppercase tracking-[0.16em] text-white/70 transition-colors hover:text-white">
            Termos de Uso
          </a>
          <a href="/privacidade" className="inline-flex min-h-12 cursor-pointer items-center font-mono text-[12px] uppercase tracking-[0.16em] text-white/70 transition-colors hover:text-white">
            Política de Privacidade
          </a>
        </nav>
        <ViraWebCredit onDark className="justify-start" />
      </div>
    </footer>
  );
}
