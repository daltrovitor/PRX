// Hello World
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Notice, Tag } from "@/components/app/ui";
import { IconRefresh } from "@/components/icons/prx-icons";
import type { BankStatus } from "@/lib/bank/asaas/status";
import type { AsaasRuntime } from "@/lib/asaas/runtime";

const KEY_KIND: Record<AsaasRuntime["keyKind"], string> = {
  production: "produção ($aact_prod_)",
  sandbox: "sandbox ($aact_hmlg_)",
  legacy: "formato antigo, sem ambiente no prefixo",
  missing: "nenhuma",
  invalid: "não é uma chave do Asaas",
};

/** O que este deploy lê de fato: compare com a Vercel (ambiente, commit e os 4 últimos caracteres da chave). */
function RuntimeLine({ runtime }: { runtime: AsaasRuntime }) {
  const keyMatches = runtime.keyKind === runtime.environment || runtime.keyKind === "legacy";
  return (
    <dl className="grid gap-x-4 gap-y-1 rounded-2xl border border-line bg-surface/50 p-4 text-[13px] leading-relaxed sm:grid-cols-[auto_1fr]">
      <dt className="text-muted-foreground">Deploy</dt>
      <dd className="min-w-0 break-words font-mono text-ink">
        {runtime.vercelEnv ?? "fora da Vercel"}
        {runtime.commit ? ` · ${runtime.commit}` : ""}
      </dd>
      <dt className="text-muted-foreground">Chave lida</dt>
      <dd className={keyMatches ? "min-w-0 break-words text-ink" : "min-w-0 break-words font-medium text-ink"}>
        {KEY_KIND[runtime.keyKind]}
        {runtime.keyTail ? ` · termina em ${runtime.keyTail}` : ""} · ASAAS_ENVIRONMENT={runtime.environment}
        {!keyMatches && runtime.keyKind !== "missing" && runtime.keyKind !== "invalid" ? " · não combinam" : ""}
      </dd>
      <dt className="text-muted-foreground">Chamadas vão para</dt>
      <dd className="min-w-0 break-all font-mono text-ink">{runtime.apiBaseUrl ?? "nenhum lugar (integração desligada)"}</dd>
      <dt className="text-muted-foreground">Webhooks</dt>
      <dd className="min-w-0 break-all font-mono text-ink">
        {runtime.webhookEvents ?? "—"}
        <br />
        {runtime.webhookValidateWithdraw ?? "—"}
      </dd>
    </dl>
  );
}

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
      setError(err instanceof Error ? err.message : "Sem internet agora. Confira sua conexão e tente de novo.");
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
      {status?.runtime && <RuntimeLine runtime={status.runtime} />}
      {status?.accounts && (
        <p className="rounded-2xl border border-line bg-surface/50 p-4 text-[13px] leading-relaxed text-muted-foreground">
          <span className="font-semibold text-ink">Contas abertas no banco parceiro:</span> {status.accounts.production} em produção e {status.accounts.sandbox} no sandbox. Eventos
          recebidos: {status.accounts.events}. Se produção está em 0, nenhum dado de cliente foi enviado ao banco parceiro de verdade. O histórico de cada chamada fica no painel do
          Asaas, em Integrações → Logs de Requisições.
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
