// Hello World
"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState, Notice, Segmented, Tag } from "@/components/app/ui";
import { Pager } from "@/components/admin/pager";
import { AdminSupportThread } from "@/components/admin/admin-support-thread";
import { SUPPORT_STATUSES, SUPPORT_STATUS_LABEL, SUPPORT_TOPIC_LABEL, type SupportStatus, type SupportTicket } from "@/lib/support/types";

const PAGE_SIZE = 30;
const POLL_MS = 30_000;
type Filter = SupportStatus | "all";
const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Fila do SAC: solicitações dos membros, mais recentes primeiro, com a conversa e a resposta da equipe. */
export function AdminSupportTab() {
  const [filter, setFilter] = useState<Filter>("open");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ available: boolean; migration?: string; items: SupportTicket[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A conversa aberta fica guardada: mudar o status não a tira da tela antes de a equipe fechar.
  const [opened, setOpened] = useState<SupportTicket | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page - 1) });
      if (filter !== "all") params.set("status", filter);
      const res = await fetch(`/api/admin/support?${params}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { available?: boolean; migration?: string; items?: SupportTicket[]; total?: number; error?: string };
      if (!res.ok || !json.items) throw new Error(json.error || "Não foi possível carregar o atendimento.");
      setData({ available: json.available !== false, migration: json.migration, items: json.items, total: json.total ?? 0 });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sem internet agora.");
    }
  }, [filter, page]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  return (
    <section aria-labelledby="support-admin-title" className="space-y-5">
      <header className="space-y-1.5">
        <h2 id="support-admin-title" className="text-xl font-semibold tracking-[-0.02em] text-ink">
          SAC
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">Solicitações abertas pelos membros no PRX PASS. Cada uma tem protocolo; a resposta vai para o app e o membro recebe um aviso por e-mail.</p>
      </header>

      <Segmented
        label="Filtrar solicitações"
        value={filter}
        onChange={(value) => {
          setFilter(value);
          setPage(1);
        }}
        options={[{ value: "all" as Filter, label: "Todas" }, ...SUPPORT_STATUSES.map((s) => ({ value: s as Filter, label: SUPPORT_STATUS_LABEL[s] }))]}
      />

      {error && <Notice tone="error">{error}</Notice>}
      {data && !data.available && <Notice tone="warning">Falta aplicar a migração supabase/migrations/{data.migration} no Supabase para o SAC funcionar.</Notice>}
      {!data && !error && <div role="status" aria-label="Carregando atendimento" className="h-40 rounded-3xl bg-surface" />}
      {data?.available && data.items.length === 0 && <EmptyState title="Nada por aqui" body="Nenhuma solicitação com este status." />}

      {data?.available && data.items.length > 0 && (
        <div className="glass overflow-x-auto rounded-3xl">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-surface text-[13px] text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">Protocolo</th>
                <th scope="col" className="px-4 py-3 font-medium">Membro</th>
                <th scope="col" className="px-4 py-3 font-medium">Assunto</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Atualizada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.items.map((t) => (
                <tr key={t.id} className="transition-colors hover:bg-surface/60">
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => setOpened(t)} className="min-h-12 cursor-pointer font-medium text-primary underline-offset-4 hover:underline">
                      {t.protocol}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-ink">{t.userName}</p>
                    <p className="text-[13px] text-muted-foreground">{t.userEmail}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-ink">{t.subject}</p>
                    <p className="text-[13px] text-muted-foreground">{SUPPORT_TOPIC_LABEL[t.topic]} · {t.messages.length} {t.messages.length === 1 ? "mensagem" : "mensagens"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Tag tone={t.status === "open" ? "warning" : t.status === "resolved" ? "success" : "neutral"}>{SUPPORT_STATUS_LABEL[t.status]}</Tag>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{when(t.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data?.available && data.total > PAGE_SIZE && <Pager page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />}

      <AdminSupportThread
        key={opened?.id ?? "none"}
        ticket={opened}
        onClose={() => setOpened(null)}
        onSaved={(ticket) => {
          setOpened(ticket);
          setData((d) => (d ? { ...d, items: d.items.map((t) => (t.id === ticket.id ? ticket : t)) } : d));
        }}
      />
    </section>
  );
}
