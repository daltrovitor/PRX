// Hello World
"use client";

import { useMemo } from "react";
import { BADGE_LIST, BADGE_TIERS, BADGE_TIER_LABEL, MAX_BADGES_PER_ITEM, PRX_COINS_PRINCIPLE, type BadgeCode } from "@/lib/badges/catalog";
import type { Benefit } from "@/lib/pass-data";
import type { Partner } from "@/lib/partners/types";

/**
 * Catálogo dos selos PRX para a equipe: nome, o que reconhece, onde pode ser
 * conquistado e quantos benefícios e parceiros já concedem cada um. A escolha
 * acontece no cadastro do benefício ou do parceiro.
 */
export function AdminBadgesTab({ benefits, partners }: { benefits: Benefit[]; partners: Partner[] }) {
  const usage = useMemo(() => {
    const count = (items: ReadonlyArray<{ badges?: BadgeCode[] }>) => {
      const map = new Map<BadgeCode, number>();
      items.forEach((item) => item.badges?.forEach((code) => map.set(code, (map.get(code) ?? 0) + 1)));
      return map;
    };
    return { benefits: count(benefits), partners: count(partners) };
  }, [benefits, partners]);

  return (
    <section aria-labelledby="badges-title" className="space-y-6">
      <header className="space-y-1.5">
        <h2 id="badges-title" className="text-xl font-semibold tracking-[-0.02em] text-ink">
          Selos PRX
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Escolha os selos no cadastro de cada benefício ou parceiro (até {MAX_BADGES_PER_ITEM} por item). O selo do parceiro vale para todos os benefícios dele.
        </p>
        <p className="text-sm font-medium text-ink">{PRX_COINS_PRINCIPLE}</p>
      </header>

      {BADGE_TIERS.map((tier) => (
        <div key={tier} className="space-y-3">
          <h3 className="text-[13px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{BADGE_TIER_LABEL[tier]}</h3>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {BADGE_LIST.filter((b) => b.tier === tier).map((badge) => {
              const inBenefits = usage.benefits.get(badge.code) ?? 0;
              const inPartners = usage.partners.get(badge.code) ?? 0;
              return (
                <li key={badge.code} className="flex gap-3 rounded-3xl glass p-4">
                  <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-card text-xl">
                    {badge.emoji}
                  </span>
                  <div className="min-w-0 space-y-1">
                    <p className="text-[15px] font-semibold tracking-[0.04em] text-ink">{badge.name}</p>
                    <p className="text-[13px] text-ink">{badge.recognizes}</p>
                    {badge.tagline && <p className="text-[13px] italic text-muted-foreground">{badge.tagline}</p>}
                    <p className="text-[12px] text-muted-foreground">Onde: {badge.earnedAt}</p>
                    <p className="text-[12px] text-muted-foreground">
                      {inBenefits} {inBenefits === 1 ? "benefício" : "benefícios"} · {inPartners} {inPartners === 1 ? "parceiro" : "parceiros"}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
