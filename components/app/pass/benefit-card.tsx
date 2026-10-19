// Hello World
"use client";

import { useState } from "react";
import { PrxImage } from "@/components/ui/prx-image";
import type { Benefit } from "@/lib/pass-data";
import { BadgeChips } from "@/components/app/pass/badge-chips";
import { cn } from "@/lib/utils";

interface BenefitCardProps {
  benefit: Benefit;
  redeemed: boolean;
  locked: boolean;
  onSelect: (benefit: Benefit) => void;
}

function partnerInitials(name: string): string {
  return (name || "PRX")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function BenefitCard({ benefit, redeemed, locked, onSelect }: BenefitCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const src = !imageFailed ? benefit.partnerBanner?.trim() || benefit.partnerLogo?.trim() : "";

  return (
    <button
      type="button"
      onClick={() => onSelect(benefit)}
      className="group flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-3xl glass p-2 text-left glass-lift"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-card">
        {src ? (
          <PrxImage
            src={src}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <span aria-hidden className="absolute inset-0 flex items-center justify-center text-6xl font-semibold tracking-[-0.05em] text-ink/15">
            {partnerInitials(benefit.partnerName)}
          </span>
        )}
        <span className="absolute left-3 top-3 rounded-full bg-card px-3 py-1 text-[15px] font-semibold tracking-[-0.02em] text-ink shadow-sm">
          {benefit.discountLabel}
        </span>
        {redeemed && <span className="absolute bottom-3 right-3 rounded-full bg-primary px-3 py-1 text-[12px] font-semibold text-white">Voucher ativo</span>}
        {!redeemed && (benefit.pointsCost ?? 0) > 0 && (
          <span className="absolute bottom-3 right-3 rounded-full bg-card px-3 py-1 text-[12px] font-semibold text-ink shadow-sm">
            {(benefit.pointsCost ?? 0).toLocaleString("pt-BR")} coins
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col justify-between gap-4 px-3 pb-3 pt-3.5">
        <div>
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 truncate text-[13px] text-muted-foreground">
              {benefit.partnerName} · {benefit.partnerLocation}
            </p>
            {/* Mídia paga identificada ao membro (cláusula 8.6 do Termo de Parceria). */}
            {benefit.sponsored && <span className="shrink-0 rounded-full bg-card px-2 text-[12px] font-medium leading-5 text-muted-foreground">Patrocinado</span>}
          </div>
          <p className="mt-1 text-base font-semibold leading-snug tracking-[-0.01em] text-ink">{benefit.title}</p>
          <BadgeChips codes={benefit.badges} className="mt-2.5" />
        </div>
        <span
          className={cn(
            "inline-flex min-h-9 w-fit items-center rounded-full px-4 text-[13px] font-medium",
            locked ? "bg-card text-muted-foreground" : "bg-ink text-background"
          )}
        >
          {locked ? `Libera no nível ${benefit.minPrxLevel}` : redeemed ? "Abrir voucher" : "Usar benefício"}
        </span>
      </div>
    </button>
  );
}
