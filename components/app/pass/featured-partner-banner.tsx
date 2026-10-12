// Hello World
"use client";

import { useState } from "react";
import { IconArrowRight } from "@/components/icons/prx-icons";
import { PrxImage } from "@/components/ui/prx-image";
import type { Benefit } from "@/lib/pass-data";

function partnerInitials(name: string): string {
  return (name || "PRX")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

/**
 * Banner de parceiro em destaque (Home, abaixo dos eventos): ilha escura nos dois
 * temas, com a capa do parceiro, o nome, a oferta e a seta. Mídia paga leva o
 * selo "Patrocinado" (cláusula 8.6 do Termo de Parceria); sem plano pago, o selo
 * é "Parceiro em destaque". Quem aparece é decidido em lib/partners/featured.ts.
 */
export function FeaturedPartnerBanner({ benefit, onOpen }: { benefit: Benefit; onOpen: () => void }) {
  const [coverFailed, setCoverFailed] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const cover = coverFailed ? "" : benefit.partnerBanner?.trim();
  const logo = logoFailed ? "" : benefit.partnerLogo?.trim();
  const label = benefit.sponsored ? "Patrocinado" : "Parceiro em destaque";

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${label}: ${benefit.partnerName}, ${benefit.discountLabel}. Ver oferta`}
      className="group relative isolate flex min-h-[156px] w-full cursor-pointer flex-col justify-between gap-6 overflow-hidden rounded-[24px] border border-white/[0.12] bg-[#07070b] p-5 text-left text-[#fff] transition-[border-color] duration-300 hover:border-white/[0.24] sm:min-h-[172px] sm:p-6"
    >
      {cover && (
        <PrxImage
          src={cover}
          alt=""
          fill
          sizes="(min-width: 1024px) 1100px, 92vw"
          className="-z-10 object-cover object-[50%_40%] transition-transform duration-700 ease-out group-hover:scale-[1.03]"
          onError={() => setCoverFailed(true)}
        />
      )}
      {!cover && <span aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(90%_130%_at_100%_0%,rgba(124,58,237,0.2),transparent_62%)]" />}
      <span aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(5,5,8,0.95)_0%,rgba(5,5,8,0.78)_46%,rgba(5,5,8,0.3)_100%)]" />

      <span className="ob-label text-[10px] tracking-[0.18em] text-[#cbd5e1]">{label}</span>

      <span className="flex items-end justify-between gap-4">
        <span className="flex min-w-0 items-center gap-4">
          <span className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white">
            {logo ? (
              <PrxImage src={logo} alt="" fill sizes="56px" className="object-contain p-1.5" onError={() => setLogoFailed(true)} />
            ) : (
              <span aria-hidden className="text-lg font-semibold tracking-[-0.03em] text-[#0b0b10]">
                {partnerInitials(benefit.partnerName)}
              </span>
            )}
          </span>
          <span className="min-w-0">
            <span className="ob-label block truncate text-[16px] tracking-[0.12em] sm:text-[19px]">{benefit.partnerName}</span>
            <span className="mt-1.5 line-clamp-2 text-[13px] leading-snug text-[#e2e8f0]">
              <strong className="font-semibold text-[#fff]">{benefit.discountLabel}</strong> · {benefit.title}
            </span>
          </span>
        </span>
        <span
          aria-hidden
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/[0.28] bg-black/[0.3] backdrop-blur-md transition-colors group-hover:bg-white/[0.14]"
        >
          <IconArrowRight size={17} strokeWidth={1.6} />
        </span>
      </span>
    </button>
  );
}
