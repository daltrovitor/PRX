// Hello World
"use client";

import { useEffect, useState } from "react";
import { EmptyState, Notice, Select, Tag } from "@/components/app/ui";
import { Pager, formatDateTimeBr } from "@/components/admin/pager";
import type { AuditEntry } from "@/lib/admin/audit";
import type { ValidationLogEntry } from "@/lib/validation/log";

/**
 * Registros para conferência: ações críticas do admin (auditoria) e toda
 * leitura da portaria/balcão, aceita ou recusada. Paginação no servidor.
 */

type Log = "admin" | "validations";

interface PageData<T> {
  entries: T[];
  total: number;
  page: number;
  pageSize: number;
}

const ROLE: Record<string, string> = { admin: "Admin", partner: "Parceiro", staff: "Equipe" };

export function AdminLogsTab({ log }: { log: Log }) {
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState("");
  const [outcome, setOutcome] = useState("");
  const [data, setData] = useState<PageData<AuditEntry | ValidationLogEntry> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ log, page: String(page), pageSize: "30" });
    if (log === "validations" && kind) params.set("kind", kind);
    if (log === "validations" && outcome) params.set("outcome", outcome);
    fetch(`/api/admin/audit?${params}`, { cache: "no-store" })
      .then((r) => r.json() as Promise<PageData<AuditEntry | ValidationLogEntry> & { error?: string }>)
      .then((json) => {
        if (!active) return;
        if (Array.isArray(json.entries)) {
          setData(json);
          setError(null);
        } else setError(json.error || "Não foi possível carregar o registro.");
      })
      .catch(() => active && setError("Sem conexão com o servidor."));
    return () => {
      active = false;
    };
  }, [log, page, kind, outcome]);

  return (
    <section aria-labelledby={`log-${log}`} className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id={`log-${log}`} className="font-display text-2xl font-semibold tracking-[-0.03em] text-ink">
            {log === "admin" ? "Auditoria do admin" : "Registro de validações"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {log === "admin" ? "Quem fez o quê: eventos, pagamentos, cupons, equipe, papéis e Founders." : "Toda leitura da portaria e do balcão, aceita ou recusada, com operador e horário."}
          </p>
        </div>
        {log === "validations" && (
          <div className="grid grid-cols-2 gap-2">
            <Select
              aria-label="Tipo"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Ingressos e vouchers</option>
              <option value="ticket">Ingressos</option>
              <option value="voucher">Vouchers</option>
            </Select>
            <Select
              aria-label="Resultado"
              value={outcome}
              onChange={(e) => {
                setOutcome(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Aceitas e recusadas</option>
              <option value="accepted">Aceitas</option>
              <option value="refused">Recusadas</option>
            </Select>
          </div>
        )}
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      {!data ? (
        !error && <div role="status" aria-label="Carregando registro" className="h-40 rounded-3xl bg-surface" />
      ) : data.entries.length === 0 ? (
        <EmptyState title="Nada registrado ainda" body="Os registros aparecem aqui assim que houver ações (depois da migração 20261011 no banco)." />
      ) : (
        <ul className="space-y-2">
          {data.entries.map((entry) =>
            "actorId" in entry ? (
              <li key={entry.id} className="rounded-3xl glass-soft px-4 py-3">
                <p className="text-sm text-ink">{entry.summary}</p>
                <p className="text-[12px] text-muted-foreground">
                  {formatDateTimeBr(entry.createdAt)} · {entry.actorEmail || entry.actorId} · <span className="font-mono">{entry.action}</span>
                </p>
              </li>
            ) : (
              <li key={entry.id} className="flex items-start justify-between gap-3 rounded-3xl glass-soft px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm text-ink">
                    <span className="font-mono">{entry.code || "—"}</span> · {entry.kind === "ticket" ? "Ingresso" : "Voucher"} · {entry.action === "confirm" ? "baixa/entrada" : "consulta"}
                  </p>
                  {entry.reason && <p className="text-[13px] text-muted-foreground">{entry.reason}</p>}
                  <p className="text-[12px] text-muted-foreground">
                    {formatDateTimeBr(entry.createdAt)} · {entry.operatorName} ({ROLE[entry.operatorRole] ?? entry.operatorRole})
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Tag tone={entry.outcome === "accepted" ? "success" : "warning"}>{entry.outcome === "accepted" ? "Aceita" : "Recusada"}</Tag>
                  {entry.isTest && <Tag>Teste</Tag>}
                </div>
              </li>
            )
          )}
        </ul>
      )}
      {data && data.total > data.pageSize && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
    </section>
  );
}
