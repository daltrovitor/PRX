// Hello World
"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button, EmptyState, Field, Input, Notice, Select, Tag, formatBRL } from "@/components/app/ui";
import { LiveTicketCard, type LiveTicketData } from "@/components/tickets/live-ticket-card";
import { formatDateTimeBr } from "@/components/admin/pager";
import type { AdminEvent, TicketQuote } from "@/lib/live/service";
import { ageRatingLabel } from "@/lib/live/age";
import { getPanelUrl } from "@/lib/site";

/**
 * Simulação de ponta a ponta do PRX LIVE (só admin, sem cobrança):
 * evento → lote → cupom → resumo → pagamento SIMULADO → ingresso de TESTE com
 * QR → validação na portaria (entrada + bloqueio da 2ª leitura). Nada entra em
 * receita, lotação ou métricas, e o ingresso não libera entrada real.
 */

interface TestTicket {
  id: string;
  code: string;
  status: string;
  qrPayload: string;
  checkedInAt: string | null;
  checkedInByName: string | null;
  createdAt: string;
  card: LiveTicketData;
}

type DoorResult = { ok: boolean; text: string };

async function postJson<T>(url: string, body: unknown): Promise<{ ok: boolean; json: T & { error?: string } }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: res.ok, json: (await res.json().catch(() => ({}))) as T & { error?: string } };
  } catch {
    return { ok: false, json: { error: "Sem internet agora. Confira sua conexão e tente de novo." } as T & { error?: string } };
  }
}

export function AdminSimulationTab({ preset }: { preset: { eventId: string; code: string } | null }) {
  const [events, setEvents] = useState<AdminEvent[] | null>(null);
  const [eventId, setEventId] = useState(preset?.eventId ?? "");
  const [batchId, setBatchId] = useState("");
  const [code, setCode] = useState(preset?.code ?? "");
  const [holder, setHolder] = useState("Insider de teste");
  const [quote, setQuote] = useState<TicketQuote | null>(null);
  const [ticket, setTicket] = useState<TestTicket | null>(null);
  const [tickets, setTickets] = useState<TestTicket[]>([]);
  const [doorVerified, setDoorVerified] = useState<string | null>(null);
  const [door, setDoor] = useState<DoorResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    fetch("/api/admin/live/events", { cache: "no-store" })
      .then((r) => r.json() as Promise<{ events?: AdminEvent[] }>)
      .then((json) => setEvents((json.events ?? []).filter((e) => e.status !== "cancelled" && !e.ended)))
      .catch(() => setEvents([]));
  }, []);

  const event = events?.find((e) => e.id === eventId) ?? null;
  const batch = event?.batches.find((b) => b.id === batchId) ?? event?.batches[0] ?? null;

  useEffect(() => {
    if (!eventId) return;
    let active = true;
    fetch(`/api/admin/live/simulation?eventId=${encodeURIComponent(eventId)}`, { cache: "no-store" })
      .then((r) => r.json() as Promise<{ tickets?: TestTicket[]; doorTestVerifiedAt?: string | null }>)
      .then((json) => {
        if (!active) return;
        setTickets(json.tickets ?? []);
        setDoorVerified(json.doorTestVerifiedAt ?? null);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [eventId, reload]);

  async function runQuote() {
    if (!event || !batch) return;
    setBusy(true);
    setError(null);
    const { ok, json } = await postJson<{ quote?: TicketQuote }>("/api/admin/live/simulation", { action: "quote", eventId: event.id, batchId: batch.id, promoCode: code || undefined });
    setBusy(false);
    if (!ok || !json.quote) return setError(json.error || "Não foi possível calcular.");
    setQuote(json.quote);
    setTicket(null);
    setDoor([]);
  }

  async function pay() {
    if (!event || !batch) return;
    setBusy(true);
    setError(null);
    const { ok, json } = await postJson<{ ticket?: TestTicket }>("/api/admin/live/simulation", { action: "issue", eventId: event.id, batchId: batch.id, promoCode: code || undefined, holderLabel: holder });
    setBusy(false);
    if (!ok || !json.ticket) return setError(json.error || "Não foi possível emitir o ingresso de teste.");
    setTicket(json.ticket);
    setDoor([]);
    setReload((r) => r + 1);
  }

  async function validate() {
    if (!ticket) return;
    setBusy(true);
    const { ok, json } = await postJson<{ success?: boolean; message?: string }>("/api/validate", { code: ticket.qrPayload, action: "confirm", eventId });
    setBusy(false);
    setDoor((d) => [...d, ok && json.success ? { ok: true, text: json.message || "Entrada registrada." } : { ok: false, text: json.error || "Recusado." }]);
    setReload((r) => r + 1);
  }

  if (!events) return <div role="status" aria-label="Carregando eventos" className="h-48 rounded-3xl bg-surface" />;

  return (
    <section aria-labelledby="sim-title" className="space-y-8">
      <div>
        <h2 id="sim-title" className="font-display text-2xl font-semibold tracking-[-0.03em] text-ink">
          Simulação de compra e teste de portaria
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Mesmo cálculo da compra real, com pagamento simulado: nenhuma cobrança, nenhuma receita e nenhum lugar ocupado. O ingresso gerado é de TESTE e não libera entrada real.
        </p>
      </div>

      {events.length === 0 ? (
        <EmptyState title="Nenhum evento para simular" body="Crie um evento em PRX LIVE → Eventos (pode ser rascunho)." />
      ) : (
        <div className="grid gap-8 lg:grid-cols-12">
          <ol className="space-y-6 lg:col-span-6">
            <Step n={1} title="Página do evento">
              <Field label="Evento">
                {(id) => (
                  <Select
                    id={id}
                    value={eventId}
                    onChange={(e) => {
                      setEventId(e.target.value);
                      setBatchId("");
                      setQuote(null);
                      setTicket(null);
                    }}
                  >
                    <option value="">Escolha…</option>
                    {events.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.title} · {formatDateTimeBr(e.startsAt)} ({e.status === "draft" ? "rascunho" : "publicado"})
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              {event && (
                <dl className="mt-3 space-y-1 rounded-2xl bg-surface p-4 text-[13px]">
                  <p>
                    <strong className="text-ink">Classificação:</strong> {ageRatingLabel(event.minAge)}
                    {event.idCheckRequired ? " · documento com foto" : ""}
                  </p>
                  <p>
                    <strong className="text-ink">Organização:</strong> {event.organizerName || "a definir"}
                  </p>
                  <p>
                    <strong className="text-ink">Cancelamento:</strong> {event.cancellationPolicy || "a definir"}
                  </p>
                </dl>
              )}
            </Step>
            <Step n={2} title="Ingresso">
              <Select aria-label="Lote" value={batch?.id ?? ""} onChange={(e) => setBatchId(e.target.value)} disabled={!event}>
                {(event?.batches ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} · {b.price === 0 ? "grátis" : formatBRL(b.price)}
                  </option>
                ))}
              </Select>
            </Step>
            <Step n={3} title="Cupom ou link de desconto">
              <Input aria-label="Cupom" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Opcional" className="font-mono" />
              <p className="mt-2 text-[12px] text-muted-foreground">Na simulação o cupom pode estar inativo (pré-visualização). Não conta como uso.</p>
            </Step>
            <Step n={4} title="Resumo do pedido">
              <Button variant="secondary" onClick={() => void runQuote()} disabled={!event || busy}>
                Calcular no servidor
              </Button>
              {quote && (
                <dl className="mt-3 divide-y divide-line rounded-2xl bg-surface px-4 text-sm">
                  <Row label="Valor original" value={formatBRL(quote.original)} />
                  <Row label={quote.promo ? `Desconto (${quote.promo.code})` : "Desconto"} value={`− ${formatBRL(quote.discount)}`} />
                  <Row label="Total" value={formatBRL(quote.total)} strong />
                </dl>
              )}
            </Step>
            <Step n={5} title="Pagamento simulado">
              <Field label="Titular do teste" hint="Sempre gravado como “TESTE · …”.">
                {(id, describedBy) => <Input id={id} aria-describedby={describedBy} value={holder} maxLength={60} onChange={(e) => setHolder(e.target.value)} />}
              </Field>
              <Button className="mt-3" onClick={() => void pay()} disabled={!quote || busy}>
                Simular pagamento (sem cobrança)
              </Button>
            </Step>
            {error && <Notice tone="error">{error}</Notice>}
          </ol>

          <div className="space-y-6 lg:col-span-6">
            {ticket ? (
              <>
                <Notice tone="success">Pedido de teste {ticket.card.purchaseCode} confirmado. Nenhuma cobrança foi feita.</Notice>
                <LiveTicketCard data={{ ...ticket.card, statusLabel: "Teste" }} qrPayload={ticket.qrPayload} variant="test" />
                <div className="space-y-3 rounded-3xl glass p-5">
                  <p className="text-[15px] font-semibold text-ink">Validar na portaria</p>
                  <p className="text-[13px] text-muted-foreground">Valide uma vez (entrada registrada) e de novo (deve ser recusado). Para testar no celular da portaria, leia este QR no portal da Equipe.</p>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => void validate()} disabled={busy}>
                      {door.length === 0 ? "Validar agora" : "Ler o mesmo QR de novo"}
                    </Button>
                    <Button variant="secondary" onClick={() => window.open(getPanelUrl("staff"), "_blank", "noopener,noreferrer")}>
                      Abrir portal da Equipe
                    </Button>
                  </div>
                  {door.map((d, i) => (
                    <Notice key={i} tone={d.ok ? "success" : "warning"}>
                      Leitura {i + 1}: {d.text}
                    </Notice>
                  ))}
                </div>
              </>
            ) : (
              <EmptyState title="O ingresso de teste aparece aqui" body="Escolha o evento, calcule o resumo e simule o pagamento." />
            )}

            {event && (
              <div className="space-y-3">
                <p className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                  Teste de portaria do evento
                  <Tag tone={doorVerified ? "success" : "warning"}>{doorVerified ? `Verificado em ${formatDateTimeBr(doorVerified)}` : "Pendente"}</Tag>
                </p>
                {tickets.length > 0 && (
                  <ul className="space-y-2">
                    {tickets.map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3 text-[13px]">
                        <span className="min-w-0 truncate">
                          <span className="font-mono text-ink">{t.code}</span> · {t.card.holderName}
                        </span>
                        <span className="shrink-0 text-muted-foreground">{t.checkedInAt ? `lido ${formatDateTimeBr(t.checkedInAt)}` : "não lido"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="rounded-3xl glass p-5">
      <p className="mb-3 text-[13px] font-semibold text-ink">
        <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-ink text-[12px] text-background">{n}</span>
        {title}
      </p>
      {children}
    </li>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={strong ? "font-semibold text-ink" : "text-ink"}>{value}</dd>
    </div>
  );
}
