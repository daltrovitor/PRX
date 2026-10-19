// Hello World
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, EmptyState, Notice, Tag } from "@/components/app/ui";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { IconChevronRight } from "@/components/icons/prx-icons";
import { COMPANY } from "@/lib/company";
import { SUPPORT_STATUS_LABEL, type SupportTicket } from "@/lib/support/types";
import { fetchSupport, supportWhen } from "@/components/app/support/support-api";
import { SupportNewSheet } from "@/components/app/support/support-new-sheet";
import { SupportThreadSheet } from "@/components/app/support/support-thread-sheet";

/**
 * SAC no PRX PASS: o membro abre uma solicitação, recebe o protocolo e
 * acompanha as respostas da equipe. Sem a migração aplicada, mostra o e-mail.
 */
export function SupportPanel() {
  const { showToast } = useConfirmToast();
  const [data, setData] = useState<{ available: boolean; tickets: SupportTicket[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await fetchSupport());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sem internet agora.");
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  // A conversa aberta é derivada da lista: atualizar a lista atualiza o painel.
  const opened = data?.tickets.find((t) => t.id === openId) ?? null;
  const upsert = (ticket: SupportTicket) =>
    setData((d) => (d ? { ...d, tickets: [ticket, ...d.tickets.filter((t) => t.id !== ticket.id)] } : d));

  return (
    <section aria-labelledby="support-title" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-xl">
          <h2 id="support-title" className="text-lg font-semibold tracking-[-0.02em] text-ink">
            Atendimento PRX
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Fale com a equipe sobre conta, benefícios, PRX BANK, ingressos ou pagamentos. Toda solicitação ganha um protocolo. Prefere e-mail? {COMPANY.supportEmail}
          </p>
        </div>
        {data?.available && <Button onClick={() => setCreating(true)}>Nova solicitação</Button>}
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      {!data && !error && <div role="status" aria-label="Carregando atendimento" className="h-32 rounded-3xl bg-surface" />}
      {data && !data.available && (
        <Notice tone="neutral">O atendimento pelo app está sendo ativado. Enquanto isso, escreva para {COMPANY.supportEmail} que a equipe responde por lá.</Notice>
      )}
      {data?.available && data.tickets.length === 0 && (
        <EmptyState title="Nenhuma solicitação" body="Quando você falar com o atendimento, as conversas e os protocolos ficam aqui." />
      )}
      {data?.available && data.tickets.length > 0 && (
        <ul className="space-y-2">
          {data.tickets.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setOpenId(t.id)}
                className="flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-3xl glass p-4 text-left glass-lift"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-ink">{t.subject}</p>
                  <p className="truncate text-[13px] text-muted-foreground">
                    {t.protocol} · {supportWhen(t.updatedAt)}
                  </p>
                </div>
                <Tag tone={t.status === "answered" ? "accent" : t.status === "resolved" ? "success" : "neutral"}>{SUPPORT_STATUS_LABEL[t.status]}</Tag>
                <IconChevronRight size={18} className="shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <SupportNewSheet
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(ticket) => {
          upsert(ticket);
          setCreating(false);
          setOpenId(ticket.id);
          showToast("success", `Solicitação aberta. Protocolo ${ticket.protocol}.`);
        }}
      />
      <SupportThreadSheet key={openId ?? "none"} ticket={opened} onClose={() => setOpenId(null)} onChanged={upsert} />
    </section>
  );
}
