// Hello World
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, EmptyState, Notice, Segmented, Sheet, Tag, Textarea } from "@/components/app/ui";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { BILLING_TYPE_LABEL, CYCLE_LABEL, type BillingType, type PixQr } from "@/lib/billing/gateway";
import { CANCELLATION_LABEL, SUBSCRIPTION_STATUS_LABEL, type MemberSubscription, type SubscriptionEvent, type SubscriptionPayment, type SubscriptionPlan } from "@/lib/subscriptions/types";
import { PixInvoice } from "@/components/app/subscriptions/pix-invoice";

type Plan = SubscriptionPlan & { eligible: boolean; reason: string | null; introPrice: number | null };
type Mine = MemberSubscription & { payments: SubscriptionPayment[]; events: SubscriptionEvent[] };
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const day = (iso: string | null) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00-03:00` : iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
const LIVE = new Set(["pending_payment", "trialing", "active", "past_due"]);

async function post<T>(body: unknown): Promise<T> {
  const res = await fetch("/api/subscriptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  if (!res) throw new Error("Sem internet agora. Confira sua conexão e tente de novo.");
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error || "Não foi possível concluir agora.");
  return json;
}

/**
 * Assinaturas no app: comparar planos, assinar, ver a atual, pagamentos,
 * vencimentos e histórico, e cancelar. A assinatura só vale depois que o
 * pagamento é confirmado (o app nunca ativa sozinho).
 */
export function SubscriptionsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { confirmDelete, showToast } = useConfirmToast();
  const [view, setView] = useState<"planos" | "minhas">("planos");
  const [data, setData] = useState<{ plans: Plan[]; subscriptions: Mine[]; paymentsOnline: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choosing, setChoosing] = useState<Plan | null>(null);
  const [method, setMethod] = useState<BillingType>("PIX");
  const [busy, setBusy] = useState(false);
  const [invoice, setInvoice] = useState<{ url: string | null; pix: PixQr | null } | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/subscriptions", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { plans?: Plan[]; subscriptions?: Mine[]; paymentsOnline?: boolean; error?: string };
      if (!res.ok || !json.plans) throw new Error(json.error || "Não foi possível carregar as assinaturas.");
      setData({ plans: json.plans, subscriptions: json.subscriptions ?? [], paymentsOnline: json.paymentsOnline === true });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sem internet agora.");
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void (async () => {
      if (alive) await load();
    })();
    return () => {
      alive = false;
    };
  }, [open, load]);

  async function subscribe() {
    if (!choosing) return;
    setBusy(true);
    try {
      const res = await post<{ payment: SubscriptionPayment | null; pix: PixQr | null }>({ action: "subscribe", planId: choosing.id, billingType: method });
      setInvoice({ url: res.payment?.invoiceUrl ?? null, pix: res.pix });
      setChoosing(null);
      await load();
      setView("minhas");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Não foi possível assinar.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel(sub: Mine) {
    const plan = data?.plans.find((p) => p.id === sub.planId);
    if (!(await confirmDelete({ title: "Cancelar assinatura", message: plan ? CANCELLATION_LABEL[plan.cancellationPolicy] + "." : "As próximas cobranças param.", confirmText: "Cancelar assinatura", type: "danger" }))) return;
    try {
      await post({ action: "cancel", id: sub.id, reason });
      showToast("success", "Assinatura cancelada.");
      setReason("");
      await load();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Não foi possível cancelar.");
    }
  }

  const mine = data?.subscriptions ?? [];
  return (
    <Sheet open={open} onClose={onClose} title="Assinaturas PRX" description="Planos com benefícios extras, cobrados pelo parceiro de pagamentos da PRX." size="lg">
      {error && <Notice tone="error">{error}</Notice>}
      {!data ? (
        !error && <div role="status" aria-label="Carregando" className="h-40 rounded-2xl bg-surface" />
      ) : (
        <div className="space-y-5">
          {!data.paymentsOnline && <Notice tone="warning">Os pagamentos ainda não estão disponíveis. Você já pode conhecer os planos.</Notice>}
          <Segmented label="Assinaturas" value={view} onChange={setView} options={[{ value: "planos", label: "Planos" }, { value: "minhas", label: "Minhas", count: mine.length }]} />

          {invoice && (
            <Notice tone="success">
              Assinatura criada. Ela fica ativa assim que o pagamento for confirmado.{" "}
              {invoice.url && (
                <a href={invoice.url} target="_blank" rel="noopener noreferrer" className="font-medium underline">
                  Abrir a fatura
                </a>
              )}
            </Notice>
          )}
          {invoice?.pix && <PixInvoice pix={invoice.pix} />}

          {view === "planos" ? (
            data.plans.length === 0 ? (
              <EmptyState title="Nenhum plano à venda agora" body="Quando a PRX lançar um plano, ele aparece aqui." />
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {data.plans.map((p) => (
                  <li key={p.id} className="glass-soft flex flex-col gap-3 rounded-3xl p-5">
                    <div>
                      <p className="text-[17px] font-semibold text-ink">{p.name}</p>
                      <p className="text-[15px] text-ink">
                        {p.introPrice !== null ? (
                          <>
                            {brl(p.introPrice)} nas {p.introCycles} primeira(s) cobrança(s), depois {brl(p.price)}
                          </>
                        ) : (
                          brl(p.price)
                        )}{" "}
                        <span className="text-muted-foreground">· {CYCLE_LABEL[p.cycle]}</span>
                      </p>
                      {p.trialDays > 0 && <Tag tone="accent">{p.trialDays} dias grátis</Tag>}
                    </div>
                    {p.description && <p className="text-[13px] text-muted-foreground">{p.description}</p>}
                    {p.benefits.length > 0 && (
                      <ul className="list-inside list-disc space-y-0.5 text-[14px] text-ink">
                        {p.benefits.map((b) => (
                          <li key={b}>{b}</li>
                        ))}
                      </ul>
                    )}
                    <p className="text-[12px] text-muted-foreground">Cancelamento: {CANCELLATION_LABEL[p.cancellationPolicy]}.</p>
                    {p.eligible ? (
                      <Button className="mt-auto" disabled={!data.paymentsOnline || mine.some((m) => m.planId === p.id && LIVE.has(m.status))} onClick={() => (setChoosing(p), setMethod(p.paymentMethods[0]))}>
                        {mine.some((m) => m.planId === p.id && LIVE.has(m.status)) ? "Você já assina" : "Assinar"}
                      </Button>
                    ) : (
                      <Notice>{p.reason}</Notice>
                    )}
                  </li>
                ))}
              </ul>
            )
          ) : mine.length === 0 ? (
            <EmptyState title="Você não tem assinaturas" body="Veja os planos e escolha o seu." />
          ) : (
            <ul className="space-y-3">
              {mine.map((s) => (
                <li key={s.id} className="glass-soft space-y-3 rounded-3xl p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-[16px] font-semibold text-ink">{s.planName}</p>
                      <p className="text-[13px] text-muted-foreground">
                        {brl(s.price)} {CYCLE_LABEL[s.cycle]} · {BILLING_TYPE_LABEL[s.billingType]}
                        {s.nextDueDate && LIVE.has(s.status) ? ` · próximo vencimento ${day(s.nextDueDate)}` : ""}
                        {s.currentPeriodEnd ? ` · benefícios até ${day(s.currentPeriodEnd)}` : ""}
                      </p>
                    </div>
                    <Tag tone={s.status === "active" ? "success" : s.status === "past_due" ? "warning" : "neutral"}>{SUBSCRIPTION_STATUS_LABEL[s.status]}</Tag>
                  </div>
                  {s.payments.length > 0 && (
                    <ul className="space-y-1 text-[13px]">
                      {s.payments.map((p) => (
                        <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2">
                          <span>
                            {day(p.dueDate)} · {brl(p.value)} · {p.paidAt ? "pago" : p.status === "OVERDUE" ? "vencido" : "em aberto"}
                          </span>
                          {!p.paidAt && p.invoiceUrl && (
                            <a href={p.invoiceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center font-medium text-primary underline-offset-2 hover:underline">
                              Pagar
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {s.events.length > 0 && (
                    <details>
                      <summary className="cursor-pointer text-[13px] text-primary">Histórico</summary>
                      <ul className="mt-1 space-y-0.5 text-[12px] text-muted-foreground">
                        {s.events.map((e) => (
                          <li key={e.id}>
                            {day(e.createdAt)} · {e.action.replaceAll("_", " ")}
                            {e.detail ? ` · ${e.detail}` : ""}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {LIVE.has(s.status) && (
                    <div className="space-y-2 border-t border-line pt-3">
                      <Textarea rows={1} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Conte o motivo (opcional)" aria-label="Motivo do cancelamento" />
                      <Button variant="danger" size="sm" onClick={() => void cancel(s)}>
                        Cancelar assinatura
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {choosing && (
        <Sheet
          open
          onClose={() => setChoosing(null)}
          title={`Assinar ${choosing.name}`}
          footer={
            <Button block disabled={busy} onClick={() => void subscribe()}>
              {busy ? "Criando assinatura…" : "Confirmar e ir para o pagamento"}
            </Button>
          }
        >
          <div className="space-y-4">
            <Segmented label="Forma de pagamento" value={method} onChange={setMethod} options={choosing.paymentMethods.map((m) => ({ value: m, label: BILLING_TYPE_LABEL[m] }))} />
            <p className="text-[14px] text-ink">
              {brl(choosing.introPrice ?? choosing.price)} {CYCLE_LABEL[choosing.cycle]}
              {choosing.trialDays > 0 ? `, com a primeira cobrança depois de ${choosing.trialDays} dias grátis` : ""}.
            </p>
            {method === "CREDIT_CARD" && <Notice>O cartão é digitado na página segura do parceiro de pagamentos; a PRX não vê o número do cartão.</Notice>}
            <Notice>
              {CANCELLATION_LABEL[choosing.cancellationPolicy]}.{choosing.cancellationTerms ? ` ${choosing.cancellationTerms}` : ""}
            </Notice>
          </div>
        </Sheet>
      )}
    </Sheet>
  );
}
