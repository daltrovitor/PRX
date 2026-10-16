// Hello World
"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { User } from "@/hooks/use-auth";
import { useAppNav } from "@/components/app/app-nav";
import { useLiveData, type ActionResult, type QuoteResult } from "@/components/app/use-prx-stores";
import { AgeFields } from "@/components/app/live/age-fields";
import { EventPurchaseSheet } from "@/components/app/live/event-purchase-sheet";
import { clearLiveLink, peekLiveLink } from "@/components/app/live/live-link";
import { LiveTicketCard } from "@/components/tickets/live-ticket-card";
import { EventDate } from "@/components/app/shared";
import { CopyButton } from "@/components/app/pass/voucher-sheet";
import { Button, EmptyState, Field, Notice, Segmented, Select, Sheet, Tag, formatBRL } from "@/components/app/ui";
import { IconCheck } from "@/components/icons/prx-icons";
import type { MemberTicket, PublicBatch, PublicEvent, TicketQuote } from "@/lib/live/service";
import { SERIES_LABEL, SHIRT_SIZES, TICKET_STATUS_LABEL, type EventSeries, type ShirtSize } from "@/lib/live/types";
import { TicketCheckout } from "@/components/app/live/ticket-checkout";
import { formatDateTime } from "@/lib/live/format";
import { cn } from "@/lib/utils";

type LiveSection = "eventos" | "ingressos" | "run";
const SECTIONS: ReadonlyArray<LiveSection> = ["eventos", "ingressos", "run"];

const isOpenTicket = (t: MemberTicket) => t.status === "valid" || t.status === "pending_payment";

export function LiveScreen({ member }: { member: User }) {
  const { sub, go } = useAppNav();
  const section: LiveSection = SECTIONS.includes(sub as LiveSection) ? (sub as LiveSection) : "eventos";
  const live = useLiveData(member.id);
  const events = live.data?.events ?? [];
  const wallet = live.data?.wallet ?? { tickets: [], submissions: [] };
  const agenda = events.filter((e) => e.series !== "run" && e.status === "published" && !e.ended);

  return (
    <div className="space-y-8">
      <header className="space-y-1.5">
        <h1 className="ob-display text-[28px] text-ink sm:text-[40px]">PRX LIVE</h1>
        <p className="max-w-md text-sm text-muted-foreground sm:text-[15px]">Eventos e corridas. Ingresso na carteira, QR na portaria.</p>
      </header>

      <Segmented
        label="Seções do PRX LIVE"
        value={section}
        onChange={(value) => go("live", value === "eventos" ? null : value)}
        options={[
          { value: "eventos", label: "Agenda", count: agenda.length },
          { value: "ingressos", label: "Meus ingressos", count: wallet.tickets.filter(isOpenTicket).length },
          { value: "run", label: "PRX RUN" },
        ]}
      />

      {!live.data ? (
        live.loading ? (
          <div role="status" aria-label="Carregando eventos" className="h-48 rounded-3xl bg-surface" />
        ) : (
          <EmptyState title="Não foi possível carregar o PRX LIVE" body={live.error ?? undefined} action={<Button onClick={() => void live.reload()}>Tentar de novo</Button>} />
        )
      ) : (
        <>
          {section === "eventos" && <EventsPanel events={agenda} member={member} reserve={live.reserve} quote={live.quote} onDone={() => go("live", "ingressos")} />}
          {section === "ingressos" && <TicketsPanel tickets={wallet.tickets} cancel={live.cancel} resendGuardian={live.resendGuardian} onBrowse={() => go("live")} onPaid={() => void live.reload()} />}
          {section === "run" && (
            <RunPanel
              events={events.filter((e) => e.series === "run")}
              tickets={wallet.tickets}
              member={member}
              reserve={live.reserve}
              quote={live.quote}
              cancel={live.cancel}
              resendGuardian={live.resendGuardian}
            />
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */

function priceLabel(event: PublicEvent): string {
  const open = event.batches.filter((b) => b.available);
  if (open.length === 0) return event.salesOpen ? "Esgotado" : "Vendas encerradas";
  const from = Math.min(...open.map((b) => b.price));
  return from === 0 ? "Gratuito" : `a partir de ${formatBRL(from)}`;
}

function batchNote(b: PublicBatch): string | null {
  if (!b.available) return b.remaining === 0 ? "Esgotado" : "Encerrado";
  if (b.remaining !== null && b.remaining <= 20) return `Restam ${b.remaining}`;
  return null;
}

type Reserve = (input: { eventId: string; batchId: string; run?: unknown; promoCode?: string; birthDate?: string; parentEmail?: string }) => Promise<ActionResult>;
type Quote = (input: { eventId: string; batchId: string; promoCode?: string }) => Promise<QuoteResult>;
type Cancel = (ticketId: string) => Promise<ActionResult>;
type ResendGuardian = (ticketId: string) => Promise<ActionResult>;

/** Etiqueta do ingresso: válido, mas sem a liberação do responsável (menor de 18 anos), ainda não vale na portaria. */
function ticketTag(ticket: MemberTicket): { tone: "success" | "warning" | "neutral" | "accent"; label: string } {
  const guardian = ticket.guardianConsent?.status;
  if (ticket.status === "valid" && guardian === "pending") return { tone: "warning", label: "Aguardando responsável" };
  if (ticket.status === "valid" && guardian === "rejected") return { tone: "neutral", label: "Recusado pelo responsável" };
  return { tone: statusTone(ticket.status), label: TICKET_STATUS_LABEL[ticket.status] };
}

function EventsPanel({ events, member, reserve, quote, onDone }: { events: PublicEvent[]; member: User; reserve: Reserve; quote: Quote; onDone: () => void }) {
  const [series, setSeries] = useState<EventSeries | "all">("all");
  // Link de divulgação (?evento=…&cupom=…): abre o evento com o cupom preenchido.
  const [link] = useState(() => peekLiveLink());
  const [selectedId, setSelectedId] = useState<string | null>(() => (link && events.some((e) => e.id === link.eventId) ? link.eventId : null));
  const [done, setDone] = useState<{ kind: "free" | "reserved"; guardianPending: boolean } | null>(null);

  const seriesPresent = useMemo(() => [...new Set(events.map((e) => e.series))], [events]);
  const list = useMemo(() => events.filter((e) => series === "all" || e.series === series), [events, series]);
  const selected = events.find((e) => e.id === selectedId) ?? null;
  const linkCode = link && selected?.id === link.eventId ? link.code : null;

  if (events.length === 0) {
    return <EmptyState title="Nenhum evento aberto agora" body="Novos eventos PRX LIVE aparecem aqui assim que forem publicados." />;
  }

  return (
    <section aria-label="Agenda de eventos" className="space-y-6">
      {seriesPresent.length > 1 && (
        <div role="group" aria-label="Séries" className="-mx-4 flex gap-2 overflow-x-auto px-4 scrollbar-none touch-pan-x overscroll-x-contain sm:mx-0 sm:flex-wrap sm:px-0">
          {(["all", ...seriesPresent] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={series === value}
              onClick={() => setSeries(value)}
              className={cn(
                "min-h-12 shrink-0 cursor-pointer whitespace-nowrap rounded-full px-4 text-sm font-medium transition-colors",
                series === value ? "bg-ink text-background" : "bg-surface text-muted-foreground hover:bg-line hover:text-ink"
              )}
            >
              {value === "all" ? "Todos" : SERIES_LABEL[value]}
            </button>
          ))}
        </div>
      )}

      <ul className="space-y-2">
        {list.map((event) => (
          <li key={event.id}>
            <button
              type="button"
              onClick={() => setSelectedId(event.id)}
              className="group grid w-full cursor-pointer grid-cols-[auto_1fr] items-start gap-4 rounded-3xl glass p-5 text-left glass-lift sm:grid-cols-[110px_1fr_auto] sm:items-center sm:gap-8 sm:p-6"
            >
              <EventDate iso={event.startsAt} />
              <div className="min-w-0 space-y-1.5 sm:space-y-2">
                <span className="flex flex-wrap gap-1.5">
                  <span className="inline-flex rounded-full bg-primary/[0.09] px-2.5 py-0.5 text-[12px] font-semibold text-primary">{event.seriesLabel}</span>
                  {event.minAge !== null && event.minAge > 0 && <span className="inline-flex rounded-full bg-surface px-2.5 py-0.5 text-[12px] font-semibold text-ink">{event.ageRating}</span>}
                </span>
                <p className="text-lg font-semibold leading-snug tracking-[-0.02em] text-ink sm:text-xl">{event.title}</p>
                <p className="text-xs text-muted-foreground sm:text-sm">
                  {event.venue} · {event.city}
                  {event.partnerName ? ` · com ${event.partnerName}` : ""}
                </p>
              </div>
              <p className="col-span-2 text-sm text-ink sm:col-span-1 sm:text-right">{priceLabel(event)}</p>
            </button>
          </li>
        ))}
      </ul>

      <EventPurchaseSheet
        key={selected?.id ?? "nenhum"}
        event={selected}
        member={member}
        initialCode={linkCode}
        reserve={reserve}
        quote={quote}
        onClose={() => {
          setSelectedId(null);
          if (link) clearLiveLink();
        }}
        onDone={(kind, guardianPending) => {
          if (link) clearLiveLink();
          setSelectedId(null);
          setDone({ kind, guardianPending });
        }}
      />

      <Sheet
        open={done !== null}
        onClose={() => {
          setDone(null);
          onDone();
        }}
        title={done?.guardianPending ? "Falta a liberação do responsável" : done?.kind === "free" ? "Ingresso garantido" : "Reserva feita"}
        footer={
          <Button
            block
            variant="ink"
            onClick={() => {
              setDone(null);
              onDone();
            }}
          >
            Ver meus ingressos
          </Button>
        }
      >
        <div className="space-y-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success text-white">
            <IconCheck size={24} />
          </span>
          <p className="text-[15px] leading-relaxed text-ink">
            {done?.guardianPending
              ? `Enviamos um e-mail ao seu responsável legal com um link para liberar sua entrada. O QR Code só vale na portaria depois da liberação${
                  done.kind === "reserved" ? " e da confirmação do pagamento pela equipe PRX" : ""
                }. Você acompanha, e reenvia o e-mail se precisar, em Meus ingressos.`
              : done?.kind === "free"
                ? "Seu ingresso já está na carteira com o QR Code para a portaria."
                : "Seu lugar está reservado. Assim que o pagamento for confirmado pela equipe PRX, o QR Code do ingresso é liberado."}
          </p>
        </div>
      </Sheet>
    </section>
  );
}

/* ------------------------------------------------------------------------ */

function statusTone(status: MemberTicket["status"]): "success" | "warning" | "neutral" | "accent" {
  if (status === "valid") return "success";
  if (status === "pending_payment") return "warning";
  return "neutral";
}

function TicketSheet({
  ticket,
  onClose,
  cancel,
  resendGuardian,
  onPaid = () => undefined,
}: {
  ticket: MemberTicket | null;
  onClose: () => void;
  cancel: Cancel;
  resendGuardian: ResendGuardian;
  onPaid?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const event = ticket?.event ?? null;
  const guardian = ticket?.guardianConsent ?? null;
  const cancellable = ticket && (ticket.status === "pending_payment" || (ticket.status === "valid" && ticket.price === 0 && ticket.source !== "invite" && event?.salesOpen));

  async function doCancel() {
    if (!ticket) return;
    setBusy(true);
    setError(null);
    const result = await cancel(ticket.id);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    onClose();
  }

  async function doResend() {
    if (!ticket) return;
    setResending(true);
    setError(null);
    setInfo(null);
    const result = await resendGuardian(ticket.id);
    setResending(false);
    if (!result.ok) return setError(result.error);
    setInfo(`E-mail reenviado para ${guardian?.guardianEmail ?? "o responsável"}.`);
  }

  return (
    <Sheet
      open={Boolean(ticket)}
      onClose={() => {
        setError(null);
        setInfo(null);
        onClose();
      }}
      title={event?.title ?? "Ingresso"}
      description={event ? `${event.venue} · ${event.city}` : undefined}
      footer={
        cancellable ? (
          <Button block variant="secondary" onClick={() => void doCancel()} disabled={busy}>
            {busy ? "Cancelando…" : ticket?.status === "pending_payment" ? "Cancelar reserva" : "Liberar meu ingresso"}
          </Button>
        ) : undefined
      }
    >
      {ticket && (
        <div className="space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <Tag tone={ticketTag(ticket).tone}>{ticketTag(ticket).label}</Tag>
              <p className="text-sm text-muted-foreground">
                {ticket.batchName} · {ticket.holderName}
              </p>
              {ticket.runDetails && (
                <p className="text-sm text-muted-foreground">
                  {ticket.runDetails.modality.toUpperCase()} · {ticket.runDetails.category} · camiseta {ticket.runDetails.shirtSize}
                </p>
              )}
            </div>
            {event && <EventDate iso={event.startsAt} />}
          </div>

          {ticket.status === "valid" && event && (
            <>
              <LiveTicketCard
                qrPayload={ticket.qrPayload}
                data={{
                  seriesLabel: event.seriesLabel,
                  eventTitle: event.title,
                  startsAt: event.startsAt,
                  venue: event.venue,
                  city: event.city,
                  category: ticket.batchName,
                  holderName: ticket.holderName,
                  purchaseCode: ticket.purchaseCode,
                  ticketCode: ticket.code,
                  organizer: event.organizerName,
                  ageRating: event.ageRating,
                  idCheckRequired: event.idCheckRequired,
                  entryRequirements: event.entryRequirements,
                  price: ticket.price,
                  originalPrice: ticket.originalPrice,
                  discount: ticket.discount,
                  statusLabel: ticketTag(ticket).label,
                  guardianStatus: guardian?.status ?? null,
                  guardianName: guardian?.guardianName ?? null,
                  guardianEmail: guardian?.guardianEmail ?? null,
                }}
              />
              {guardian?.status === "pending" && (
                <Notice tone="warning">
                  <p>
                    Falta a liberação do responsável legal. Enviamos o link para <strong className="font-semibold">{guardian.guardianEmail}</strong>; o QR Code só vale na portaria depois que ele liberar.
                  </p>
                  <Button size="sm" variant="secondary" className="mt-3 min-h-12" onClick={() => void doResend()} disabled={resending}>
                    {resending ? "Reenviando…" : "Reenviar e-mail ao responsável"}
                  </Button>
                </Notice>
              )}
              {guardian?.status === "rejected" && <Notice tone="error">O responsável recusou a liberação: este ingresso não vale na portaria.</Notice>}
              <div className="flex items-center justify-between gap-4 rounded-3xl bg-surface p-4">
                <div>
                  <p className="text-[13px] text-muted-foreground">Código do ingresso</p>
                  <p className="font-mono text-lg tracking-[0.12em] text-ink">{ticket.code}</p>
                </div>
                <CopyButton value={ticket.code} />
              </div>
              <p className="text-sm text-muted-foreground">
                {ticket.runDetails ? "Mostre este QR na retirada do kit e na largada." : "Na portaria, mostre o QR Code. Cada ingresso vale uma entrada e é validado na hora."}
              </p>
            </>
          )}

          {ticket.status === "pending_payment" && (
            <>
              <Notice tone="warning">
                Reserva de {formatBRL(ticket.price)} aguardando pagamento{ticket.holdUntil ? `, garantida até ${formatDateTime(ticket.holdUntil)}` : ""}. Depois do pagamento
                confirmado, o QR Code aparece aqui.
              </Notice>
              <TicketCheckout ticketId={ticket.id} onPaid={onPaid} />
            </>
          )}
          {ticket.status === "used" && <Notice tone="success">Entrada registrada em {formatDateTime(ticket.checkedInAt)}.</Notice>}
          {ticket.status === "cancelled" && <Notice>Este ingresso foi cancelado.</Notice>}
          {info && <Notice tone="success">{info}</Notice>}
          {error && <Notice tone="error">{error}</Notice>}
        </div>
      )}
    </Sheet>
  );
}

function TicketCard({ ticket, onOpen }: { ticket: MemberTicket; onOpen: () => void }) {
  const event = ticket.event;
  return (
    <button type="button" onClick={onOpen} className="flex w-full cursor-pointer items-stretch overflow-hidden rounded-3xl glass text-left glass-lift">
      <div className={cn("flex flex-col justify-between rounded-3xl p-5", ticket.status === "valid" ? "bg-primary" : "bg-ink/80")}>
        {event ? <EventDate iso={event.startsAt} tone="dark" /> : <span className="text-white">—</span>}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-4 p-5">
        <div>
          <Tag tone={ticketTag(ticket).tone}>{ticketTag(ticket).label}</Tag>
          <p className="mt-1.5 truncate text-[17px] font-semibold text-ink">{event?.title ?? "Evento indisponível"}</p>
        </div>
        <p className="font-mono text-[13px] text-muted-foreground">{ticket.status === "valid" || ticket.status === "used" ? ticket.code : ticket.batchName}</p>
      </div>
    </button>
  );
}

function TicketsPanel({ tickets, cancel, resendGuardian, onBrowse, onPaid }: { tickets: MemberTicket[]; cancel: Cancel; resendGuardian: ResendGuardian; onBrowse: () => void; onPaid?: () => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = tickets.find((t) => t.id === openId) ?? null;
  const current = tickets.filter(isOpenTicket);
  const history = tickets.filter((t) => !isOpenTicket(t));

  if (tickets.length === 0) {
    return <EmptyState title="Sua carteira de ingressos está vazia" body="Escolha um evento na agenda para garantir o seu." action={<Button onClick={onBrowse}>Ver agenda</Button>} />;
  }

  return (
    <section aria-label="Meus ingressos" className="space-y-10">
      {current.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {current.map((ticket) => (
            <li key={ticket.id}>
              <TicketCard ticket={ticket} onOpen={() => setOpenId(ticket.id)} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="Nenhum ingresso ativo" body="Os próximos eventos estão na agenda." action={<Button onClick={onBrowse}>Ver agenda</Button>} />
      )}
      {history.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-[13px] font-semibold text-muted-foreground">Histórico</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {history.map((ticket) => (
              <li key={ticket.id}>
                <TicketCard ticket={ticket} onOpen={() => setOpenId(ticket.id)} />
              </li>
            ))}
          </ul>
        </div>
      )}
      <TicketSheet ticket={open} onClose={() => setOpenId(null)} cancel={cancel} resendGuardian={resendGuardian} onPaid={onPaid} />
    </section>
  );
}

/* ------------------------------------------------------------------------ */

function RunPanel({
  events,
  tickets,
  member,
  reserve,
  quote,
  cancel,
  resendGuardian,
}: {
  events: PublicEvent[];
  tickets: MemberTicket[];
  member: User;
  reserve: Reserve;
  quote: Quote;
  cancel: Cancel;
  resendGuardian: ResendGuardian;
}) {
  const upcoming = events.filter((e) => e.status === "published" && !e.ended).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const past = events.filter((e) => e.ended && (e.run?.results.length ?? 0) > 0).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const [stageId, setStageId] = useState<string | null>(null);
  const stage = upcoming.find((e) => e.id === stageId) ?? upcoming[0];

  if (upcoming.length === 0 && past.length === 0) {
    return <EmptyState title="Nenhuma etapa da PRX RUN aberta" body="As próximas etapas aparecem aqui assim que as inscrições abrirem." />;
  }

  return (
    <div className="grid gap-12 lg:grid-cols-12">
      <div className="space-y-6 lg:col-span-7">
        {upcoming.length > 1 && (
          <Segmented
            label="Etapas"
            value={stage?.id ?? ""}
            onChange={setStageId}
            options={upcoming.map((e) => ({ value: e.id, label: e.title.length > 22 ? `${e.title.slice(0, 21)}…` : e.title }))}
          />
        )}
        {stage ? (
          <RunStage
            key={stage.id}
            stage={stage}
            ticket={tickets.find((t) => t.eventId === stage.id && isOpenTicket(t)) ?? null}
            member={member}
            reserve={reserve}
            quote={quote}
            cancel={cancel}
            resendGuardian={resendGuardian}
          />
        ) : (
          <EmptyState title="Inscrições encerradas" body="A próxima etapa aparece aqui quando abrir." />
        )}
      </div>
      {past.length > 0 && (
        <div className="space-y-10 lg:col-span-5">
          {past.map((event) => (
            <RunResults key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}

function RunStage({
  stage,
  ticket,
  member,
  reserve,
  quote,
  cancel,
  resendGuardian,
}: {
  stage: PublicEvent;
  ticket: MemberTicket | null;
  member: User;
  reserve: Reserve;
  quote: Quote;
  cancel: Cancel;
  resendGuardian: ResendGuardian;
}) {
  const run = stage.run;
  const [modality, setModality] = useState(run?.modalities[0] ?? "5k");
  const [category, setCategory] = useState(run?.categories[0] ?? "Geral");
  const [shirt, setShirt] = useState<ShirtSize>("M");
  const [batchId, setBatchId] = useState(stage.batches.find((b) => b.available)?.id ?? "");
  const [accepted, setAccepted] = useState(false);
  const [birthDate, setBirthDate] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [age, setAge] = useState<TicketQuote["age"]>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openTicket, setOpenTicket] = useState(false);
  const batch = stage.batches.find((b) => b.id === batchId);
  const levelLocked = (member.prxLevel || 1) < stage.minPrxLevel;
  const ageBlocked = Boolean(age && !age.eligible && !age.needsBirthDate);

  // Regra de idade do servidor: pede a data de nascimento (se a conta não tem) e o e-mail do responsável (menor de 18 anos).
  useEffect(() => {
    if (!batch) return;
    let active = true;
    quote({ eventId: stage.id, batchId: batch.id }).then((result) => {
      if (!active || !result.ok) return;
      setAge(result.quote.age);
      const suggested = result.quote.age?.suggestedParentEmail;
      if (suggested) setParentEmail((prev) => prev || suggested);
    });
    return () => {
      active = false;
    };
  }, [stage.id, batch, quote]);

  async function register(event: FormEvent) {
    event.preventDefault();
    if (!batch) return setError("Escolha o lote da inscrição.");
    if (!accepted) return setError("Aceite o termo de responsabilidade para concluir a inscrição.");
    if (age?.needsBirthDate && !birthDate) return setError("Informe sua data de nascimento para continuar.");
    if (age?.requiresParentEmail && !parentEmail.trim()) return setError("Como você é menor de idade, informe o e-mail do seu responsável legal.");
    setBusy(true);
    setError(null);
    const result = await reserve({
      eventId: stage.id,
      batchId: batch.id,
      run: { modality, category, shirtSize: shirt, acceptedTerms: true },
      birthDate: age?.needsBirthDate ? birthDate : undefined,
      parentEmail: age?.requiresParentEmail ? parentEmail.trim() : undefined,
    });
    setBusy(false);
    if (!result.ok) setError(result.error);
  }

  return (
    <section aria-labelledby={`run-${stage.id}`} className="space-y-6">
      <div className="flex items-start justify-between gap-4 rounded-3xl glass p-5 sm:gap-6 sm:p-6">
        <div>
          <h2 id={`run-${stage.id}`} className="text-xl font-semibold tracking-[-0.02em] text-ink sm:text-2xl">
            {stage.title}
          </h2>
          <p className="mt-1.5 text-xs text-muted-foreground sm:text-sm">
            {stage.venue} · {stage.city}
          </p>
          {run?.kitPickup && <p className="mt-1 text-xs text-muted-foreground sm:text-sm">Retirada do kit: {run.kitPickup}</p>}
        </div>
        <EventDate iso={stage.startsAt} />
      </div>

      {ticket ? (
        <div className="space-y-4 rounded-3xl glass p-5 sm:p-6">
          <Tag tone={ticketTag(ticket).tone}>{ticket.status === "valid" && !ticket.guardianConsent ? "Inscrição confirmada" : ticketTag(ticket).label}</Tag>
          {ticket.runDetails && (
            <dl className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Distância</dt>
                <dd className="text-2xl font-semibold uppercase text-ink">{ticket.runDetails.modality}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Categoria</dt>
                <dd className="font-medium text-ink">{ticket.runDetails.category}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Camiseta</dt>
                <dd className="font-medium text-ink">{ticket.runDetails.shirtSize}</dd>
              </div>
            </dl>
          )}
          <Button variant="ink" onClick={() => setOpenTicket(true)}>
            {ticket.status === "valid" ? (ticket.guardianConsent?.status === "approved" || !ticket.guardianConsent ? "Mostrar QR do kit" : "Ver inscrição") : "Ver reserva"}
          </Button>
          <TicketSheet ticket={openTicket ? ticket : null} onClose={() => setOpenTicket(false)} cancel={cancel} resendGuardian={resendGuardian} />
        </div>
      ) : !stage.salesOpen || !run ? (
        <EmptyState title="Inscrições encerradas" body="Acompanhe os resultados quando a etapa terminar." />
      ) : (
        <form onSubmit={(e) => void register(e)} className="space-y-6">
          <fieldset>
            <legend className="text-[13px] font-semibold text-ink">Distância</legend>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {run.modalities.map((m) => (
                <label
                  key={m}
                  className={cn(
                    "flex min-h-14 cursor-pointer items-center justify-center rounded-2xl text-2xl font-semibold uppercase tracking-[-0.02em] transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
                    modality === m ? "bg-primary text-white" : "bg-surface text-ink hover:bg-line"
                  )}
                >
                  <input type="radio" name="modality" value={m} checked={modality === m} onChange={() => setModality(m)} className="sr-only" />
                  {m}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Categoria">
              {(id) => (
                <Select id={id} value={category} onChange={(e) => setCategory(e.target.value)}>
                  {run.categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Tamanho da camiseta">
              {(id) => (
                <Select id={id} value={shirt} onChange={(e) => setShirt(e.target.value as ShirtSize)}>
                  {SHIRT_SIZES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          {stage.batches.length > 1 && (
            <Field label="Lote">
              {(id) => (
                <Select id={id} value={batchId} onChange={(e) => setBatchId(e.target.value)}>
                  {stage.batches.map((b) => (
                    <option key={b.id} value={b.id} disabled={!b.available}>
                      {b.name} · {b.price === 0 ? "Grátis" : formatBRL(b.price)}
                      {batchNote(b) ? ` · ${batchNote(b)}` : ""}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          <label className="flex cursor-pointer gap-3 rounded-2xl bg-surface p-4 text-sm leading-relaxed text-muted-foreground">
            <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-[#6c0cf0]" />
            <span>
              Declaro estar em condições de saúde para participar da prova, conheço o percurso e assumo a responsabilidade pela minha participação, conforme o
              regulamento da etapa.
            </span>
          </label>
          {batch && batch.price > 0 && (
            <p className="text-[13px] text-muted-foreground">A inscrição fica reservada por até 72 h. Com o pagamento confirmado pela equipe PRX, o QR do kit é liberado.</p>
          )}
          <AgeFields age={age} ageRating={stage.ageRating} birthDate={birthDate} onBirthDate={setBirthDate} parentEmail={parentEmail} onParentEmail={setParentEmail} />
          {ageBlocked && age?.reason && <Notice tone="error">{age.reason}</Notice>}
          {levelLocked && <Notice tone="warning">Etapa para membros a partir do nível {stage.minPrxLevel}.</Notice>}
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" block disabled={busy || !batch?.available || levelLocked || ageBlocked}>
            {busy ? "Enviando…" : batch ? `Inscrever-se · ${batch.price === 0 ? "grátis" : formatBRL(batch.price)}` : "Inscrições esgotadas"}
          </Button>
        </form>
      )}
    </section>
  );
}

function RunResults({ event }: { event: PublicEvent }) {
  const results = event.run?.results ?? [];
  const modalities = [...new Set(results.map((r) => r.modality).filter(Boolean))];
  const [filter, setFilter] = useState(modalities[0] ?? "");
  const shown = results.filter((r) => !filter || r.modality === filter).sort((a, b) => a.position - b.position);
  return (
    <section aria-labelledby={`res-${event.id}`} className="space-y-5">
      <h2 id={`res-${event.id}`} className="text-xl font-semibold tracking-[-0.02em] text-ink">
        Resultados · {event.title}
      </h2>
      {modalities.length > 1 && <Segmented label="Distância" value={filter} onChange={setFilter} options={modalities.map((m) => ({ value: m, label: m.toUpperCase() }))} />}
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Classificação {filter}</caption>
        <thead>
          <tr className="border-b border-line text-[13px] text-muted-foreground">
            <th scope="col" className="py-2 font-medium">
              #
            </th>
            <th scope="col" className="py-2 font-medium">
              Atleta
            </th>
            <th scope="col" className="py-2 font-medium">
              Cat.
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Tempo
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {shown.map((r) => (
            <tr key={`${r.modality}-${r.position}-${r.name}`}>
              <td className="py-3 font-mono text-ink">{r.position}</td>
              <td className="py-3 text-ink">{r.name}</td>
              <td className="py-3 text-muted-foreground">{r.category}</td>
              <td className="py-3 text-right font-mono text-ink">{r.time}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/* ------------------------------------------------------------------------ */
