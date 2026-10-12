// Hello World
"use client";

import { useEffect, useRef, useState } from "react";
import { trackReel } from "@/components/app/reels/reel-cta";
import { PrxImage } from "@/components/ui/prx-image";
import type { HomeBanner } from "@/lib/reels/types";
import { cn } from "@/lib/utils";

function partnerInitials(name: string): string {
  return (name || "PRX")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

/**
 * Um banner da Home: Destaque de imagem de um parceiro. Mesmo cartão de ação dos
 * vídeos da aba Destaques (marca como "Parceiro PRX" e botão), sem rótulo de
 * anúncio. A visualização é contada quando metade do banner aparece na tela.
 */
function BannerCard({ banner, onOpen }: { banner: HomeBanner; onOpen: (banner: HomeBanner) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        trackReel("view", banner.id);
        observer.disconnect();
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [banner.id]);

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onOpen(banner)}
      aria-label={`${banner.partnerName}: ${banner.title}. ${banner.ctaLabel}`}
      className="group relative isolate block aspect-[5/4] w-full cursor-pointer overflow-hidden rounded-[24px] border border-white/[0.12] bg-[#0b0b10] text-left text-[#fff] transition-[border-color] duration-300 hover:border-white/[0.24] @[560px]:aspect-[16/8] @[900px]:aspect-[3/1]"
    >
      {!imageFailed && (
        <PrxImage
          src={banner.imageUrl}
          alt=""
          fill
          sizes="(min-width: 1024px) 1100px, 92vw"
          className="-z-10 object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
          onError={() => setImageFailed(true)}
        />
      )}
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-[78%] bg-gradient-to-t from-black/80 via-black/45 to-transparent" />

      <span className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-3 sm:p-4 @[560px]:max-w-[520px]">
        <span className="block px-1">
          <span className="block text-[17px] font-semibold leading-snug tracking-[-0.01em]">{banner.title}</span>
          {banner.caption && <span className="mt-1 line-clamp-2 block text-[13px] leading-snug text-white/85">{banner.caption}</span>}
        </span>
        <span className="flex items-center gap-2.5 rounded-2xl bg-white/95 p-2.5 text-[#0b0b10] shadow-lg">
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#f2f2f5] text-[13px] font-semibold">
            {banner.partnerLogo ? <PrxImage src={banner.partnerLogo} alt="" fill sizes="40px" className="object-cover" /> : partnerInitials(banner.partnerName)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-semibold">{banner.partnerName}</span>
            <span className="block truncate text-[12px] text-[#5b5b66]">Parceiro PRX</span>
          </span>
          <span className="flex min-h-12 shrink-0 items-center rounded-xl bg-[#6c0cf0] px-3 text-[12.5px] font-semibold text-white transition-colors group-hover:bg-[#5708c9] @[400px]:px-4 @[400px]:text-[13px]">
            {banner.ctaLabel}
          </span>
        </span>
      </span>
    </button>
  );
}

/**
 * Banners da Home (abaixo dos eventos). Um só ocupa a largura toda; vários viram
 * um carrossel horizontal, na ordem definida no admin.
 */
export function HomeBanners({ banners, onOpen }: { banners: ReadonlyArray<HomeBanner>; onOpen: (banner: HomeBanner) => void }) {
  if (banners.length === 0) return null;
  const several = banners.length > 1;
  return (
    <ul
      className={cn(
        "flex gap-3",
        several && "-mx-4 snap-x snap-mandatory overflow-x-auto px-4 pb-1 scrollbar-none touch-pan-x sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0"
      )}
    >
      {banners.map((banner) => (
        <li key={banner.id} className={cn("@container min-w-0", several ? "w-[88%] shrink-0 snap-start sm:w-[70%] lg:w-[calc(50%-6px)]" : "w-full")}>
          <BannerCard banner={banner} onOpen={onOpen} />
        </li>
      ))}
    </ul>
  );
}
