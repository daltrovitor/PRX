// Hello World
"use client";

import { levelGateOptions } from "@/lib/pass-data";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Button, Checkbox, EmptyState, Field, Input, Notice, Select, Sheet, Tag, Textarea, formatBRL } from "@/components/app/ui";
import { ImagePicker, useImageUpload } from "@/components/admin/image-picker";
import { IconArrowLeft, IconPlus, IconRefresh, IconSearch, IconTrash } from "@/components/icons/prx-icons";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import type { AdminEvent, EventStats } from "@/lib/live/service";
import {
  DEFAULT_RUN_CATEGORIES,
  EVENT_SERIES,
  EVENT_STATUS_LABEL,
  RUN_MODALITIES,
  SERIES_LABEL,
  TICKET_STATUS_LABEL,
  type EventSeries,
  type EventStatus,
  type LiveEvent,
  type LiveTicket,
  type RunModality,
  type TicketStatus,
} from "@/lib/live/types";
import { VALIDATOR_LABEL } from "@/lib/live/rules";
import { AGE_OPTIONS, ageRatingLabel } from "@/lib/live/age";
import { formatDateTime, fromLocalInput, toLocalInput } from "@/lib/live/format";

interface PartnerOption {
  id: string;
  name: string;
  status: string;
  hasLogin: boolean;
}

interface ApiResult {
  success?: boolean;
  error?: string;
}

async function api<T extends ApiResult>(url: string, init?: { method: string; body?: unknown }): Promise<{ ok: boolean; data: T }> {
  try {
    const res = await fetch(url, {
      method: init?.method ?? "GET",
      cache: "no-store",
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
      body: init?.body ? JSON.stringify(init.body) : undefined,
    });
    const data = (await res.json().catch(() => ({}))) as T;
    return { ok: res.ok && data.success !== false, data };
  } catch {
    return { ok: false, data: { error: "Sem conexão com o servidor." } as T };
  }
}

const STATUS_TONE: Record<EventStatus, "neutral" | "success" | "warning"> = { draft: "neutral", published: "success", cancelled: "warning" };
const TICKET_TONE: Record<TicketStatus, "neutral" | "success" | "warning" | "accent"> = { pending_payment: "warning", valid: "success", used: "accent", cancelled: "neutral" };

/* -------------------------------------------------------------------------- */

export function AdminEventsTab() {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<LiveEvent | "new" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { ok, data } = await api<ApiResult & { events?: AdminEvent[]; partners?: PartnerOption[] }>("/api/admin/live/events");
    setLoading(false);
    if (!ok) return setError(data.error || "Não foi possível carregar os eventos.");
    setError(null);
    setEvents(data.events ?? []);
    setPartners(data.partners ?? []);
  }, []);

  useEffect(() => {
    let active = true;
    api<ApiResult & { events?: AdminEvent[]; partners?: PartnerOption[] }>("/api/admin/live/events").then(({ ok, data }) => {
      if (!active) return;
      setLoading(false);
      if (!ok) return setError(data.error || "Não foi possível carregar os eventos.");
      setEvents(data.events ?? []);
      setPartners(data.partners ?? []);
    });
    return () => {
      active = false;
    };
  }, []);

  const selected = events.find((e) => e.id === selectedId) ?? null;

  const eventSheet = (
    <EventSheet
      event={editing === "new" ? null : editing}
      open={editing !== null}
      partners={partners}
      onClose={() => setEditing(null)}
      onSaved={async (saved) => {
        setEditing(null);
        await load();
        setSelectedId(saved.id);
      }}
    />
  );

  if (selected) {
    return (
      <>
        <EventDetail event={selected} onBack={() => setSelectedId(null)} onEdit={() => setEditing(selected)} onChanged={load} onDeleted={() => { setSelectedId(null); void load(); }} />
        {eventSheet}
      </>
    );
  }

  const upcoming = events.filter((e) => !e.ended);
  const past = events.filter((e) => e.ended);

  return (
    <section aria-labelledby="events-title" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="events-title" className="font-display text-2xl font-semibold tracking-[-0.03em] text-ink">
            Eventos PRX LIVE
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Agenda, lotes, parceiro da portaria, reservas, convites e check-in.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading} aria-label="Atualizar eventos">
            <IconRefresh size={16} />
          </Button>
          <Button onClick={() => setEditing("new")}>
            <IconPlus size={18} />
            Novo evento
          </Button>
        </div>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {!loading && events.length === 0 ? (
        <EmptyState title="Nenhum evento criado" body="Crie o primeiro evento: ele nasce como rascunho e só aparece no app depois de publicado." action={<Button onClick={() => setEditing("new")}>Criar evento</Button>} />
      ) : (
        <>
          <EventTable events={upcoming} onOpen={setSelectedId} caption="Próximos e em andamento" />
          {past.length > 0 && <EventTable events={past} onOpen={setSelectedId} caption="Encerrados" />}
        </>
      )}
      {eventSheet}
    </section>
  );
}

function EventTable({ events, onOpen, caption }: { events: AdminEvent[]; onOpen: (id: string) => void; caption: string }) {
  if (events.length === 0) return null;
  return (
    <div className="space-y-3">
      <h3 className="text-[13px] font-semibold text-muted-foreground">{caption}</h3>
      <div className="glass overflow-x-auto rounded-3xl">
        <table className="w-full min-w-[860px] text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-line bg-surface text-[13px] text-muted-foreground">
              <th scope="col" className="px-4 py-3 font-medium">Evento</th>
              <th scope="col" className="px-4 py-3 font-medium">Status</th>
              <th scope="col" className="px-4 py-3 font-medium">Portaria</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Ingressos</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">A pagar</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Entradas</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Receita</th>
              <th scope="col" className="px-4 py-3">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {events.map((event) => (
              <tr key={event.id} className="transition-colors hover:bg-surface/60">
                <td className="px-4 py-3">
                  <p className="font-medium text-ink">{event.title}</p>
                  <p className="text-[13px] text-muted-foreground">
                    {SERIES_LABEL[event.series]} · {formatDateTime(event.startsAt)}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <Tag tone={STATUS_TONE[event.status]}>{EVENT_STATUS_LABEL[event.status]}</Tag>
                </td>
                <td className="px-4 py-3 text-[13px] text-ink">
                  {[event.partnerName, event.staffCheckin ? "Equipe PRX" : null, "Admin"].filter(Boolean).join(" · ")}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-ink">
                  {event.stats.valid + event.stats.used}
                  {event.capacity !== null ? ` / ${event.capacity}` : ""}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-ink">{event.stats.pending}</td>
                <td className="px-4 py-3 text-right tabular-nums text-ink">{event.stats.used}</td>
                <td className="px-4 py-3 text-right tabular-nums text-ink">{formatBRL(event.stats.confirmedRevenue)}</td>
                <td className="px-4 py-3 text-right">
                  <Button variant="secondary" size="sm" onClick={() => onOpen(event.id)}>
                    Abrir
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Formulário                                                                  */
/* -------------------------------------------------------------------------- */

interface BatchDraft {
  id: string;
  name: string;
  price: string;
  quantity: string;
  closed: boolean;
}

interface EventDraft {
  series: EventSeries;
  title: string;
  summary: string;
  startsAt: string;
  endsAt: string;
  venue: string;
  city: string;
  address: string;
  coverUrl: string;
  capacity: string;
  perUserLimit: string;
  minPrxLevel: string;
  partnerId: string;
  staffCheckin: boolean;
  /** "" = a definir (não publica); "0" = livre. */
  minAge: string;
  idCheckRequired: boolean;
  entryRequirements: string;
  cancellationPolicy: string;
  organizerName: string;
  batches: BatchDraft[];
  modalities: RunModality[];
  categories: string;
  kitPickup: string;
}

const newBatchId = () => `b${Math.random().toString(36).slice(2, 10)}`;

function draftFrom(event: LiveEvent | null): EventDraft {
  if (!event) {
    return {
      series: "session",
      title: "",
      summary: "",
      startsAt: "",
      endsAt: "",
      venue: "",
      city: "São Paulo, SP",
      address: "",
      coverUrl: "",
      capacity: "",
      perUserLimit: "1",
      minPrxLevel: "1",
      partnerId: "",
      staffCheckin: true,
      minAge: "",
      idCheckRequired: false,
      entryRequirements: "",
      cancellationPolicy: "",
      organizerName: "",
      batches: [{ id: newBatchId(), name: "1º lote", price: "0", quantity: "", closed: false }],
      modalities: ["5k", "10k"],
      categories: DEFAULT_RUN_CATEGORIES.join(", "),
      kitPickup: "",
    };
  }
  return {
    series: event.series,
    title: event.title,
    summary: event.summary,
    startsAt: toLocalInput(event.startsAt),
    endsAt: toLocalInput(event.endsAt),
    venue: event.venue,
    city: event.city,
    address: event.address,
    coverUrl: event.coverUrl,
    capacity: event.capacity === null ? "" : String(event.capacity),
    perUserLimit: String(event.perUserLimit),
    minPrxLevel: String(event.minPrxLevel),
    partnerId: event.partnerId ?? "",
    staffCheckin: event.staffCheckin,
    minAge: event.minAge === null ? "" : String(event.minAge),
    idCheckRequired: event.idCheckRequired,
    entryRequirements: event.entryRequirements,
    cancellationPolicy: event.cancellationPolicy,
    organizerName: event.organizerName,
    batches: event.batches.map((b) => ({ id: b.id, name: b.name, price: String(b.price), quantity: b.quantity === null ? "" : String(b.quantity), closed: b.closed })),
    modalities: event.run?.modalities ?? ["5k", "10k"],
    categories: (event.run?.categories ?? DEFAULT_RUN_CATEGORIES).join(", "),
    kitPickup: event.run?.kitPickup ?? "",
  };
}

const money = (text: string) => Number(text.replace(/\./g, "").replace(",", ".")) || 0;

function payloadFrom(draft: EventDraft, status: EventStatus) {
  const startsAt = fromLocalInput(draft.startsAt);
  return {
    series: draft.series,
    title: draft.title,
    summary: draft.summary,
    startsAt: startsAt ?? "",
    endsAt: draft.endsAt ? fromLocalInput(draft.endsAt) : null,
    venue: draft.venue,
    city: draft.city,
    address: draft.address,
    coverUrl: draft.coverUrl,
    capacity: draft.capacity.trim() ? Number(draft.capacity) : null,
    perUserLimit: Number(draft.perUserLimit) || 1,
    minPrxLevel: Number(draft.minPrxLevel) || 1,
    partnerId: draft.partnerId || null,
    staffCheckin: draft.staffCheckin,
    minAge: draft.minAge === "" ? null : Number(draft.minAge),
    idCheckRequired: draft.idCheckRequired,
    entryRequirements: draft.entryRequirements,
    cancellationPolicy: draft.cancellationPolicy,
    organizerName: draft.organizerName,
    status,
    batches: draft.batches.map((b) => ({ id: b.id, name: b.name, price: money(b.price), quantity: b.quantity.trim() ? Number(b.quantity) : null, closed: b.closed })),
    run:
      draft.series === "run"
        ? {
            modalities: draft.modalities,
            categories: draft.categories
              .split(",")
              .map((c) => c.trim())
              .filter(Boolean),
            kitPickup: draft.kitPickup,
            results: [],
          }
        : null,
  };
}

function EventSheet({
  event,
  open,
  partners,
  onClose,
  onSaved,
}: {
  event: LiveEvent | null;
  open: boolean;
  partners: PartnerOption[];
  onClose: () => void;
  onSaved: (event: LiveEvent) => Promise<void>;
}) {
  return (
    <Sheet open={open} onClose={onClose} size="lg" title={event ? `Editar ${event.title}` : "Novo evento"} description="Dados que aparecem no app, lotes e quem valida os ingressos na portaria.">
      {open && <EventForm key={event?.id ?? "new"} event={event} partners={partners} onSaved={onSaved} />}
    </Sheet>
  );
}

function EventForm({ event, partners, onSaved }: { event: LiveEvent | null; partners: PartnerOption[]; onSaved: (event: LiveEvent) => Promise<void> }) {
  const [draft, setDraft] = useState<EventDraft>(() => draftFrom(event));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cover = useImageUpload((url) => setDraft((d) => ({ ...d, coverUrl: url })), setError);
  const set = <K extends keyof EventDraft>(key: K, value: EventDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setBatch = (index: number, patch: Partial<BatchDraft>) => setDraft((d) => ({ ...d, batches: d.batches.map((b, i) => (i === index ? { ...b, ...patch } : b)) }));
  const partner = partners.find((p) => p.id === draft.partnerId);

  async function save(status: EventStatus, e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    if (!fromLocalInput(draft.startsAt)) return setError("Informe a data e a hora de início.");
    if (draft.endsAt && !fromLocalInput(draft.endsAt)) return setError("Data de término inválida.");
    setBusy(true);
    const payload = payloadFrom(draft, status);
    const { ok, data } = event
      ? await api<ApiResult & { event?: LiveEvent }>("/api/admin/live/events", { method: "PUT", body: { id: event.id, action: "update", event: payload } })
      : await api<ApiResult & { event?: LiveEvent }>("/api/admin/live/events", { method: "POST", body: payload });
    setBusy(false);
    if (!ok || !data.event) return setError(data.error || "Não foi possível salvar o evento.");
    await onSaved(data.event);
  }

  const section = "col-span-full pt-2 text-[15px] font-semibold text-ink";

  return (
    <form onSubmit={(e) => void save(event?.status ?? "draft", e)} className="grid gap-5 sm:grid-cols-2">
      <Field label="Série">
        {(id) => (
          <Select id={id} value={draft.series} onChange={(e) => set("series", e.target.value as EventSeries)} disabled={Boolean(event)}>
            {EVENT_SERIES.filter((s) => s !== "resenha" || event?.series === "resenha").map((s) => (
              <option key={s} value={s}>
                {SERIES_LABEL[s]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Título">{(id) => <Input id={id} value={draft.title} maxLength={120} onChange={(e) => set("title", e.target.value)} required />}</Field>
      <Field label="Descrição" className="sm:col-span-2">
        {(id) => <Textarea id={id} value={draft.summary} maxLength={2000} onChange={(e) => set("summary", e.target.value)} required />}
      </Field>
      <Field label="Início" hint="Horário de Brasília.">
        {(id, describedBy) => <Input id={id} aria-describedby={describedBy} type="datetime-local" value={draft.startsAt} onChange={(e) => set("startsAt", e.target.value)} required />}
      </Field>
      <Field label="Término (opcional)" hint="Sem término, a portaria fecha 12h após o início.">
        {(id, describedBy) => <Input id={id} aria-describedby={describedBy} type="datetime-local" value={draft.endsAt} onChange={(e) => set("endsAt", e.target.value)} />}
      </Field>
      <Field label="Local">{(id) => <Input id={id} value={draft.venue} maxLength={120} onChange={(e) => set("venue", e.target.value)} required />}</Field>
      <Field label="Cidade / UF">{(id) => <Input id={id} value={draft.city} maxLength={120} onChange={(e) => set("city", e.target.value)} required />}</Field>
      <Field label="Endereço (opcional)" className="sm:col-span-2">
        {(id) => <Input id={id} value={draft.address} maxLength={300} onChange={(e) => set("address", e.target.value)} />}
      </Field>
      <div className="sm:col-span-2">
        <ImagePicker label="Capa (opcional)" value={draft.coverUrl} busy={cover.busy} onChange={(e) => cover.upload(e, "banner")} />
      </div>

      <h3 className={section}>Portaria</h3>
      <Field label="Parceiro do evento (opcional)" hint={partner && !partner.hasLogin ? "Este parceiro ainda não tem login no portal: ele não conseguirá validar." : "O parceiro ligado valida os ingressos no portal dele."}>
        {(id, describedBy) => (
          <Select id={id} aria-describedby={describedBy} value={draft.partnerId} onChange={(e) => set("partnerId", e.target.value)}>
            <option value="">Sem parceiro</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.status !== "ATIVO" ? ` (${p.status.toLowerCase()})` : ""}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="flex items-end">
        <Checkbox label="Equipe PRX valida ingressos" hint="Funcionários com permissão de ingressos validam pelo portal da Equipe PRX." checked={draft.staffCheckin} onChange={(v) => set("staffCheckin", v)} />
      </div>

      <h3 className={section}>Classificação e condições de entrada</h3>
      <Field label="Idade mínima" hint="Obrigatória para publicar. Vale na compra (servidor) e na portaria.">
        {(id, describedBy) => (
          <Select id={id} aria-describedby={describedBy} value={draft.minAge} onChange={(e) => set("minAge", e.target.value)}>
            <option value="">A definir</option>
            {AGE_OPTIONS.map((age) => (
              <option key={age} value={String(age)}>
                {ageRatingLabel(age)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="flex items-end">
        <Checkbox
          label="Documento com foto na entrada"
          hint="Obrigatório quando há idade mínima: a portaria confere o documento e o nome."
          checked={draft.idCheckRequired}
          onChange={(v) => set("idCheckRequired", v)}
        />
      </div>
      <Field label="Outras condições de entrada (opcional)" className="sm:col-span-2" hint="Aparece antes da compra e no ingresso.">
        {(id, describedBy) => <Textarea id={id} aria-describedby={describedBy} value={draft.entryRequirements} maxLength={600} onChange={(e) => set("entryRequirements", e.target.value)} />}
      </Field>
      <Field label="Organizador" hint="Quem responde pelo evento. Obrigatório para publicar.">
        {(id, describedBy) => <Input id={id} aria-describedby={describedBy} value={draft.organizerName} maxLength={120} onChange={(e) => set("organizerName", e.target.value)} />}
      </Field>
      <Field label="Política de cancelamento e reembolso" className="sm:col-span-2" hint="Obrigatória para publicar (mínimo 20 caracteres). Aparece antes da compra.">
        {(id, describedBy) => <Textarea id={id} aria-describedby={describedBy} value={draft.cancellationPolicy} maxLength={1500} onChange={(e) => set("cancellationPolicy", e.target.value)} />}
      </Field>

      <h3 className={section}>Lotação e regras</h3>
      <Field label="Lotação total (opcional)" hint="Vazio: limitado só pelos lotes.">
        {(id, describedBy) => <Input id={id} aria-describedby={describedBy} type="number" min={1} inputMode="numeric" value={draft.capacity} onChange={(e) => set("capacity", e.target.value)} />}
      </Field>
      <Field label="Ingressos por pessoa">
        {(id) => <Input id={id} type="number" min={1} max={20} inputMode="numeric" value={draft.perUserLimit} onChange={(e) => set("perUserLimit", e.target.value)} />}
      </Field>
      <Field label="Nível PRX mínimo">
        {(id) => (
          <Select id={id} value={draft.minPrxLevel} onChange={(e) => set("minPrxLevel", e.target.value)}>
            {levelGateOptions(Number(draft.minPrxLevel)).map((level) => (
              <option key={level} value={level}>
                {level === 1 ? "Todos os membros" : `Nível ${level}+`}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <h3 className={section}>Lotes</h3>
      <p className="col-span-full -mt-3 text-[13px] text-muted-foreground">Preço 0 = gratuito (ingresso sai na hora). Pago = reserva que a PRX confirma até o pagamento online entrar.</p>
      <ul className="col-span-full space-y-3">
        {draft.batches.map((batch, index) => (
          <li key={batch.id} className="grid gap-3 rounded-3xl glass-soft p-4 sm:grid-cols-[1fr_120px_120px_auto_auto] sm:items-end">
            <Field label="Nome do lote">{(id) => <Input id={id} value={batch.name} maxLength={60} onChange={(e) => setBatch(index, { name: e.target.value })} />}</Field>
            <Field label="Preço (R$)">{(id) => <Input id={id} inputMode="decimal" value={batch.price} onChange={(e) => setBatch(index, { price: e.target.value })} />}</Field>
            <Field label="Quantidade">{(id) => <Input id={id} type="number" min={1} inputMode="numeric" placeholder="∞" value={batch.quantity} onChange={(e) => setBatch(index, { quantity: e.target.value })} />}</Field>
            <Checkbox label="Encerrado" checked={batch.closed} onChange={(v) => setBatch(index, { closed: v })} />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Remover ${batch.name || "lote"}`}
              disabled={draft.batches.length === 1}
              onClick={() => setDraft((d) => ({ ...d, batches: d.batches.filter((_, i) => i !== index) }))}
            >
              <IconTrash size={16} />
            </Button>
          </li>
        ))}
      </ul>
      <div className="col-span-full">
        <Button type="button" variant="secondary" size="sm" onClick={() => setDraft((d) => ({ ...d, batches: [...d.batches, { id: newBatchId(), name: `${d.batches.length + 1}º lote`, price: "0", quantity: "", closed: false }] }))}>
          <IconPlus size={16} />
          Adicionar lote
        </Button>
      </div>

      {draft.series === "run" && (
        <>
          <h3 className={section}>PRX RUN</h3>
          <fieldset className="col-span-full">
            <legend className="text-[13px] font-medium text-ink">Distâncias</legend>
            <div className="mt-1 flex flex-wrap gap-x-6">
              {RUN_MODALITIES.map((m) => (
                <Checkbox
                  key={m}
                  label={m.toUpperCase()}
                  checked={draft.modalities.includes(m)}
                  onChange={(checked) => set("modalities", checked ? [...draft.modalities, m] : draft.modalities.filter((x) => x !== m))}
                />
              ))}
            </div>
          </fieldset>
          <Field label="Categorias" hint="Separadas por vírgula.">
            {(id, describedBy) => <Input id={id} aria-describedby={describedBy} value={draft.categories} onChange={(e) => set("categories", e.target.value)} />}
          </Field>
          <Field label="Retirada do kit">{(id) => <Input id={id} value={draft.kitPickup} maxLength={300} onChange={(e) => set("kitPickup", e.target.value)} />}</Field>
        </>
      )}

      {error && (
        <Notice tone="error" className="col-span-full">
          {error}
        </Notice>
      )}

      <div className="col-span-full flex flex-col gap-2 sm:flex-row sm:justify-end">
        {event ? (
          <Button type="submit" disabled={busy}>
            {busy ? "Salvando…" : "Salvar alterações"}
          </Button>
        ) : (
          <>
            <Button type="submit" variant="secondary" disabled={busy}>
              Salvar rascunho
            </Button>
            <Button type="button" disabled={busy} onClick={() => void save("published")}>
              {busy ? "Salvando…" : "Publicar agora"}
            </Button>
          </>
        )}
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Detalhe do evento                                                           */
/* -------------------------------------------------------------------------- */

function EventDetail({ event, onBack, onEdit, onChanged, onDeleted }: { event: AdminEvent; onBack: () => void; onEdit: () => void; onChanged: () => Promise<void>; onDeleted: () => void }) {
  const { confirmDelete } = useConfirmToast();
  const [tickets, setTickets] = useState<LiveTicket[]>([]);
  const [stats, setStats] = useState<EventStats>(event.stats);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TicketStatus | "all">("all");
  const [invite, setInvite] = useState({ email: "", note: "" });
  const [results, setResults] = useState("");
  const [busy, setBusy] = useState(false);

  const loadTickets = useCallback(async () => {
    const { ok, data } = await api<ApiResult & { tickets?: LiveTicket[]; stats?: EventStats }>(`/api/admin/live/tickets?eventId=${encodeURIComponent(event.id)}`);
    if (!ok) return setFeedback({ ok: false, text: data.error || "Não foi possível carregar os ingressos." });
    setTickets(data.tickets ?? []);
    if (data.stats) setStats(data.stats);
  }, [event.id]);

  useEffect(() => {
    let active = true;
    api<ApiResult & { tickets?: LiveTicket[]; stats?: EventStats }>(`/api/admin/live/tickets?eventId=${encodeURIComponent(event.id)}`).then(({ ok, data }) => {
      if (!active) return;
      if (!ok) return setFeedback({ ok: false, text: data.error || "Não foi possível carregar os ingressos." });
      setTickets(data.tickets ?? []);
      if (data.stats) setStats(data.stats);
    });
    return () => {
      active = false;
    };
  }, [event.id]);

  async function run(body: Record<string, unknown>, success: string, url = "/api/admin/live/tickets", method = "POST") {
    setBusy(true);
    setFeedback(null);
    const { ok, data } = await api(url, { method, body });
    setBusy(false);
    if (!ok) {
      setFeedback({ ok: false, text: data.error || "Não foi possível concluir." });
      return false;
    }
    setFeedback({ ok: true, text: success });
    await Promise.all([loadTickets(), onChanged()]);
    return true;
  }

  async function setStatus(status: EventStatus) {
    if (status === "cancelled") {
      const confirmed = await confirmDelete({ message: `Cancelar "${event.title}"? Reservas pendentes são canceladas e nenhum ingresso passa na portaria.`, title: "Cancelar evento" });
      if (!confirmed) return;
    }
    await run({ id: event.id, action: "status", status }, status === "published" ? "Evento publicado no app." : status === "draft" ? "Evento voltou a rascunho." : "Evento cancelado.", "/api/admin/live/events", "PUT");
  }

  async function remove() {
    const confirmed = await confirmDelete({ message: `Excluir "${event.title}"? Só é possível enquanto não houver ingressos.`, title: "Excluir evento" });
    if (!confirmed) return;
    setBusy(true);
    const { ok, data } = await api(`/api/admin/live/events?id=${encodeURIComponent(event.id)}`, { method: "DELETE" });
    setBusy(false);
    if (!ok) return setFeedback({ ok: false, text: data.error || "Não foi possível excluir." });
    onDeleted();
  }

  async function sendInvite(e: FormEvent) {
    e.preventDefault();
    if (await run({ action: "invite", eventId: event.id, email: invite.email, note: invite.note }, `Convite emitido para ${invite.email}.`)) setInvite({ email: "", note: "" });
  }

  async function saveResults(e: FormEvent) {
    e.preventDefault();
    if (await run({ id: event.id, action: "results", text: results }, "Resultados publicados.", "/api/admin/live/events", "PUT")) setResults("");
  }

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tickets
      .filter((t) => filter === "all" || t.status === filter)
      .filter((t) => !q || t.holderName.toLowerCase().includes(q) || t.userEmail.includes(q) || t.code.toLowerCase().includes(q));
  }, [tickets, filter, query]);

  const kpis = [
    { label: "Ingressos de teste", value: String(stats.test ?? 0) },
    { label: "Aguardando pagamento", value: String(stats.pending) },
    { label: "Ingressos válidos", value: String(stats.valid) },
    { label: "Entradas na portaria", value: String(stats.used) },
    { label: "Receita confirmada", value: formatBRL(stats.confirmedRevenue) },
    { label: "Lugares restantes", value: stats.capacityLeft === null ? "Sem limite" : String(stats.capacityLeft) },
  ];

  return (
    <section aria-labelledby="event-detail-title" className="space-y-8">
      <div className="space-y-4">
        <Button variant="ghost" size="sm" className="-ml-3" onClick={onBack}>
          <IconArrowLeft size={16} />
          Eventos
        </Button>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Tag tone={STATUS_TONE[event.status]}>{EVENT_STATUS_LABEL[event.status]}</Tag>
              <Tag>{SERIES_LABEL[event.series]}</Tag>
              {event.ended && <Tag>Encerrado</Tag>}
            </div>
            <h2 id="event-detail-title" className="font-display text-2xl font-semibold tracking-[-0.03em] text-ink sm:text-3xl">
              {event.title}
            </h2>
            <p className="text-sm text-muted-foreground">
              {formatDateTime(event.startsAt)} · {event.venue}, {event.city}
            </p>
            <p className="text-sm text-muted-foreground">
              Portaria: {[event.partnerName ? `parceiro ${event.partnerName}` : null, event.staffCheckin ? "Equipe PRX" : null, "admin"].filter(Boolean).join(", ")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {event.status !== "cancelled" && (
              <Button variant="secondary" size="sm" onClick={onEdit} disabled={busy}>
                Editar
              </Button>
            )}
            {event.status === "draft" && (
              <Button size="sm" onClick={() => void setStatus("published")} disabled={busy}>
                Publicar
              </Button>
            )}
            {event.status === "published" && stats.total === 0 && (
              <Button variant="secondary" size="sm" onClick={() => void setStatus("draft")} disabled={busy}>
                Despublicar
              </Button>
            )}
            {event.status !== "cancelled" && !event.ended && (
              <Button variant="danger" size="sm" onClick={() => void setStatus("cancelled")} disabled={busy}>
                Cancelar evento
              </Button>
            )}
            {stats.total === 0 && (
              <Button variant="ghost" size="sm" onClick={() => void remove()} disabled={busy}>
                <IconTrash size={16} />
                Excluir
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-3xl glass p-5">
            <p className="text-[13px] text-muted-foreground">{kpi.label}</p>
            <p className="mt-2 text-[26px] font-light leading-none tracking-[-0.03em] text-ink tabular-nums">{kpi.value}</p>
          </div>
        ))}
      </div>

      {feedback && <Notice tone={feedback.ok ? "success" : "error"}>{feedback.text}</Notice>}

      <ReadinessPanel event={event} />

      {event.status !== "cancelled" && !event.ended && (
        <form onSubmit={(e) => void sendInvite(e)} className="grid gap-4 rounded-3xl glass p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Convite (cortesia) para o e-mail do membro">
            {(id) => <Input id={id} type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} required className="in-[.bg-surface]:bg-card" />}
          </Field>
          <Field label="Observação (opcional)">{(id) => <Input id={id} value={invite.note} maxLength={300} onChange={(e) => setInvite({ ...invite, note: e.target.value })} className="in-[.bg-surface]:bg-card" />}</Field>
          <Button type="submit" disabled={busy}>
            Emitir convite
          </Button>
        </form>
      )}

      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-xl font-semibold tracking-[-0.02em] text-ink">Ingressos e reservas</h3>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative sm:w-64">
              <IconSearch size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <label htmlFor="ticket-search" className="sr-only">
                Buscar ingresso
              </label>
              <Input id="ticket-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nome, e-mail ou código" className="pl-11" />
            </div>
            <label htmlFor="ticket-filter" className="sr-only">
              Filtrar por status
            </label>
            <Select id="ticket-filter" value={filter} onChange={(e) => setFilter(e.target.value as TicketStatus | "all")} className="sm:w-52">
              <option value="all">Todos os status</option>
              {(Object.keys(TICKET_STATUS_LABEL) as TicketStatus[]).map((s) => (
                <option key={s} value={s}>
                  {TICKET_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {shown.length === 0 ? (
          <EmptyState title={tickets.length === 0 ? "Nenhum ingresso ainda" : "Nada com esse filtro"} body={tickets.length === 0 ? "Reservas, ingressos gratuitos e convites aparecem aqui." : undefined} />
        ) : (
          <div className="glass overflow-x-auto rounded-3xl">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-line bg-surface text-[13px] text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-medium">Titular</th>
                  <th scope="col" className="px-4 py-3 font-medium">Código</th>
                  <th scope="col" className="px-4 py-3 font-medium">Lote</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Valor</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((ticket) => (
                  <tr key={ticket.id} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">
                        {ticket.holderName}
                        {ticket.isTest && <span className="ml-2 align-middle text-[11px] font-semibold uppercase tracking-[0.06em] text-destructive">Teste</span>}
                      </p>
                      <p className="text-[13px] text-muted-foreground">{ticket.userEmail}</p>
                      {ticket.discount > 0 && <p className="text-[13px] text-muted-foreground">Desconto de {formatBRL(ticket.discount)} (cupom)</p>}
                      {ticket.runDetails && (
                        <p className="text-[13px] text-muted-foreground">
                          {ticket.runDetails.modality.toUpperCase()} · {ticket.runDetails.category} · {ticket.runDetails.shirtSize}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-[13px] text-ink">{ticket.code}</td>
                    <td className="px-4 py-3 text-ink">
                      {ticket.batchName}
                      {ticket.source === "invite" && <span className="block text-[13px] text-muted-foreground">Convite</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink">{ticket.price === 0 ? "—" : formatBRL(ticket.price)}</td>
                    <td className="px-4 py-3">
                      <Tag tone={TICKET_TONE[ticket.status]}>{TICKET_STATUS_LABEL[ticket.status]}</Tag>
                      <span className="mt-1 block text-[12px] text-muted-foreground">
                        {ticket.status === "used" && ticket.checkedInAt
                          ? `${formatDateTime(ticket.checkedInAt)} · ${ticket.checkedInByName || (ticket.checkedInByRole ? VALIDATOR_LABEL[ticket.checkedInByRole] : "")}`
                          : ticket.status === "pending_payment"
                            ? `Reservado ${formatDateTime(ticket.createdAt)}`
                            : ticket.note}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {ticket.status === "pending_payment" && (
                          <Button size="sm" disabled={busy} onClick={() => void run({ action: "confirm_payment", ticketId: ticket.id, note: "Pagamento confirmado pelo admin." }, `Pagamento de ${ticket.holderName} confirmado.`)}>
                            Confirmar pagamento
                          </Button>
                        )}
                        {ticket.status === "valid" && !event.ended && event.status !== "cancelled" && (
                          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run({ action: "checkin", code: ticket.code }, `Entrada de ${ticket.holderName} registrada.`)}>
                            Check-in
                          </Button>
                        )}
                        {(ticket.status === "pending_payment" || ticket.status === "valid") && (
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run({ action: "cancel", ticketId: ticket.id, note: "Cancelado pelo admin." }, "Ingresso cancelado.")}>
                            Cancelar
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {event.series === "run" && (
        <form onSubmit={(e) => void saveResults(e)} className="space-y-4">
          <h3 className="text-xl font-semibold tracking-[-0.02em] text-ink">Resultados da etapa</h3>
          <p className="text-sm text-muted-foreground">
            Uma linha por atleta: <code className="font-mono text-ink">posição;nome;categoria;distância;tempo</code>. Publicar substitui a lista atual ({event.run?.results.length ?? 0}{" "}
            {(event.run?.results.length ?? 0) === 1 ? "atleta" : "atletas"}). Aparece no app quando a etapa termina.
          </p>
          <Field label="Classificação">{(id) => <Textarea id={id} value={results} onChange={(e) => setResults(e.target.value)} className="min-h-40 font-mono text-sm" placeholder={"1;Ana Souza;Sub-23;10k;38:12\n2;Bruno Lima;Geral;10k;39:05"} />}</Field>
          <Button type="submit" disabled={busy || !results.trim()}>
            Publicar resultados
          </Button>
        </form>
      )}
    </section>
  );
}

/** Prontidão do evento: o que falta para publicar e para operar (teste de portaria). */
function ReadinessPanel({ event }: { event: AdminEvent }) {
  const { readiness } = event;
  return (
    <section aria-labelledby={`ready-${event.id}`} className="space-y-4 rounded-3xl glass p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id={`ready-${event.id}`} className="text-lg font-semibold tracking-[-0.02em] text-ink">
          Prontidão para o lançamento
        </h3>
        <Tag tone={readiness.operational ? "success" : readiness.publishable ? "accent" : "warning"}>
          {readiness.operational ? "Pronto para operar" : readiness.publishable ? "Publicável · falta o teste de portaria" : "Dados pendentes"}
        </Tag>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {readiness.items.map((item) => (
          <li key={item.key} className="flex items-start gap-3 rounded-2xl bg-surface px-4 py-3">
            <span aria-hidden className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${item.ok ? "bg-success" : item.blocking ? "bg-destructive" : "bg-[#d97706]"}`} />
            <span className="min-w-0">
              <span className="block text-[14px] font-medium text-ink">
                {item.label}
                <span className="sr-only">{item.ok ? " (ok)" : item.blocking ? " (pendente, bloqueia a publicação)" : " (atenção)"}</span>
              </span>
              <span className="block break-words text-[13px] text-muted-foreground">{item.detail}</span>
            </span>
          </li>
        ))}
      </ul>
      {event.doorTestVerifiedAt && (
        <p className="text-[13px] text-muted-foreground">
          Teste de portaria em {formatDateTime(event.doorTestVerifiedAt)}
          {event.doorTestVerifiedBy ? ` por ${event.doorTestVerifiedBy}` : ""}.
        </p>
      )}
    </section>
  );
}
