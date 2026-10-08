// Hello World
"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { Tagline } from "@/components/marketing/tagline";
import Image from "next/image";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { PrxRevealMark, addPrxRevealTweens, showPrxRevealFinal } from "@/components/brand/prx-logo-reveal";
import { ViraWebCredit } from "@/components/brand/viraweb-credit";
import { LIQUID, Reveal, Specular } from "@/components/marketing/landing/landing-kit";
import { OBSIDIAN_IMAGES, OBSIDIAN_PILLARS } from "@/components/obsidian/obsidian-ui";
import { cn } from "@/lib/utils";

gsap.registerPlugin(useGSAP);

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "done"; message: string } | { kind: "error"; message: string };

/**
 * Teaser do prx.app.br na mesma identidade da landing (Cyber-Luxury Obsidian):
 * palco obsidiana com haze violeta e cobalto, o cristal PRX fundido ao breu, a
 * marca se montando no centro, o manifesto e a Lista de Espera VIP num cartão de
 * vidro líquido. Abaixo, os pilares com as fotos originais da marca.
 */
export function ComingSoon() {
  const rootRef = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/:/g, "");
  const emailId = useId();
  const consentId = useId();
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  useGSAP(
    () => {
      const q = gsap.utils.selector(rootRef);
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        showPrxRevealFinal(q, gsap);
        gsap.set(q("[data-logo]"), { autoAlpha: 1 });
        return;
      }
      const tl = gsap.timeline({ defaults: { ease: "expo.out" }, delay: 0.2 });
      addPrxRevealTweens(tl, q, gsap);
      gsap.set(q("[data-logo]"), { autoAlpha: 1 });
      // Texto e formulário ficam visíveis desde o primeiro quadro (legíveis e com contraste pleno);
      // só deslizam enquanto a marca se monta.
      tl.from(q("[data-headline]"), { y: 20, duration: 1.1, ease: "power3.out" }, 0).from(q("[data-after]"), { y: 24, duration: 0.9, stagger: 0.12, ease: "power3.out" }, 0.1);
    },
    { scope: rootRef },
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!consent) return setStatus({ kind: "error", message: "Autorize o contato para entrar na lista." });
    setStatus({ kind: "sending" });
    try {
      const res = await fetch("/api/waitlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, consent }) });
      const json = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!res.ok) return setStatus({ kind: "error", message: json.error || "Não foi possível entrar na lista agora." });
      setStatus({ kind: "done", message: json.message || "Você está na Lista VIP." });
      setEmail("");
    } catch {
      setStatus({ kind: "error", message: "Sem conexão. Tente de novo em instantes." });
    }
  }

  return (
    <div ref={rootRef} className="prx-obsidian prx-obsidian-page min-h-dvh overflow-x-clip bg-[#050508] text-white selection:bg-[#7c3aed] selection:text-white">
      <main>
        <section aria-labelledby="teaser-title" className="relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden px-5 py-20 sm:px-8">
          {/* Palco Obsidian: haze violeta ao centro, cobalto na base e o cristal PRX ao fundo. */}
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-[radial-gradient(62%_52%_at_50%_40%,rgba(124,58,237,0.28),transparent_72%),radial-gradient(90%_42%_at_50%_108%,rgba(0,102,255,0.14),transparent_72%)]"
          />
          <div aria-hidden className="pointer-events-none absolute left-1/2 top-[-6%] -z-10 aspect-[9/16] h-[112%] -translate-x-1/2 mix-blend-screen">
            <Image
              src={OBSIDIAN_IMAGES.crystal}
              alt=""
              fill
              sizes="(min-width: 1024px) 40rem, 100vw"
              loading="eager"
              placeholder="blur"
              className="object-cover opacity-40 [mask-image:radial-gradient(closest-side,#000_30%,transparent_100%)] sm:opacity-60"
            />
          </div>

          <PrxRevealMark uid={uid} className="h-auto w-[min(78vw,460px)] overflow-visible text-white" />

          <div className="mt-12 w-full max-w-[640px] text-center">
            <h1 id="teaser-title" data-headline className="ob-display text-balance text-[clamp(24px,7.4vw,44px)] leading-[1.12] tracking-[0.06em]">
              <Tagline />
            </h1>
            <p data-after className="mt-5 text-[17px] text-white/75 sm:text-[19px]">
              Em breve em <strong className="font-semibold text-white">prx.app.br</strong>
            </p>
            <p data-after className="mx-auto mt-3 max-w-[520px] text-pretty text-[15px] leading-relaxed text-white/80 sm:text-[16px]">
              Sua vida financeira, benefícios reais e comunidade exclusiva unificados em um só ecossistema. Cada gasto em parceiro vira PRX Coins e impulsiona o seu nível.
            </p>

            <form data-after onSubmit={submit} noValidate className={cn("relative mx-auto mt-10 max-w-[480px] overflow-hidden rounded-[28px] p-5 text-left sm:p-6", LIQUID.dark)}>
              <Specular />
              <label htmlFor={emailId} className="ob-label relative block text-[11px] text-white/75">
                Lista de Espera VIP
              </label>
              <div className="relative mt-3 flex flex-col gap-2 min-[420px]:flex-row">
                <input
                  id={emailId}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  suppressHydrationWarning
                  aria-invalid={status.kind === "error"}
                  aria-describedby={`${emailId}-status`}
                  className="h-12 w-full min-w-0 rounded-full border border-white/15 bg-white/[0.06] px-5 text-[16px] text-white placeholder:text-white/50 focus:border-[#9468fa] focus:outline-none focus:ring-4 focus:ring-[#9468fa]/20 min-[420px]:flex-1"
                />
                <button
                  type="submit"
                  disabled={status.kind === "sending" || !consent}
                  className="group/lux relative min-h-12 cursor-pointer overflow-hidden whitespace-nowrap rounded-full bg-[#7c3aed] px-6 text-[15px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_10px_28px_-10px_rgba(124,58,237,0.8)] transition-[background-color,transform] hover:bg-[#6d28d9] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.42),transparent)] opacity-0 transition-[translate,opacity] duration-700 ease-out group-hover/lux:translate-x-[300%] group-hover/lux:opacity-100 motion-reduce:hidden"
                  />
                  <span className="relative">{status.kind === "sending" ? "Enviando…" : "Quero entrar"}</span>
                </button>
              </div>
              <div className="relative mt-3 flex min-h-12 items-start gap-3">
                <label className="-mx-3.5 -my-3 flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center">
                  <input
                    id={consentId}
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    suppressHydrationWarning
                    className="h-5 w-5 shrink-0 cursor-pointer accent-[#7c3aed]"
                  />
                </label>
                <label htmlFor={consentId} className="cursor-pointer text-[13px] leading-relaxed text-white/75">
                  Autorizo a PRX a me avisar do lançamento por e-mail, conforme a{" "}
                  <a href="/privacidade" target="_blank" rel="noopener" className="cursor-pointer font-medium text-[#c4b1fd] underline underline-offset-2">
                    Política de Privacidade
                  </a>
                  .
                </label>
              </div>
              <p
                id={`${emailId}-status`}
                role="status"
                aria-live="polite"
                className={cn("relative min-h-5 text-[13px]", status.kind === "error" ? "text-[#f87171]" : "text-[#34d399]")}
              >
                {status.kind === "done" || status.kind === "error" ? status.message : ""}
              </p>
            </form>
          </div>
        </section>

        <section aria-labelledby="teaser-pilares" className="relative px-5 pb-20 sm:px-8 sm:pb-28">
          <div className="mx-auto max-w-[1200px]">
            <Reveal amount={0.6}>
              <h2 id="teaser-pilares" className="ob-label border-b border-white/10 pb-4 text-[12px] text-white/70">
                O que chega com o PRX
              </h2>
            </Reveal>
            <ul className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 lg:gap-5">
              {OBSIDIAN_PILLARS.map((pillar, i) => (
                <li key={pillar.id}>
                  <Reveal index={i}>
                    <article className="relative isolate flex aspect-[3/4.2] flex-col justify-between overflow-hidden rounded-[24px] border border-x-white/10 border-t-white/30 border-b-white/5 bg-[#07070b] p-4 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.9)] sm:p-5">
                      <Image src={pillar.image} alt="" fill sizes="(min-width: 1024px) 282px, 50vw" placeholder="blur" className={cn("-z-10 object-cover", pillar.focus)} />
                      <span aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(5,5,8,0.62)_0%,rgba(5,5,8,0.06)_34%,rgba(5,5,8,0.12)_52%,rgba(5,5,8,0.9)_100%)]" />
                      <h3 className="ob-label text-[15px] leading-[1.15] tracking-[0.16em] sm:text-[18px]">
                        PRX
                        <br />
                        {pillar.name}
                      </h3>
                      <p className="text-[13px] leading-snug text-white/85 sm:text-[14px]">
                        {pillar.caption[0]} {pillar.caption[1]}
                      </p>
                    </article>
                  </Reveal>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="relative border-t border-white/[0.06] px-5 py-10 text-center text-[13px] text-white/70 sm:px-8">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(40rem_16rem_at_50%_130%,rgba(124,58,237,0.22),transparent_70%)]" />
        <nav aria-label="Documentos" className="flex flex-wrap items-center justify-center gap-x-5">
          <a href="/termos" className="inline-flex min-h-12 cursor-pointer items-center transition-colors hover:text-white">
            Termos de Uso
          </a>
          <a href="/privacidade" className="inline-flex min-h-12 cursor-pointer items-center transition-colors hover:text-white">
            Política de Privacidade
          </a>
        </nav>
        <ViraWebCredit onDark className="mt-2" />
      </footer>
    </div>
  );
}
