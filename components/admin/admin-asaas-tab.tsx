// Hello World
"use client";

import { useState } from "react";
import { Button, Notice } from "@/components/app/ui";
import { AdminAsaasMember } from "@/components/admin/admin-asaas-member";
import { AdminAsaasRequests } from "@/components/admin/admin-asaas-requests";
import { JsonBlock, adminCall, postJson } from "@/components/admin/admin-asaas-shared";

type BulkAction = "reconcile" | "sync_webhooks" | "sync_webhooks_reactivate";

const BULK: ReadonlyArray<{ action: BulkAction; label: string; body: string }> = [
  {
    action: "reconcile",
    label: "Conciliar agora",
    body: "Reprocessa eventos que falharam, consulta a situação das contas em análise, envia documentos pendentes, religa aberturas travadas (pelo CPF) e confere Pix e contas sem desfecho. Só consulta: nada de dinheiro é repetido.",
  },
  {
    action: "sync_webhooks",
    label: "Atualizar webhooks das subcontas",
    body: "Grava em cada subconta a URL, os eventos de situação cadastral e o token atual. Subcontas criadas antes da troca do token (08/10) recusavam os avisos do Asaas.",
  },
  {
    action: "sync_webhooks_reactivate",
    label: "Atualizar e reativar filas",
    body: "Igual ao anterior e religa as filas que o Asaas interrompeu depois de 15 falhas. Os eventos parados são reenviados e processados sem duplicar.",
  },
];

/**
 * Aba "Asaas" do admin: diagnóstico do membro, conciliação e registro de toda
 * chamada à API do Asaas (o que foi enviado, o que voltou e o que significa).
 */
export function AdminAsaasTab() {
  const [focusUser, setFocusUser] = useState<string | null>(null);
  const [busy, setBusy] = useState<BulkAction | null>(null);
  const [report, setReport] = useState<{ action: BulkAction; report: unknown } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: BulkAction) {
    setBusy(action);
    setError(null);
    try {
      const res = await adminCall<{ report: unknown }>("/api/admin/bank/asaas/reconcile", postJson({ action }));
      setReport({ action, report: res.report });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sem internet agora. Confira sua conexão e tente de novo.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby="asaas-bulk-title" className="glass space-y-4 rounded-3xl p-5 sm:p-6">
        <h2 id="asaas-bulk-title" className="text-lg font-semibold tracking-[-0.02em] text-ink">
          Conciliação com o Asaas
        </h2>
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {BULK.map((b) => (
            <li key={b.action} className="flex flex-col justify-between gap-3 rounded-2xl border border-line p-4">
              <p className="text-[13px] leading-relaxed text-muted-foreground">{b.body}</p>
              <Button size="sm" variant={b.action === "reconcile" ? "primary" : "secondary"} disabled={busy !== null} onClick={() => void run(b.action)}>
                {busy === b.action ? "Executando…" : b.label}
              </Button>
            </li>
          ))}
        </ul>
        {error && <Notice tone="error">{error}</Notice>}
        {report && <JsonBlock label={`Resultado: ${BULK.find((b) => b.action === report.action)?.label}`} value={report.report} />}
      </section>

      <AdminAsaasMember onShowRequests={setFocusUser} />
      <AdminAsaasRequests key={focusUser ?? "todos"} initialUser={focusUser} />
    </div>
  );
}
