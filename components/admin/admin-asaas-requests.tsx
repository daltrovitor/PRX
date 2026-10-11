// Hello World
"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button, EmptyState, Field, Input, Notice, Select, Sheet, Tag } from "@/components/app/ui";
import { IconRefresh } from "@/components/icons/prx-icons";
import { ASAAS_OPERATIONS } from "@/lib/asaas/operations";
import { AUDIT_OUTCOMES, type AuditOutcome } from "@/lib/asaas/audit-outcomes";
import type { AuditRecord } from "@/lib/asaas/audit";
import type { RequestDetail } from "@/lib/bank/asaas/admin";
import { DimensionTag, JsonBlock, OUTCOME, Row, adminCall, when } from "@/components/admin/admin-asaas-shared";

type ListRow = Omit<AuditRecord, "requestBody" | "responseBody" | "query">;
interface ListResponse {
  rows: ListRow[];
  total: number | null;
  page: number;
  pageSize: number;
  userNotFound?: boolean;
}

const EMPTY = { user: "", operation: "", environment: "", outcome: "", status: "", from: "", to: "", q: "" };
type Filters = typeof EMPTY;

function query(filters: Filters, page: number): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (!value) continue;
    // datetime-local vira ISO com fuso.
    params.set(key, key === "from" || key === "to" ? new Date(value).toISOString() : value.trim());
  }
  params.set("page", String(page));
  return params.toString();
}

/** Registro de cada chamada ao Asaas: filtros, lista e detalhe com o significado de cada resposta. */
export function AdminAsaasRequests({ initialUser }: { initialUser: string | null }) {
  // "Ver chamadas deste membro" remonta o componente (key) já filtrado pelo membro.
  const [filters, setFilters] = useState<Filters>(() => ({ ...EMPTY, user: initialUser ?? "" }));
  const [applied, setApplied] = useState<Filters>(() => ({ ...EMPTY, user: initialUser ?? "" }));
  const [page, setPage] = useState(0);
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<RequestDetail | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await adminCall<ListResponse>(`/api/admin/bank/asaas/requests?${query(applied, page)}`));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sem conexão.");
    } finally {
      setLoading(false);
    }
  }, [applied, page]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (alive) await load();
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  async function open(id: string) {
    try {
      setDetail((await adminCall<{ detail: RequestDetail }>(`/api/admin/bank/asaas/requests?id=${id}`)).detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sem conexão.");
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setPage(0);
    setApplied(filters);
  }

  const set = (key: keyof Filters) => (value: string) => setFilters((f) => ({ ...f, [key]: value }));
  const pages = data?.total ? Math.ceil(data.total / data.pageSize) : 1;

  return (
    <section aria-labelledby="asaas-requests-title" className="glass space-y-4 rounded-3xl p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="asaas-requests-title" className="text-lg font-semibold tracking-[-0.02em] text-ink">
          Chamadas ao Asaas
        </h2>
        <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading} aria-label="Atualizar a lista de chamadas">
          <IconRefresh size={16} />
          {loading ? "Atualizando…" : "Atualizar"}
        </Button>
      </div>

      <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Membro (id ou e-mail)">{(id) => <Input id={id} value={filters.user} onChange={(e) => set("user")(e.target.value)} placeholder="ana@exemplo.com" />}</Field>
        <Field label="Operação">
          {(id) => (
            <Select id={id} value={filters.operation} onChange={(e) => set("operation")(e.target.value)}>
              <option value="">Todas</option>
              {ASAAS_OPERATIONS.map((op) => (
                <option key={op.name} value={op.name}>
                  {op.label} ({op.name})
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Resultado">
          {(id) => (
            <Select id={id} value={filters.outcome} onChange={(e) => set("outcome")(e.target.value)}>
              <option value="">Todos</option>
              {AUDIT_OUTCOMES.map((o) => (
                <option key={o} value={o}>
                  {OUTCOME[o].label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Ambiente">
          {(id) => (
            <Select id={id} value={filters.environment} onChange={(e) => set("environment")(e.target.value)}>
              <option value="">Todos</option>
              <option value="production">Produção</option>
              <option value="sandbox">Sandbox</option>
            </Select>
          )}
        </Field>
        <Field label="Código HTTP">{(id) => <Input id={id} inputMode="numeric" value={filters.status} onChange={(e) => set("status")(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="400" />}</Field>
        <Field label="De">{(id) => <Input id={id} type="datetime-local" value={filters.from} onChange={(e) => set("from")(e.target.value)} />}</Field>
        <Field label="Até">{(id) => <Input id={id} type="datetime-local" value={filters.to} onChange={(e) => set("to")(e.target.value)} />}</Field>
        <Field label="Buscar id" hint="Id interno, correlação, recurso ou pedido">
          {(id) => <Input id={id} value={filters.q} onChange={(e) => set("q")(e.target.value)} placeholder="acc_… / tr_… / uuid" />}
        </Field>
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
          <Button type="submit" size="sm">
            Filtrar
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilters(EMPTY);
              setApplied(EMPTY);
              setPage(0);
            }}
          >
            Limpar filtros
          </Button>
        </div>
      </form>

      {error && <Notice tone="error">{error}</Notice>}
      {data?.userNotFound && <Notice tone="warning">Membro não encontrado. Use o id (uuid) ou o e-mail do cadastro do PRX BANK.</Notice>}
      {data && data.rows.length === 0 && !data.userNotFound && (
        <EmptyState title="Nenhuma chamada registrada" body="Se a lista fica vazia com o banco ligado, aplique supabase/migrations/20261010_prx_asaas_audit.sql: sem a tabela, o registro fica só nos logs da Vercel ([prx-asaas])." />
      )}

      {data && data.rows.length > 0 && (
        <ul className="divide-y divide-line">
          {data.rows.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => void open(r.id)} className="flex min-h-12 w-full cursor-pointer flex-col gap-1 rounded-xl py-3 text-left hover:bg-surface/60 focus-visible:outline-2 focus-visible:outline-primary sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <span className="min-w-0">
                  <span className="block text-[14px] text-ink">
                    {ASAAS_OPERATIONS.find((o) => o.name === r.operation)?.label ?? r.operation}{" "}
                    <span className="font-mono text-[12px] text-muted-foreground">
                      {r.method} {r.path}
                    </span>
                  </span>
                  <span className="mt-0.5 block break-words text-[12px] text-muted-foreground">
                    {when(r.startedAt)} · {r.durationMs ?? "?"} ms · {r.attempts} tentativa(s) · {r.environment === "production" ? "produção" : "sandbox"}
                    {r.userId ? ` · membro ${r.userId.slice(0, 8)}` : ""}
                    {r.errorCode ? ` · ${r.errorCode}` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {r.httpStatus && <span className="font-mono text-[12px] text-muted-foreground">HTTP {r.httpStatus}</span>}
                  <Tag tone={OUTCOME[r.outcome as AuditOutcome].tone}>{OUTCOME[r.outcome as AuditOutcome].label}</Tag>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {data && pages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Anteriores
          </Button>
          <span className="text-[13px] text-muted-foreground">
            Página {page + 1} de {pages} · {data.total} chamadas
          </span>
          <Button variant="ghost" size="sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
            Próximas
          </Button>
        </div>
      )}

      <Sheet open={detail !== null} onClose={() => setDetail(null)} title="Chamada ao Asaas" description={detail ? `${detail.record.operation} · ${when(detail.record.startedAt)}` : undefined} size="lg">
        {detail && <RequestDetailView detail={detail} />}
      </Sheet>
    </section>
  );
}

function RequestDetailView({ detail }: { detail: RequestDetail }) {
  const { record, diagnosis, related, business } = detail;
  const sub = business.subaccount;
  return (
    <div className="space-y-5">
      <dl className="divide-y divide-line">
        <Row label="O que o PRX tentou">{diagnosis.attempt}</Row>
        <Row label="Endpoint">
          <span className="font-mono text-[13px]">{diagnosis.endpoint}</span> · chave {record.auth === "subaccount" ? "da subconta" : record.auth === "master" ? "da conta-pai" : "—"}
        </Row>
        <Row label="Estado HTTP">
          <Tag tone={OUTCOME[record.outcome].tone}>{OUTCOME[record.outcome].label}</Tag> {diagnosis.answer}
        </Row>
        <Row label="O que significa">{diagnosis.meaning}</Row>
        {diagnosis.cause && (
          <Row label={diagnosis.cause.certainty === "confirmado" ? "Causa (confirmada)" : "Provável causa (hipótese)"}>{diagnosis.cause.text}</Row>
        )}
        {diagnosis.next && <Row label="Próxima ação">{diagnosis.next}</Row>}
        <Row label="Duração e tentativas">
          {record.durationMs ?? "?"} ms · {record.attempts} tentativa(s) · resposta {record.responseReceived ? "recebida e registrada" : "não recebida"}
        </Row>
        <Row label="Identificadores">
          <span className="font-mono text-[12px]">
            registro {record.id}
            <br />
            correlação {record.correlationId}
            {record.asaasResourceId ? <><br />recurso Asaas {record.asaasResourceId}</> : null}
            {record.businessRef ? <><br />operação PRX {record.businessRef}</> : null}
          </span>
        </Row>
        {diagnosis.doc && (
          <Row label="Documentação">
            <a href={diagnosis.doc} target="_blank" rel="noopener noreferrer" className="cursor-pointer text-primary underline underline-offset-2">
              {diagnosis.doc.replace("https://", "")}
            </a>
          </Row>
        )}
      </dl>

      <div className="space-y-2 rounded-2xl border border-line p-4">
        <p className="text-[14px] font-semibold text-ink">Estado de negócio agora (separado do HTTP)</p>
        {!sub && !business.outgoing && <p className="text-[13px] text-muted-foreground">Sem subconta ou operação do PRX ligada a esta chamada.</p>}
        {sub && (
          <p className="flex flex-wrap items-center gap-2 text-[13px] text-ink">
            Conta no PRX: <Tag>{sub.status}</Tag> · aprovação geral <DimensionTag value={sub.generalStatus} /> · documentação <DimensionTag value={sub.documentationStatus} /> · chave guardada{" "}
            <Tag tone={sub.hasApiKey ? "success" : "warning"}>{sub.hasApiKey ? "sim" : "não"}</Tag>
          </p>
        )}
        {business.outgoing && (
          <p className="text-[13px] text-ink">
            Operação {business.outgoing.kind} de R$ {business.outgoing.amount.toFixed(2)}: <Tag>{business.outgoing.status}</Tag>
            {business.outgoing.outcomeUnknown ? " · resultado desconhecido (usar Conciliar)" : ""}
            {business.outgoing.failReason ? ` · ${business.outgoing.failReason}` : ""}
          </p>
        )}
      </div>

      <JsonBlock label="Enviado (limpo: sem chaves, dados pessoais mascarados)" value={record.query ? { query: record.query, corpo: record.requestBody } : record.requestBody} />
      <JsonBlock label="Resposta do Asaas (limpa)" value={record.responseBody} />

      {related.length > 1 && (
        <div className="space-y-1">
          <p className="text-[13px] font-medium text-ink">Outras chamadas da mesma ação</p>
          <ul className="space-y-1 text-[13px] text-muted-foreground">
            {related.map((r) => (
              <li key={r.id} className={r.id === record.id ? "font-medium text-ink" : undefined}>
                {when(r.startedAt)} · {r.operation} · {OUTCOME[r.outcome].label}
                {r.httpStatus ? ` (HTTP ${r.httpStatus})` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
