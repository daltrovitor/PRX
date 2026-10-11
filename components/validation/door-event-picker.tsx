// Hello World
"use client";

import { useEffect, useState } from "react";
import { Field, Select } from "@/components/app/ui";
import type { DoorEventView } from "@/lib/live/service";
import { formatDateTime } from "@/lib/live/format";

/**
 * Escolha do evento que a portaria está operando. Com um evento escolhido, o
 * servidor recusa ingressos de qualquer outro evento (e registra a recusa).
 * Lista só os eventos que este operador pode validar.
 */
export function DoorEventPicker({ endpoint, value, onChange }: { endpoint: string; value: string | null; onChange: (eventId: string | null) => void }) {
  const [events, setEvents] = useState<DoorEventView[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(endpoint, { cache: "no-store" })
      .then((res) => res.json() as Promise<{ events?: DoorEventView[] }>)
      .then((data) => {
        if (!active) return;
        setEvents((data.events ?? []).filter((e) => e.event.status === "published" && !e.event.ended));
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [endpoint]);

  const selected = events?.find((e) => e.event.id === value) ?? null;

  return (
    <Field
      label="Evento da portaria"
      hint={
        failed
          ? "Não foi possível carregar os eventos. A validação continua, sem restringir o evento."
          : selected
            ? `${selected.event.ageRating}${selected.event.idCheckRequired ? " · documento com foto obrigatório" : ""} · ${selected.stats.used} de ${selected.stats.valid + selected.stats.used} entradas`
            : "Escolha o evento para recusar ingressos de outros eventos."
      }
    >
      {(id, describedBy) => (
        <Select id={id} aria-describedby={describedBy} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} disabled={!events}>
          <option value="">Todos os eventos que posso validar</option>
          {(events ?? []).map(({ event }) => (
            <option key={event.id} value={event.id}>
              {event.title} · {formatDateTime(event.startsAt)}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}
