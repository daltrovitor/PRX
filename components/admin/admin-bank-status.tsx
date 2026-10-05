// Hello World
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Notice, Tag } from "@/components/app/ui";
import { IconRefresh } from "@/components/icons/prx-icons";
import type { BankStatus } from "@/lib/bank/asaas/status";

/**
 * Situação do PRX BANK no topo do Financeiro: diz se o app fala com o Asaas
 * e, se não fala, qual variável ou passo está faltando.
 */
export function AdminBankStatus() {
  const [status, setStatus] = useState<BankStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/bank/status", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { status?: BankStatus; error?: string };
      if (!res.ok || !json.status) throw new Error(json.error || "Não foi possível verificar o PRX BANK.");
      setStatus(json.status);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sem conexão.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (alive) await load();
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  return (
    <section aria-labelledby="bank-status-title" className="glass space-y-4 rounded-3xl p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="bank-status-title" className="text-lg font-semibold tracking-[-0.02em] text-ink">
            PRX BANK · Asaas
          </h2>
          {status && <Tag tone={status.live ? "success" : "warning"}>{status.live ? "Dinheiro real ligado" : "Não está ligado"}</Tag>}
          {status?.version && <span className="font-mono text-[12px] text-muted-foreground">versão {status.version}</span>}
        </div>
        <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading} aria-label="Verificar de novo">
          <IconRefresh size={16} />
          {loading ? "Verificando…" : "Verificar"}
        </Button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {status && !status.live && (
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Enquanto algum item abaixo estiver com erro, o app não fala com o Asaas: as contas ficam em ativação e o Pix não sai. Corrija na Vercel (Environment Variables), faça o
          redeploy e clique em Verificar.
        </p>
      )}
      {status && (
        <ul className="divide-y divide-line">
          {status.checks.map((check) => (
            <li key={check.label} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <p className="text-[14px] text-ink">{check.label}</p>
                {check.hint && <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{check.hint}</p>}
              </div>
              <Tag tone={check.ok ? "success" : "warning"}>{check.ok ? "Ok" : "Corrigir"}</Tag>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
