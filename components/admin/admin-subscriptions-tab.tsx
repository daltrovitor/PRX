// Hello World
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, EmptyState, Notice, Select, Sheet, Tag, Textarea } from "@/components/app/ui";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { Pager, formatDateTimeBr } from "@/components/admin/pager";
import { AdminPlanForm } from "@/components/admin/admin-plan-form";
import { adminGet, adminPost, errorText } from "@/components/admin/admin-api";
import { BILLING_TYPE_LABEL, CYCLE_LABEL } from "@/lib/billing/gateway";
import { PLAN_STATUS_LABEL, SUBSCRIPTION_STATUSES, SUBSCRIPTION_STATUS_LABEL, type MemberSubscription, type SubscriptionEvent, type SubscriptionPayment, type SubscriptionPlan } from "@/lib/subscriptions/types";

type Sub = MemberSubscription & { memberName: string; memberEmail: string };
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Assinaturas: planos criados aqui (nada fixo no código) e os assinantes, com
 * pagamentos e histórico. "Conferir no provedor de pagamentos" corrige divergências quando um
 * aviso do provedor de pagamentos se perdeu.
 */
export function AdminSubscriptionsTab({ view }: { view: "plans" | "subscribers" }) {
  const { confirmDelete, showToast } = useConfirmToast();
  const [data, setData] = useState<{ plans: SubscriptionPlan[]; items: Sub[]; total: number; paymentsOnline: boolean } | null>(null);
  const [status, setStatus] = useState("");
  const [planId, setPlanId] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<SubscriptionPlan | null | "new">(null);
  const [detail, setDetail] = useState<{ subscription: Sub; payments: SubscriptionPayment[]; events: SubscriptionEvent[] } | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "25", ...(status ? { status } : {}), ...(planId ? { planId } : {}) });
      setData(await adminGet(`/api/admin/subscriptions?${params}`));
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, [page, status, planId]);

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
      setReason("");
      setDetail(await adminGet(`/api/admin/subscriptions?id=${encodeURIComponent(id)}`));
    } catch (err) {
      showToast("error", errorText(err));
    }
  }

  async function act(body: Record<string, unknown>, ok: string) {
    try {
      await adminPost("/api/admin/subscriptions", body);
      showToast("success", ok);
      await load();
      if (detail && typeof body.id === "string" && body.action !== "delete_plan") await open(detail.subscription.id);
    } catch (err) {
      showToast("error", errorText(err));
    }
  }

  return (
    <section aria-label={view === "plans" ? "Planos de assinatura" : "Assinantes"} className="space-y-6">
      {error && <Notice tone="error">{error}</Notice>}
      {data && !data.paymentsOnline && <Notice tone="warning">Pagamentos desligados neste ambiente (provedor sem chave): dá para criar planos, mas ninguém consegue assinar.</Notice>}

      {view === "plans" ? (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <p className="max-w-2xl text-[13px] text-muted-foreground">Preço, ciclo, benefícios e regras de cada plano. Mudar o preço vale para novas assinaturas; quem já assina mantém o valor contratado.</p>
            <Button onClick={() => setEditing("new")}>Novo plano</Button>
          </div>
          {data === null ? (
            <div role="status" aria-label="Carregando" className="h-32 rounded-3xl bg-surface" />
          ) : data.plans.length === 0 ? (
            <EmptyState title="Nenhum plano" body="Crie o primeiro plano de assinatura da PRX." />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {data.plans.map((p) => (
                <li key={p.id} className="glass-soft space-y-3 rounded-3xl p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[16px] font-semibold text-ink">{p.name}</p>
                      <p className="text-[13px] text-muted-foreground">
                        {brl(p.price)} · {CYCLE_LABEL[p.cycle]} · {p.paymentMethods.map((m) => BILLING_TYPE_LABEL[m]).join(", ")}
                      </p>
                    </div>
                    <Tag tone={p.status === "active" ? "success" : "neutral"}>{PLAN_STATUS_LABEL[p.status]}</Tag>
                  </div>
                  {p.benefits.length > 0 && (
                    <ul className="list-inside list-disc text-[13px] text-ink">
                      {p.benefits.slice(0, 4).map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setEditing(p)}>
                      Editar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => (setPlanId(p.id), setPage(1))}>
                      Assinantes
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={async () => {
                        if (await confirmDelete({ title: "Excluir plano", message: `Excluir ${p.name}? Só é possível sem assinaturas.`, confirmText: "Excluir", type: "danger" })) await act({ action: "delete_plan", id: p.id }, "Plano excluído.");
                      }}
                    >
                      Excluir
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))} aria-label="Filtrar por situação" className="sm:max-w-xs">
              <option value="">Todas as situações</option>
              {SUBSCRIPTION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {SUBSCRIPTION_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
            <Select value={planId} onChange={(e) => (setPlanId(e.target.value), setPage(1))} aria-label="Filtrar por plano" className="sm:max-w-xs">
              <option value="">Todos os planos</option>
              {data?.plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          {data === null ? (
            <div role="status" aria-label="Carregando" className="h-32 rounded-3xl bg-surface" />
          ) : data.items.length === 0 ? (
            <EmptyState title="Nenhuma assinatura" body="Quem assinar um plano aparece aqui." />
          ) : (
            <ul className="space-y-2">
              {data.items.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => void open(s.id)} className="glass-soft flex w-full cursor-pointer flex-col gap-1 rounded-2xl px-4 py-3 text-left sm:flex-row sm:items-center sm:justify-between">
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-medium text-ink">{s.memberName}</span>
                      <span className="block truncate text-[13px] text-muted-foreground">
                        {s.memberEmail} · {s.planName} · {brl(s.price)} · {BILLING_TYPE_LABEL[s.billingType]}
                      </span>
                    </span>
                    <Tag tone={s.status === "active" ? "success" : s.status === "past_due" ? "warning" : "neutral"}>{SUBSCRIPTION_STATUS_LABEL[s.status]}</Tag>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {data && data.total > 25 && <Pager page={page} pageSize={25} total={data.total} onPage={setPage} />}
        </>
      )}

      {editing && (
        <AdminPlanForm
          plan={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}

      {detail && (
        <Sheet open onClose={() => setDetail(null)} title={detail.subscription.memberName} description={`${detail.subscription.planName} · ${SUBSCRIPTION_STATUS_LABEL[detail.subscription.status]}`} size="lg">
          <div className="space-y-5 text-[14px]">
            <p className="text-ink">
              {brl(detail.subscription.price)} {CYCLE_LABEL[detail.subscription.cycle]} · {BILLING_TYPE_LABEL[detail.subscription.billingType]} · desde {formatDateTimeBr(detail.subscription.createdAt)}
              {detail.subscription.currentPeriodEnd ? ` · pago até ${formatDateTimeBr(detail.subscription.currentPeriodEnd)}` : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => void act({ action: "sync", id: detail.subscription.id }, "Assinatura conferida com o provedor.")}>
                Conferir no provedor de pagamentos
              </Button>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-ink">Pagamentos</h3>
              {detail.payments.length === 0 ? (
                <p className="text-muted-foreground">Nenhuma cobrança gerada ainda.</p>
              ) : (
                <ul className="space-y-1">
                  {detail.payments.map((p) => (
                    <li key={p.id} className="flex flex-wrap justify-between gap-2 rounded-xl bg-surface px-3 py-2">
                      <span>
                        {p.dueDate.split("-").reverse().join("/")} · {brl(p.value)}
                      </span>
                      <span className="text-muted-foreground">
                        {p.status}
                        {p.paidAt ? ` · pago ${formatDateTimeBr(p.paidAt)}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-ink">Histórico</h3>
              <ul className="space-y-1 text-[13px]">
                {detail.events.map((e) => (
                  <li key={e.id} className="rounded-xl bg-surface px-3 py-2">
                    {formatDateTimeBr(e.createdAt)} · {e.actor} · {e.action}
                    {e.detail ? ` · ${e.detail}` : ""}
                  </li>
                ))}
              </ul>
            </div>
            {["pending_payment", "trialing", "active", "past_due"].includes(detail.subscription.status) && (
              <div className="space-y-2 border-t border-line pt-4">
                <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo do cancelamento (obrigatório)" aria-label="Motivo do cancelamento" />
                <Button
                  variant="danger"
                  onClick={async () => {
                    if (await confirmDelete({ title: "Cancelar assinatura", message: "Cancelar as próximas cobranças desta pessoa no provedor de pagamentos?", confirmText: "Cancelar assinatura", type: "danger" }))
                      await act({ action: "cancel", id: detail.subscription.id, reason }, "Assinatura cancelada.");
                  }}
                >
                  Cancelar assinatura
                </Button>
              </div>
            )}
          </div>
        </Sheet>
      )}
    </section>
  );
}
