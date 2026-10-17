// Hello World
import Image from "next/image";
import { Tag } from "@/components/app/ui";
import { CAR_HOME, type CarHomeJourney } from "@/components/app/pass/car-home-data";

/**
 * Capa da jornada: logo oficial (capa do media kit) e a foto. No celular a logo
 * fica sobre a foto; a partir do tablet, logo à esquerda e foto à direita.
 * É uma "ilha" escura nos dois temas; as logos têm fundo transparente (preto da capa convertido em alfa).
 */
function Cover({ journey: j }: { journey: CarHomeJourney }) {
  return (
    <div className="relative isolate overflow-hidden rounded-3xl bg-[#050508] sm:grid sm:grid-cols-2">
      <div className="absolute inset-x-0 top-0 z-10 flex justify-center p-5 sm:static sm:items-center sm:p-10">
        <Image src={j.logo} alt={j.logoAlt} sizes="(min-width: 640px) 380px, 70vw" className="h-auto w-[min(72%,280px)] sm:w-[min(88%,380px)]" />
      </div>
      <div className="relative aspect-[4/5] sm:aspect-[4/4.4]">
        <Image src={j.image} alt={j.imageAlt} fill sizes="(min-width: 640px) 50vw, 100vw" placeholder="blur" className={`object-cover ${j.focus}`} />
        <span
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,5,8,0.92)_0%,rgba(5,5,8,0.62)_32%,rgba(5,5,8,0)_58%,rgba(5,5,8,0.55)_100%)] sm:bg-[linear-gradient(90deg,#050508_0%,rgba(5,5,8,0)_30%,rgba(5,5,8,0)_75%,rgba(5,5,8,0.35)_100%)]"
        />
        <Tag tone="accent" className="absolute bottom-4 left-4">
          Em breve
        </Tag>
      </div>
    </div>
  );
}

/** Uma jornada (PRX CAR ou PRX HOME): capa, condições que os parceiros podem oferecer e o passo a passo. */
function Journey({ journey: j }: { journey: CarHomeJourney }) {
  return (
    <article id={`pass-${j.id}`} aria-labelledby={`pass-${j.id}-title`} className="space-y-8">
      <Cover journey={j} />

      <div>
        <h2 id={`pass-${j.id}-title`} className="ob-display text-[26px] leading-[1.1] text-ink sm:text-[32px]">
          {j.name}
        </h2>
        <p className="mt-3 text-balance text-[20px] font-light leading-snug tracking-[-0.01em] text-ink sm:text-[24px]">
          {j.title[0]}
          <br />
          {j.title[1]}
        </p>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">{j.lead}</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">A Condição PRX</h3>
          <p className="mt-1 text-[14px] text-muted-foreground">{j.conditionsIntro}</p>
          <dl className="mt-3 grid gap-x-6 sm:grid-cols-2">
            {j.conditions.map(([name, text]) => (
              <div key={name} className="border-t border-line py-3">
                <dt className="font-mono text-[12px] font-semibold tracking-[0.14em] text-primary">{name}</dt>
                <dd className="mt-1 text-[14px] leading-snug text-ink">{text}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div>
          <h3 className="text-[15px] font-semibold text-ink">Como funciona</h3>
          <ol className="mt-3 space-y-3">
            {j.steps.map(([title, text], i) => (
              <li key={title} className="flex gap-4 border-t border-line pt-3">
                <span aria-hidden className="mt-0.5 font-mono text-[12px] tracking-[0.12em] text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <p className="text-[15px] font-medium text-ink">{title}</p>
                  <p className="text-[14px] leading-snug text-muted-foreground">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {j.extras.map(([name, text]) => (
          <li key={name} className="glass-soft rounded-2xl p-4">
            <p className="font-mono text-[12px] font-semibold tracking-[0.14em] text-primary">{name}</p>
            <p className="mt-1.5 text-[14px] leading-snug text-ink">{text}</p>
          </li>
        ))}
      </ul>

      <div className="space-y-1.5 border-t border-line pt-4">
        {j.notes.map((note) => (
          <p key={note} className="max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
            {note}
          </p>
        ))}
        <p className="pt-2 font-mono text-[12px] uppercase tracking-[0.18em] text-muted-foreground">{j.signature}</p>
      </div>
    </article>
  );
}

const PARTNERS: Record<CarHomeJourney["id"], string> = {
  car: "As primeiras condições aparecem aqui assim que as concessionárias parceiras entrarem.",
  home: "As primeiras condições aparecem aqui assim que as construtoras parceiras entrarem.",
};

/**
 * PRX CAR ou PRX HOME no PRX PASS (cada um na sua aba): as primeiras grandes
 * conquistas, com condições negociadas com concessionárias e construtoras.
 */
export function CarHomePanel({ id }: { id: CarHomeJourney["id"] }) {
  const journey = CAR_HOME.find((j) => j.id === id) ?? CAR_HOME[0];
  return (
    <section aria-label={journey.name} className="space-y-8">
      <p className="max-w-2xl text-[14px] text-muted-foreground">{PARTNERS[journey.id]}</p>
      <Journey journey={journey} />
    </section>
  );
}
