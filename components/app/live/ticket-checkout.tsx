// Hello World
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Notice, RadioCards, formatBRL } from "@/components/app/ui";
import { ReviewSheet, type Review } from "@/components/app/bank/outgoing";
import { PixInvoice } from "@/components/app/subscriptions/pix-invoice";
import type { CheckoutMethod } from "@/lib/live/promo";
import type { CheckoutOption, CheckoutState } from "@/lib/checkout/service";
import type { PixQr } from "@/lib/billing/gateway";

/**
 * Pagamento de um ingresso reservado. As formas disponíveis e o preço de cada
 * uma vêm do servidor; o ingresso só vira válido quando o pagamento é
 * confirmado (a tela consulta sozinha a cada poucos segundos).
 */
export function TicketCheckout({ ticketId, onPaid }: { ticketId: string; onPaid: () => void }) {
  const [state, setState] = useState<CheckoutState | null>(null);
  const [method, setMethod] = useState<CheckoutMethod | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pix, setPix] = useState<PixQr | null>(null);
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [waiting, setWaiting] = useState(false);
  const paidRef = useRef(onPaid);
  useEffect(() => {
    paidRef.current = onPaid;
  }, [onPaid]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/live/checkout?ticketId=${encodeURIComponent(ticketId)}`, { cache: "no-store" }).catch(() => null);
    const json = res ? ((await res.json().catch(() => ({}))) as Partial<CheckoutState> & { error?: string }) : { error: "Sem internet agora." };
    if (!res?.ok || !json.options || !json.ticket) return setError(json.error ?? "Não foi possível carregar o pagamento.");
    setState(json as CheckoutState);
    setError(null);
    if (json.ticket.status === "valid") paidRef.current();
  }, [ticketId]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (alive) await load();
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [waiting, load]);

  const selected: CheckoutOption | undefined = state?.options.find((o) => o.method === (method ?? state.options.find((x) => x.available)?.method));

  async function pay() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/live/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start", ticketId, method: selected.method }) });
      const json = (await res.json().catch(() => ({}))) as { pix?: PixQr | null; invoiceUrl?: string | null; error?: string };
      if (!res.ok) throw new Error(json.error || "Não foi possível iniciar o pagamento.");
      setWaiting(true);
      if (selected.method === "CREDIT_CARD") {
        setInvoiceUrl(json.invoiceUrl ?? null);
        if (json.invoiceUrl) window.open(json.invoiceUrl, "_blank", "noopener,noreferrer");
      } else if (selected.method === "PIX") {
        setPix(json.pix ?? null);
      } else if (json.pix) {
        // Conta PRX BANK: o mesmo Pix, revisado e confirmado como qualquer Pix da conta.
        const prep = await fetch("/api/bank/outgoing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "prepare_pix", method: "qr", payload: json.pix.payload }) });
        const data = (await prep.json().catch(() => ({}))) as { prepared?: Review["prepared"]; confirmation?: Review["confirmation"]; error?: string };
        if (!prep.ok || !data.prepared || !data.confirmation) throw new Error(data.error || "Não foi possível preparar o Pix pela sua conta.");
        setReview({ prepared: data.prepared, confirmation: data.confirmation });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível iniciar o pagamento.");
    } finally {
      setBusy(false);
    }
  }

  if (!state) return error ? <Notice tone="error">{error}</Notice> : <div role="status" aria-label="Carregando pagamento" className="h-24 rounded-2xl bg-surface" />;
  if (state.guardian.required && state.guardian.status !== "approved") {
    return <Notice tone="warning">{state.guardian.status === "rejected" ? "O seu responsável não liberou este ingresso." : "O pagamento libera assim que o seu responsável autorizar pelo link enviado por e-mail."}</Notice>;
  }
  const available = state.options.filter((o) => o.available);

  return (
    <div className="space-y-4">
      {available.length === 0 ? (
        <Notice>{state.options[0]?.reason ?? "Pagamento online indisponível agora. A equipe PRX confirma a sua reserva."}</Notice>
      ) : (
        <>
          <RadioCards
            label="Como você quer pagar?"
            value={selected?.method ?? available[0].method}
            onChange={(v) => setMethod(v)}
            options={state.options.map((o) => ({
              value: o.method,
              title: `${o.label}${o.quote ? ` · ${formatBRL(o.quote.total)}` : ""}`,
              body: o.available ? (o.quote && o.quote.discount > 0 ? o.quote.discounts.map((d) => `${d.label}: −${formatBRL(d.amount)}`).join(" · ") : undefined) : (o.reason ?? undefined),
            }))}
          />
          {selected?.quote && (
            <dl className="rounded-2xl bg-surface px-4 py-3 text-[14px]">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Preço</dt>
                <dd className="text-ink">{formatBRL(selected.quote.original)}</dd>
              </div>
              {selected.quote.discount > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Desconto</dt>
                  <dd className="text-ink">−{formatBRL(selected.quote.discount)}</dd>
                </div>
              )}
              <div className="mt-1 flex justify-between border-t border-line pt-1 font-semibold">
                <dt className="text-ink">Total</dt>
                <dd className="text-ink">{formatBRL(selected.quote.total)}</dd>
              </div>
            </dl>
          )}
          <Button block disabled={busy || !selected?.available} onClick={() => void pay()}>
            {busy ? "Preparando…" : `Pagar ${selected?.quote ? formatBRL(selected.quote.total) : ""}`}
          </Button>
        </>
      )}

      {pix && <PixInvoice pix={pix} />}
      {invoiceUrl && (
        <Notice>
          Termine o pagamento na página segura do cartão.{" "}
          <a href={invoiceUrl} target="_blank" rel="noopener noreferrer" className="font-medium underline">
            Abrir de novo
          </a>
        </Notice>
      )}
      {waiting && <Notice>Assim que o pagamento for confirmado, o seu QR Code aparece aqui.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      <ReviewSheet review={review} onClose={() => setReview(null)} onDone={() => (setReview(null), setWaiting(true), void load())} />
    </div>
  );
}
