// Hello World
"use client";

import { Button, EmptyState, Notice, Segmented, Tag } from "@/components/app/ui";
import { formatPhone } from "@/lib/notifications/format";
import { formatShort } from "@/lib/resenha/format";
import { REQUEST_STATUS_LABEL, type Decision, type InsiderRequestView } from "@/lib/resenha/types";

export type Tab = "pending" | "approved" | "rejected";

const EMPTY: Record<Tab, { title: string; body: string }> = {
  pending: { title: "Nenhum pedido esperando", body: "Quando alguém pedir acesso pelo seu link, aparece aqui." },
  approved: { title: "Ninguém na lista ainda", body: "Quem você liberar aparece aqui, com a marca de quem já entrou na festa." },
  rejected: { title: "Nada por aqui", body: "Quem receber “ainda não” fica guardado aqui. Dá para liberar depois." },
};

function Row({ request, busy, disabled, passesLeft, onDecide }: { request: InsiderRequestView; busy: boolean; disabled: boolean; passesLeft: number; onDecide: (action: Decision) => void }) {
  const phone = request.whatsapp.replace(/\D/g, "");
  const noPass = passesLeft <= 0;
  return (
    <li className="glass-soft flex flex-col gap-4 rounded-3xl p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="min-w-0 space-y-1">
        <p className="flex flex-wrap items-center gap-2 text-[16px] font-medium text-ink">
          <span className="truncate">{request.name}</span>
          {request.status === "approved" && request.checkedIn && <Tag tone="success">Entrou</Tag>}
          {request.status === "revoked" && <Tag tone="warning">{REQUEST_STATUS_LABEL.revoked}</Tag>}
        </p>
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
          <span>{request.age} anos</span>
          {request.instagram && <span>@{request.instagram}</span>}
          {phone && (
            <a href={`https://wa.me/55${phone}`} target="_blank" rel="noopener noreferrer" className="cursor-pointer text-ink underline">
              {formatPhone(phone)}
            </a>
          )}
          <span>pediu {formatShort(request.createdAt)}</span>
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {request.status === "pending" && (
          <>
            <Button size="sm" disabled={busy || disabled || noPass} title={noPass ? "Seus PASSes acabaram" : undefined} onClick={() => onDecide("approve")}>
              {busy ? "Salvando…" : "Liberar"}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy || disabled} onClick={() => onDecide("reject")}>
              Ainda não
            </Button>
          </>
        )}
        {request.status === "approved" && !request.checkedIn && (
          <Button
            size="sm"
            variant="danger"
            disabled={busy || disabled}
            onClick={() => {
              if (window.confirm(`Remover ${request.name} da lista? O ingresso dela é cancelado e o PASS volta para você.`)) onDecide("revoke");
            }}
          >
            Remover da lista
          </Button>
        )}
        {(request.status === "rejected" || request.status === "revoked") && (
          <Button size="sm" variant="secondary" disabled={busy || disabled || noPass} title={noPass ? "Seus PASSes acabaram" : undefined} onClick={() => onDecide("approve")}>
            Liberar mesmo assim
          </Button>
        )}
      </div>
    </li>
  );
}

/** Pedidos do link do Insider em três abas: pendentes, na lista e "ainda não". */
export function RequestList({
  tab,
  onTab,
  tabs,
  loading,
  error,
  busyId,
  passesLeft,
  onDecide,
  onRefresh,
}: {
  tab: Tab;
  onTab: (tab: Tab) => void;
  tabs: Record<Tab, InsiderRequestView[]>;
  loading: boolean;
  error: string | null;
  busyId: string | null;
  passesLeft: number;
  onDecide: (id: string, action: Decision) => void;
  onRefresh: () => void;
}) {
  const rows = tabs[tab];
  return (
    <section className="space-y-4" aria-label="Pedidos">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Pedidos"
          value={tab}
          onChange={onTab}
          options={[
            { value: "pending", label: "Pendentes", count: tabs.pending.length },
            { value: "approved", label: "Na lista", count: tabs.approved.length },
            { value: "rejected", label: "Ainda não", count: tabs.rejected.length },
          ]}
        />
        <Button variant="ghost" size="sm" onClick={onRefresh}>
          Atualizar
        </Button>
      </div>
      {passesLeft <= 0 && tab !== "approved" && <Notice tone="warning">Seus PASSes acabaram. Remova alguém da lista para liberar outro nome.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      {loading ? (
        <p className="text-[15px] text-muted-foreground">Carregando pedidos…</p>
      ) : rows.length === 0 ? (
        <EmptyState title={EMPTY[tab].title} body={EMPTY[tab].body} />
      ) : (
        <ul className="space-y-3">
          {rows.map((request) => (
            <Row key={request.id} request={request} busy={busyId === request.id} disabled={busyId !== null} passesLeft={passesLeft} onDecide={(action) => onDecide(request.id, action)} />
          ))}
        </ul>
      )}
    </section>
  );
}
