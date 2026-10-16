// Hello World
"use client";

import { useEffect, useState } from "react";
import { Tag } from "@/components/app/ui";
import type { MemberBehavior } from "@/lib/behaviors/service";

const integer = new Intl.NumberFormat("pt-BR");

const STATUS: Record<MemberBehavior["result"], { label: string; tone: "success" | "warning" | "neutral" | "accent" }> = {
  identified: { label: "Identificado", tone: "success" },
  not_identified: { label: "Ainda não", tone: "neutral" },
  unverifiable: { label: "Não verificável", tone: "warning" },
  pending: { label: "Aguardando avaliação", tone: "neutral" },
};

/**
 * Comportamentos verificados com os pagamentos da conta PRX BANK. Nada de
 * relato: a PRX confere sozinha e mostra o resultado (ou "não verificável"
 * quando não tem os dados).
 */
export function MemberBehaviors() {
  const [items, setItems] = useState<MemberBehavior[] | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/behaviors", { cache: "no-store" });
        const json = (await res.json().catch(() => ({}))) as { behaviors?: MemberBehavior[] };
        if (alive) setItems(res.ok ? (json.behaviors ?? []) : []);
      } catch {
        if (alive) setItems([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!items || items.length === 0) return null;
  const positives = items.filter((b) => b.polarity === "positive");
  const negatives = items.filter((b) => b.polarity === "negative");

  const list = (rows: MemberBehavior[]) => (
    <ul className="divide-y divide-line rounded-2xl bg-surface px-4">
      {rows.map((b) => (
        <li key={b.ruleId} className="flex items-start justify-between gap-4 py-3.5">
          <div className="min-w-0">
            <p className="text-[15px] font-medium text-ink">{b.name}</p>
            {b.description && <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{b.description}</p>}
            <p className="mt-1 text-[12px] text-muted-foreground">
              Período de {b.observationDays} dia(s) · {b.underReview ? "em revisão pela equipe" : b.reason}
            </p>
          </div>
          <div className="shrink-0 space-y-1 text-right">
            <Tag tone={STATUS[b.result].tone}>{STATUS[b.result].label}</Tag>
            {(b.coins > 0 || b.xp > 0) && (
              <p className="text-[12px] font-medium text-ink">
                {b.coins > 0 && <span className="block text-primary">+{integer.format(b.coins)} coins</span>}
                {b.xp > 0 && <span className="block">+{integer.format(b.xp)} XP</span>}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <section aria-labelledby="points-behaviors" className="space-y-3">
      <div>
        <h3 id="points-behaviors" className="text-[13px] font-semibold text-ink">
          Comportamentos verificados
        </h3>
        <p className="text-[12px] text-muted-foreground">A PRX confere com os pagamentos da sua conta PRX BANK. Você não precisa enviar nada.</p>
      </div>
      {positives.length > 0 && list(positives)}
      {negatives.length > 0 && (
        <div className="space-y-2">
          <p className="text-[12px] font-medium text-muted-foreground">A evitar</p>
          {list(negatives)}
        </div>
      )}
    </section>
  );
}
