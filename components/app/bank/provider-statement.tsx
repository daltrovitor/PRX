// Hello World
"use client";

import { useState } from "react";
import { Button, Notice, formatBRL } from "@/components/app/ui";
import { ProviderDisclosure } from "@/components/app/bank/provider-disclosure";
import { cn } from "@/lib/utils";

/**
 * Extrato oficial do banco parceiro (GET /api/bank/statement), paginado e
 * carregado só quando o membro pede: inclui tarifas e estornos que o extrato
 * resumido do app não mostra.
 */

interface StatementItem {
  id: string;
  direction: "in" | "out";
  amount: number;
  balance: number | null;
  label: string;
  description: string;
  date: string;
}

const PAGE = 30;
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

export function ProviderStatement({ hidden }: { hidden: boolean }) {
  const [items, setItems] = useState<StatementItem[] | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (nextOffset === null) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/bank/statement?offset=${nextOffset}&limit=${PAGE}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { items?: StatementItem[]; nextOffset?: number | null; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Não foi possível carregar o extrato.");
      setItems((current) => [...(current ?? []), ...(json.items ?? [])]);
      setNextOffset(json.nextOffset ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar o extrato.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Extrato oficial do PRX BANK" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink">Extrato oficial</h2>
        {items === null && (
          <Button variant="secondary" size="sm" className="min-h-12" disabled={busy} onClick={() => void load()}>
            {busy ? "Carregando…" : "Ver extrato completo"}
          </Button>
        )}
      </div>

      {items !== null &&
        (items.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">Nenhum lançamento no PRX BANK ainda.</p>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((tx) => (
              <li key={tx.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-medium text-ink">{tx.label}</p>
                  <p className="truncate text-[13px] text-muted-foreground">
                    {day(tx.date)}
                    {tx.description && tx.description !== tx.label ? ` · ${tx.description}` : ""}
                  </p>
                </div>
                <p className={cn("shrink-0 font-mono text-[15px]", tx.direction === "in" ? "text-success" : "text-ink")}>
                  {hidden ? "••••" : `${tx.direction === "in" ? "+" : "−"}${formatBRL(tx.amount)}`}
                </p>
              </li>
            ))}
          </ul>
        ))}

      {items !== null && nextOffset !== null && (
        <Button variant="ghost" size="sm" className="min-h-12" disabled={busy} onClick={() => void load()}>
          {busy ? "Carregando…" : "Carregar mais"}
        </Button>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      <ProviderDisclosure />
    </section>
  );
}
