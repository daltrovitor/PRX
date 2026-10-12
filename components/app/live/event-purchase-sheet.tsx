// Hello World
"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { User } from "@/hooks/use-auth";
import type { ActionResult, QuoteResult } from "@/components/app/use-prx-stores";
import { EventDate } from "@/components/app/shared";
import { AgeFields } from "@/components/app/live/age-fields";
import { Button, Field, Input, Notice, Sheet, Tag, formatBRL } from "@/components/app/ui";
import type { PublicBatch, PublicEvent, TicketQuote } from "@/lib/live/service";
import { cn } from "@/lib/utils";

/**
 * Compra no PRX LIVE: antes de reservar, a pessoa vê a classificação etária,
 * as condições de entrada, o organizador e a política de cancelamento. O cupom
 * (digitado ou vindo de um link) e o total são calculados no servidor; a tela
 * só mostra o resultado. A data de nascimento é pedida uma única vez (conferida
 * com o CPF da conta quando possível); menor de 18 anos informa também o e-mail
 * do responsável legal, que libera a entrada por um link (AgeFields).
 */

type Reserve = (input: { eventId: string; batchId: string; promoCode?: string; birthDate?: string; parentEmail?: string }) => Promise<ActionResult>;
type Quote = (input: { eventId: string; batchId: string; promoCode?: string }) => Promise<QuoteResult>;

function batchNote(b: PublicBatch): string | null {
  if (!b.available) return "Esgotado";
  if (b.remaining !== null && b.remaining <= 20) return `Restam ${b.remaining}`;
  return null;
}

/** Condições de entrada sem repetir o documento quando o texto do evento já fala dele. */
function entryText(idCheck: boolean, extra: string): string {
  const parts = [idCheck && !/documento/i.test(extra) ? "Documento oficial com foto." : null, extra.trim() || null].filter(Boolean);
  return parts.join(" ");
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right text-ink">{children}</dd>
    </div>
  );
}

export function EventPurchaseSheet({
  event,
  member,
  initialCode,
  reserve,
  quote,
  onClose,
  onDone,
}: {
  event: PublicEvent | null;
  member: User;
  initialCode: string | null;
  reserve: Reserve;
  quote: Quote;
  onClose: () => void;
  /** `guardianPending`: o comprador é menor e o ingresso só vale depois da liberação do responsável. */
  onDone: (kind: "free" | "reserved", guardianPending: boolean) => void;
}) {
  const [batchId, setBatchId] = useState(() => event?.batches.find((b) => b.available)?.id ?? "");
  const [codeInput, setCodeInput] = useState(initialCode ?? "");
  const [appliedCode, setAppliedCode] = useState<string | null>(initialCode);
  const [summary, setSummary] = useState<TicketQuote | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [birthDate, setBirthDate] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const batch = event?.batches.find((b) => b.id === batchId);
  const levelLocked = event ? (member.prxLevel || 1) < event.minPrxLevel : false;

  // Resumo do servidor sempre que lote ou cupom mudam (inclui a regra de idade).
  useEffect(() => {
    if (!event || !batch) return;
    let active = true;
    quote({ eventId: event.id, batchId: batch.id, promoCode: appliedCode ?? undefined }).then((result) => {
      if (!active) return;
      if (result.ok) {
        setSummary(result.quote);
        setPromoError(null);
        if (result.quote.age?.suggestedParentEmail) {
          setParentEmail((prev) => prev || result.quote.age?.suggestedParentEmail || "");
        }
      } else if (appliedCode) {
        // Cupom recusado: volta ao preço cheio e mostra o motivo.
        setPromoError(result.error);
        setAppliedCode(null);
      } else {
        setError(result.error);
      }
    });
    return () => {
      active = false;
    };
  }, [event, batch, appliedCode, quote]);

  const age = summary?.age;
  const ageBlocked = Boolean(age && !age.eligible && !age.needsBirthDate);
  const needsBirth = Boolean(age?.needsBirthDate);
  const requiresParent = Boolean(age?.requiresParentEmail);
  const total = summary?.total ?? batch?.price ?? 0;

  async function confirm() {
    if (!event || !batch) return;
    if (needsBirth && !birthDate) return setError("Informe sua data de nascimento para continuar.");
    if (requiresParent && !parentEmail.trim()) {
      return setError("Como você é menor de idade, informe o e-mail do seu responsável legal para autorizar a compra.");
    }
    setBusy(true);
    setError(null);
    const result = await reserve({
      eventId: event.id,
      batchId: batch.id,
      promoCode: appliedCode ?? undefined,
      birthDate: needsBirth ? birthDate : undefined,
      parentEmail: requiresParent ? parentEmail.trim() : undefined,
    });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    onDone(batch.price === 0 ? "free" : "reserved", requiresParent);
  }

  return (
    <Sheet
      open={Boolean(event)}
      onClose={onClose}
      title={event?.title ?? "Evento"}
      description={event ? `${event.seriesLabel} · ${event.venue}, ${event.city}` : undefined}
      footer={
        <Button block onClick={() => void confirm()} disabled={busy || !batch || !batch.available || levelLocked || ageBlocked}>
          {busy ? "Processando…" : !batch ? "Escolha um lote" : total === 0 && batch.price === 0 ? "Garantir ingresso gratuito" : `Reservar · ${formatBRL(total)}`}
        </Button>
      }
    >
      {event && (
        <div className="space-y-7">
          <div className="flex items-start justify-between gap-6">
            <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink">{event.summary}</p>
            <EventDate iso={event.startsAt} />
          </div>

          <dl className="divide-y divide-line rounded-3xl bg-surface px-4 text-sm">
            <Row label="Classificação">
              <Tag tone={event.minAge && event.minAge >= 18 ? "warning" : "neutral"}>{event.ageRating}</Tag>
            </Row>
            {event.address && <Row label="Endereço">{event.address}</Row>}
            <Row label="Organização">{event.organizerName || "A definir"}</Row>
            {event.partnerName && <Row label="Parceiro">{event.partnerName}</Row>}
            {(event.idCheckRequired || event.entryRequirements) && (
              <Row label="Entrada">{entryText(event.idCheckRequired, event.entryRequirements)}</Row>
            )}
          </dl>

          {event.cancellationPolicy && (
            <details className="rounded-3xl bg-surface px-4 py-3 text-sm">
              <summary className="min-h-10 cursor-pointer py-1 font-medium text-ink">Política de cancelamento</summary>
              <p className="mt-2 whitespace-pre-line leading-relaxed text-muted-foreground">{event.cancellationPolicy}</p>
            </details>
          )}

          <fieldset>
            <legend className="text-[13px] font-semibold text-ink">Lote</legend>
            <div className="mt-3 divide-y divide-line rounded-3xl bg-surface px-4">
              {event.batches.map((b) => {
                const note = batchNote(b);
                return (
                  <label key={b.id} className={cn("flex min-h-14 items-center justify-between gap-4 py-2", b.available ? "cursor-pointer" : "cursor-not-allowed opacity-50")}>
                    <span className="flex items-center gap-3">
                      <input type="radio" name="batch" value={b.id} disabled={!b.available} checked={batchId === b.id} onChange={() => setBatchId(b.id)} className="h-4 w-4 cursor-pointer accent-[#6c0cf0]" />
                      <span className="text-[15px] text-ink">{b.name}</span>
                      {note && <Tag>{note}</Tag>}
                    </span>
                    <span className="text-[15px] font-medium tabular-nums text-ink">{b.price === 0 ? "Grátis" : formatBRL(b.price)}</span>
                  </label>
                );
              })}
            </div>
            {event.perUserLimit > 1 && <p className="mt-2 text-[13px] text-muted-foreground">Até {event.perUserLimit} ingressos por pessoa.</p>}
          </fieldset>

          {batch && batch.price > 0 && (
            <div className="space-y-3">
              <Field label="Cupom ou código do convite" hint={appliedCode ? `Cupom ${appliedCode} aplicado.` : "Um cupom por ingresso. O desconto é conferido na hora."}>
                {(id, describedBy) => (
                  <div className="flex gap-2">
                    <Input
                      id={id}
                      aria-describedby={describedBy}
                      value={codeInput}
                      onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                      autoComplete="off"
                      spellCheck={false}
                      className="font-mono tracking-[0.08em]"
                    />
                    {appliedCode ? (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setAppliedCode(null);
                          setCodeInput("");
                        }}
                      >
                        Remover
                      </Button>
                    ) : (
                      <Button variant="secondary" onClick={() => setAppliedCode(codeInput.trim() || null)} disabled={!codeInput.trim()}>
                        Aplicar
                      </Button>
                    )}
                  </div>
                )}
              </Field>
              {promoError && <Notice tone="error">{promoError}</Notice>}
            </div>
          )}

          {batch && batch.price > 0 && (
            <dl className="divide-y divide-line rounded-3xl bg-surface px-4 text-sm" aria-label="Resumo do pedido">
              <Row label="Valor do lote">{formatBRL(summary?.original ?? batch.price)}</Row>
              {summary?.promo && (
                <Row label={`Desconto (${summary.promo.code})`}>
                  <span className="text-success">− {formatBRL(summary.discount)}</span>
                </Row>
              )}
              <Row label="Total">
                <strong className="text-[16px]">{formatBRL(total)}</strong>
              </Row>
            </dl>
          )}

          <AgeFields age={age} ageRating={event.ageRating} birthDate={birthDate} onBirthDate={setBirthDate} parentEmail={parentEmail} onParentEmail={setParentEmail} />
          {ageBlocked && age?.reason && <Notice tone="error">{age.reason}</Notice>}
          {levelLocked && <Notice tone="warning">Este evento é para membros a partir do nível {event.minPrxLevel}. Complete missões no PASS para subir de nível.</Notice>}

          {batch && batch.price > 0 && (
            <p className="rounded-2xl bg-surface px-4 py-3 text-[13px] leading-relaxed text-muted-foreground">
              O pagamento online chega em breve. A reserva segura seu lugar por até 72 h (ou até o início do evento). Quando a equipe PRX confirmar o pagamento, o QR Code do
              ingresso aparece em Meus ingressos.
            </p>
          )}

          {error && <Notice tone="error">{error}</Notice>}
        </div>
      )}
    </Sheet>
  );
}
