// Hello World
"use client";

import { BADGE_LIST, BADGE_TIERS, BADGE_TIER_LABEL, MAX_BADGES_PER_ITEM, type BadgeCode } from "@/lib/badges/catalog";
import { cn } from "@/lib/utils";

/**
 * Escolha dos selos que um benefício ou parceiro concede. Botões de alternância
 * (aria-pressed) agrupados em base, especiais e progressão; no limite, os não
 * escolhidos ficam travados até a equipe tirar um.
 */
export function BadgePicker({
  value,
  onChange,
  hint,
  className,
}: {
  value: readonly BadgeCode[];
  onChange: (codes: BadgeCode[]) => void;
  hint?: string;
  className?: string;
}) {
  const full = value.length >= MAX_BADGES_PER_ITEM;
  const toggle = (code: BadgeCode) => onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code]);

  return (
    <fieldset className={cn("min-w-0 space-y-3", className)}>
      <legend className="text-[15px] font-semibold text-ink">Selos PRX</legend>
      <p className="text-[13px] text-muted-foreground">
        {hint ?? "O membro vê os selos no benefício."} Até {MAX_BADGES_PER_ITEM} ({value.length} escolhido{value.length === 1 ? "" : "s"}).
      </p>
      {BADGE_TIERS.map((tier) => (
        <div key={tier} className="space-y-2">
          <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{BADGE_TIER_LABEL[tier]}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {BADGE_LIST.filter((b) => b.tier === tier).map((badge) => {
              const on = value.includes(badge.code);
              return (
                <button
                  key={badge.code}
                  type="button"
                  aria-pressed={on}
                  disabled={!on && full}
                  onClick={() => toggle(badge.code)}
                  className={cn(
                    "flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                    on ? "border-primary bg-primary/10" : "border-transparent bg-surface hover:border-input"
                  )}
                >
                  <span aria-hidden className="text-lg">
                    {badge.emoji}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold tracking-[0.04em] text-ink">{badge.name}</span>
                    <span className="block text-[12px] leading-snug text-muted-foreground">{badge.recognizes}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </fieldset>
  );
}
