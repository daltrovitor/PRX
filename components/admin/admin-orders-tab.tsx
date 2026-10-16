// Hello World
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, EmptyState, Input, Notice, Select, Tag, formatBRL } from "@/components/app/ui";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { Pager, formatDateTimeBr } from "@/components/admin/pager";
import { adminGet, adminPost, errorText } from "@/components/admin/admin-api";
import { CHECKOUT_METHOD_LABEL } from "@/lib/live/promo";
import { ORDER_STATUSES, ORDER_STATUS_LABEL, type LiveOrder } from "@/lib/checkout/types";

type Row = LiveOrder & { memberName: string; memberEmail: string; eventTitle: string };

/**
 * Pedidos do checkout de ingressos. "Pago, precisa de revisão" aparece quando
 * o dinheiro chegou mas o ingresso não pode ser emitido sozinho (reserva
 * expirada, duplicidade, responsável sem liberar): libere ou estorne.
 */
export function AdminOrdersTab() {
  const { confirmDelete, showToast } = useConfirmToast();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: Row[]; total: number; paymentsOnline: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      setData(await adminGet(`/api/admin/live/orders?page=${page}&pageSize=25${status ? `&status=${status}` : ""}`));
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, [page, status]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (alive) await load();
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  async function act(body: Record<string, unknown>, ok: string, confirm?: string) {
    if (confirm && !(await confirmDelete({ title: "Confirmar", message: confirm, confirmText: "Confirmar", type: "warning" }))) return;
    try {
      await adminPost("/api/admin/live/orders", body);
      showToast("success", ok);
      await load();
    } catch (err) {
      showToast("error", errorText(err));
    }
  }

  return (
    <section aria-labelledby="orders-title" className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="orders-title" className="text-lg font-semibold tracking-[-0.02em] text-ink sm:text-xl">
            Pedidos de ingresso
          </h2>
          <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">O ingresso só fica válido quando o pagamento é confirmado pelo parceiro de pagamentos. Cartão de débito não é oferecido (o Asaas não permite pela API).</p>
        </div>
        <Select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))} aria-label="Filtrar pedidos por situação" className="sm:max-w-xs">
          <option value="">Todas as situações</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {ORDER_STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {data && !data.paymentsOnline && <Notice tone="warning">Pagamentos desligados neste ambiente: o checkout não abre para os membros.</Notice>}
      {data === null ? (
        <div role="status" aria-label="Carregando" className="h-32 rounded-3xl bg-surface" />
      ) : data.items.length === 0 ? (
        <EmptyState title="Nenhum pedido" body="Os pagamentos de ingressos aparecem aqui." />
      ) : (
        <ul className="space-y-2">
          {data.items.map((o) => (
            <li key={o.id} className="glass-soft space-y-2 rounded-2xl px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-medium text-ink">
                    {o.memberName} · {o.eventTitle}
                  </p>
                  <p className="text-[13px] text-muted-foreground">
                    {CHECKOUT_METHOD_LABEL[o.paymentMethod]} · {formatBRL(o.amountTotal)}
                    {o.discountTotal > 0 ? ` (desconto ${formatBRL(o.discountTotal)})` : ""} · {formatDateTimeBr(o.createdAt)}
                    {o.paidAt ? ` · pago ${formatDateTimeBr(o.paidAt)}` : ""}
                  </p>
                  {o.reviewNote && <p className="text-[13px] text-muted-foreground">{o.reviewNote}</p>}
                </div>
                <Tag tone={o.status === "paid" ? "success" : o.status === "paid_needs_review" ? "warning" : "neutral"}>{ORDER_STATUS_LABEL[o.status]}</Tag>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => void act({ action: "sync", id: o.id }, "Pedido conferido com o Asaas.")}>
                  Conferir no Asaas
                </Button>
                {o.status === "paid_needs_review" && (
                  <>
                    <Input value={notes[o.id] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [o.id]: e.target.value }))} placeholder="Motivo (obrigatório)" aria-label="Motivo da decisão" className="max-w-xs" />
                    <Button size="sm" variant="secondary" onClick={() => void act({ action: "confirm", id: o.id, note: notes[o.id] ?? "" }, "Ingresso liberado.", "Liberar o ingresso deste pedido? Confira se ainda há vaga.")}>
                      Liberar ingresso
                    </Button>
                  </>
                )}
                {(o.status === "paid" || o.status === "paid_needs_review") && (
                  <Button size="sm" variant="danger" onClick={() => void act({ action: "refund", id: o.id, reason: notes[o.id] ?? "" }, "Estorno pedido ao Asaas.", "Estornar este pagamento? O ingresso é cancelado quando o estorno for confirmado.")}>
                    Estornar
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {data && data.total > 25 && <Pager page={page} pageSize={25} total={data.total} onPage={setPage} />}
    </section>
  );
}
