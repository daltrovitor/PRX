// Hello World
"use client";

import { useEffect, useState } from "react";
import { PrxImage } from "@/components/ui/prx-image";
import { Button, Tag } from "@/components/app/ui";

export interface FoundersCommunityData {
  founders: Array<{ displayName: string; headline: string }>;
  me: { displayName: string; headline: string; benefits: string[]; endsAt: string | null } | null;
  officialImage: { url: string; alt: string } | null;
}

/** Imagem oficial do PRX Founders (só quando o admin enviou e ativou para o lugar). */
export function FoundersOfficialImage({ image, priority = false }: { image: { url: string; alt: string }; priority?: boolean }) {
  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden rounded-3xl bg-surface">
      <PrxImage src={image.url} alt={image.alt} fill sizes="(min-width: 1024px) 560px, 100vw" className="object-cover" priority={priority} />
    </div>
  );
}

/**
 * Founders da PRX na aba Founders: a imagem oficial (quando publicada), o
 * status de quem é Founder com os benefícios dele e a lista dos Founders
 * ativos que aceitaram aparecer (só nome e chamada).
 */
export function FoundersCommunity({ data }: { data: FoundersCommunityData }) {
  if (!data.officialImage && !data.me && data.founders.length === 0) return null;
  return (
    <section aria-labelledby="founders-community" className="space-y-4">
      {data.officialImage && <FoundersOfficialImage image={data.officialImage} priority />}
      {data.me && (
        <div className="glass space-y-3 rounded-3xl p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone="accent">Founder</Tag>
            <h2 id="founders-community" className="text-lg font-semibold tracking-[-0.02em] text-ink">
              Você é Founder da PRX
            </h2>
          </div>
          {data.me.headline && <p className="text-[14px] text-muted-foreground">{data.me.headline}</p>}
          {data.me.benefits.length > 0 && (
            <ul className="list-inside list-disc space-y-1 text-[14px] text-ink">
              {data.me.benefits.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
          {data.me.endsAt && <p className="text-[12px] text-muted-foreground">Válido até {new Date(data.me.endsAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}.</p>}
        </div>
      )}
      {data.founders.length > 0 && (
        <div className="space-y-2">
          {!data.me && (
            <h2 id="founders-community" className="text-[13px] font-semibold text-muted-foreground">
              Founders da PRX
            </h2>
          )}
          {data.me && <h3 className="text-[13px] font-semibold text-muted-foreground">Founders da PRX</h3>}
          <ul className="flex flex-wrap gap-2">
            {data.founders.map((f) => (
              <li key={`${f.displayName}-${f.headline}`} className="glass-chip rounded-full px-4 py-2 text-[13px] text-ink">
                {f.displayName}
                {f.headline ? <span className="text-muted-foreground"> · {f.headline}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Na Início, ao lado do PRX LIVE: o PRX Founders com a imagem oficial. Nada aparece sem a imagem ativada. */
export function FoundersHomePromo({ onOpen }: { onOpen: () => void }) {
  const [image, setImage] = useState<{ url: string; alt: string } | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/brand-assets?key=founders_official_image&placement=app_home");
        const json = (await res.json().catch(() => ({}))) as { asset?: { url: string; alt: string } | null };
        if (alive) setImage(json.asset ?? null);
      } catch {
        if (alive) setImage(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  if (!image) return null;
  return (
    <section aria-labelledby="home-founders" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="home-founders" className="text-[17px] font-semibold tracking-[-0.02em] text-ink">
          PRX Founders
        </h2>
        <Button variant="ghost" size="sm" onClick={onOpen}>
          Conhecer
        </Button>
      </div>
      <button type="button" onClick={onOpen} className="block w-full cursor-pointer rounded-3xl text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" aria-label="Abrir o PRX Founders">
        <FoundersOfficialImage image={image} />
      </button>
    </section>
  );
}
