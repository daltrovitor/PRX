// Hello World
"use client";

import type { ReactNode } from "react";
import { Tag } from "@/components/app/ui";
import type { AuditOutcome } from "@/lib/asaas/audit-outcomes";

/** Utilitários das telas do Asaas no admin (registro de chamadas e diagnóstico do membro). */

export async function adminCall<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error || `Falha (${res.status}).`);
  return json;
}

export const postJson = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";

export const OUTCOME: Record<AuditOutcome, { label: string; tone: "success" | "warning" | "neutral" | "ink" }> = {
  success: { label: "Sucesso", tone: "success" },
  http_error: { label: "Erro HTTP", tone: "warning" },
  rate_limited: { label: "Limite (429)", tone: "warning" },
  timeout: { label: "Sem resposta (tempo)", tone: "warning" },
  network_error: { label: "Sem resposta (rede)", tone: "warning" },
  invalid_response: { label: "Formato inesperado", tone: "warning" },
  not_sent: { label: "Não enviado", tone: "neutral" },
  pending: { label: "Em andamento", tone: "ink" },
};

/** Situação de cada dimensão cadastral no Asaas. */
export function DimensionTag({ value }: { value: string | null | undefined }) {
  if (!value) return <Tag>Sem informação</Tag>;
  const label: Record<string, string> = { APPROVED: "Aprovado", REJECTED: "Recusado", PENDING: "Pendente", AWAITING_APPROVAL: "Em análise" };
  return <Tag tone={value === "APPROVED" ? "success" : value === "REJECTED" ? "warning" : "neutral"}>{label[value] ?? value}</Tag>;
}

/** Corpo já limpo pelo servidor (sem chaves, dados pessoais mascarados). */
export function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-[13px] font-medium text-ink">{label}</p>
      <pre className="max-h-72 overflow-auto rounded-2xl border border-line bg-surface/60 p-3 font-mono text-[12px] leading-relaxed text-ink">
        {value === null || value === undefined ? "—" : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-start sm:gap-4">
      <dt className="shrink-0 text-[13px] text-muted-foreground sm:w-44">{label}</dt>
      <dd className="min-w-0 break-words text-[14px] text-ink">{children}</dd>
    </div>
  );
}
