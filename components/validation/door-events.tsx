// Hello World
"use client";

import { useEffect, useMemo, useState } from "react";
import { EventDate } from "@/components/app/shared";
import { Button, EmptyState, Input, Notice, Tag } from "@/components/app/ui";
import { IconRefresh, IconSearch } from "@/components/icons/prx-icons";
import type { DoorEventView } from "@/lib/live/service";
import { formatDateTime, formatTime } from "@/lib/live/format";

async function fetchEvents(endpoint: string): Promise<{ events?: DoorEventView[]; error?: string }> {
  try {
    const res = await fetch(endpoint, { cache: "no-store" });
    const data = (await res.json()) as { events?: DoorEventView[]; error?: string };
    return res.ok ? data : { error: data.error || "Não foi possível carregar os eventos." };
  } catch {
    return { error: "Sem internet agora. Confira sua conexão e tente de novo." };
  }
}

/**
 * Eventos que este validador opera na portaria: números da entrada e lista
 * de convidados para achar o código quando o QR não abre.
 */
export function DoorEvents({ endpoint, refreshKey, onValidate, emptyBody }: { endpoint: string; refreshKey: number; onValidate: (code: string) => void; emptyBody: string }) {
  const [events, setEvents] = useState<DoorEventView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    fetchEvents(endpoint).then((data) => {
      if (!active) return;
      setError(data.error ?? null);
      if (data.events) setEvents(data.events);
    });
    return () => {
      active = false;
    };
  }, [endpoint, refreshKey, reload]);

  const open = events?.find((e) => e.event.id === openId) ?? null;
  const attendees = useMemo(() => {
    if (!open) return [];
    const q = query.trim().toLowerCase();
    return open.attendees.filter((a) => !q || a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q));
  }, [open, query]);

  if (!events) {
    return error ? <Notice tone="error">{error}</Notice> : <div role="status" aria-label="Carregando eventos" className="h-40 rounded-3xl bg-surface" />;
  }

  return (
    <section aria-labelledby="door-events-title" className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <h2 id="door-events-title" className="ob-display text-[28px] text-ink sm:text-[40px]">
          Eventos
        </h2>
        <Button variant="ghost" size="sm" onClick={() => setReload((r) => r + 1)} aria-label="Atualizar eventos">
          <IconRefresh size={16} />
        </Button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}

      {events.length === 0 ? (
        <EmptyState title="Nenhum evento para validar" body={emptyBody} />
      ) : (
        <div className="grid gap-8 lg:grid-cols-12">
          <ul className="space-y-2 lg:col-span-5">
            {events.map(({ event, stats }) => (
              <li key={event.id}>
                <button
                  type="button"
                  aria-pressed={openId === event.id}
                  onClick={() => {
                    setOpenId(event.id);
                    setQuery("");
                  }}
                  className={`grid w-full cursor-pointer grid-cols-[auto_1fr] items-start gap-4 rounded-3xl p-5 text-left transition-colors ${openId === event.id ? "bg-line" : "glass glass-lift"}`}
                >
                  <EventDate iso={event.startsAt} />
                  <span className="min-w-0 space-y-1.5">
                    <span className="flex flex-wrap gap-1.5">
                      <Tag tone="accent">{event.seriesLabel}</Tag>
                      {event.status === "cancelled" && <Tag>Cancelado</Tag>}
                      {event.ended && <Tag>Encerrado</Tag>}
                    </span>
                    <span className="block text-[17px] font-semibold leading-snug text-ink">{event.title}</span>
                    <span className="block text-[13px] text-muted-foreground">
                      {stats.used} de {stats.valid + stats.used} entradas
                      {stats.pending > 0 ? ` · ${stats.pending} aguardando pagamento` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="lg:col-span-7">
            {!open ? (
              <EmptyState title="Escolha um evento" body="Veja quem já entrou e encontre o código de um convidado." />
            ) : (
              <div className="space-y-4">
                <div>
                  <h3 className="text-xl font-semibold tracking-[-0.02em] text-ink">{open.event.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {open.event.venue} · {formatDateTime(open.event.startsAt)}
                  </p>
                </div>
                <div className="relative">
                  <IconSearch size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <label htmlFor="door-search" className="sr-only">
                    Buscar convidado
                  </label>
                  <Input id="door-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nome ou código" className="pl-11" />
                </div>
                {attendees.length === 0 ? (
                  <EmptyState title={open.attendees.length === 0 ? "Nenhum ingresso confirmado" : "Ninguém com esse nome"} />
                ) : (
                  <ul className="divide-y divide-line rounded-3xl glass px-4">
                    {attendees.map((a) => (
                      <li key={a.code} className="flex items-center justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-[15px] font-medium text-ink">
                            {a.name}
                            {a.isTest ? <span className="ml-2 align-middle text-[11px] font-semibold uppercase tracking-[0.06em] text-destructive">Teste</span> : null}
                          </p>
                          <p className="font-mono text-[13px] text-muted-foreground">
                            {a.code} · {a.batchName}
                          </p>
                        </div>
                        {a.status === "used" ? (
                          <Tag tone="accent">Entrou{a.checkedInAt ? ` ${formatTime(a.checkedInAt)}` : ""}</Tag>
                        ) : (
                          <Button size="sm" variant="secondary" onClick={() => onValidate(a.code)} disabled={open.event.status === "cancelled"}>
                            Validar
                          </Button>
                        )}
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
