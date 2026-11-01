// Hello World
"use client";

import { useState, type FormEvent } from "react";
import { Button, Field, Input, Notice, Segmented, Select, Sheet, Textarea } from "@/components/app/ui";
import type { AdminEditionView, AdminOverview } from "@/lib/resenha/admin";
import { fromLocalInput, toLocalInput } from "@/lib/live/format";
import { HOST_ARTICLES, INSIDER_KIND_LABEL, INSIDER_KINDS, type HostArticle, type InsiderKind } from "@/lib/resenha/types";

export interface EditionPayload {
  hostName: string;
  hostArticle: HostArticle;
  startsAt: string;
  endsAt: string | null;
  venue: string;
  city: string;
  address: string;
  capacity: number | null;
  organizerName: string;
  cancellationPolicy: string;
}

export interface InsiderPayload {
  mode: "create" | "link";
  name: string;
  email: string;
  handle: string;
  kind: InsiderKind;
  quota: number;
}

interface SheetProps<T> {
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (payload: T) => void;
}

/** Nova edição ou edição dos dados da festa. O local só aparece para quem entra na lista. */
export function EditionSheet({ edition, busy, error, onClose, onSave }: SheetProps<EditionPayload> & { edition: AdminEditionView | null }) {
  const [draft, setDraft] = useState({
    hostName: edition?.hostName ?? "",
    hostArticle: (edition?.hostArticle ?? "da") as HostArticle,
    startsAt: toLocalInput(edition?.event.startsAt),
    endsAt: toLocalInput(edition?.event.endsAt),
    venue: edition?.event.venue ?? "",
    city: edition?.event.city ?? "",
    address: edition?.event.address ?? "",
    capacity: edition?.event.capacity ? String(edition.event.capacity) : "",
    organizerName: edition?.event.organizerName ?? "",
    cancellationPolicy: edition?.event.cancellationPolicy ?? "",
  });
  const [localError, setLocalError] = useState<string | null>(null);
  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) => setDraft((prev) => ({ ...prev, [key]: value }));

  function submit(event: FormEvent) {
    event.preventDefault();
    const startsAt = fromLocalInput(draft.startsAt);
    const endsAt = draft.endsAt ? fromLocalInput(draft.endsAt) : null;
    if (!startsAt) return setLocalError("Informe a data e a hora da festa.");
    if (draft.endsAt && !endsAt) return setLocalError("O horário de fim é inválido.");
    setLocalError(null);
    onSave({
      hostName: draft.hostName,
      hostArticle: draft.hostArticle,
      startsAt,
      endsAt,
      venue: draft.venue,
      city: draft.city,
      address: draft.address,
      capacity: draft.capacity ? Number(draft.capacity) : null,
      organizerName: draft.organizerName,
      cancellationPolicy: draft.cancellationPolicy,
    });
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={edition ? `Editar ${edition.title}` : "Nova Resenha"}
      description={edition ? undefined : "Cria a edição como rascunho. A lista só abre quando você mudar para “Lista aberta”."}
      footer={
        <Button block type="submit" form="resenha-edition-form" disabled={busy}>
          {busy ? "Salvando…" : edition ? "Salvar edição" : "Criar edição"}
        </Button>
      }
    >
      <form id="resenha-edition-form" onSubmit={submit} className="grid gap-5 sm:grid-cols-2">
        <Field label="Host (quem dá nome à Resenha)">
          {(id) => <Input id={id} value={draft.hostName} onChange={(e) => set("hostName", e.target.value)} placeholder="Bia" maxLength={60} required />}
        </Field>
        <Field label="Artigo" hint="“Resenha da Bia” ou “Resenha do Gabs”.">
          {(id, describedBy) => (
            <Select id={id} aria-describedby={describedBy} value={draft.hostArticle} onChange={(e) => set("hostArticle", e.target.value as HostArticle)}>
              {HOST_ARTICLES.map((a) => (
                <option key={a} value={a}>
                  {a === "da" ? "da (Resenha da…)" : "do (Resenha do…)"}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Início">
          {(id) => <Input id={id} type="datetime-local" value={draft.startsAt} onChange={(e) => set("startsAt", e.target.value)} required />}
        </Field>
        <Field label="Fim (opcional)">{(id) => <Input id={id} type="datetime-local" value={draft.endsAt} onChange={(e) => set("endsAt", e.target.value)} />}</Field>
        <Field label="Local" hint="Só quem está na lista vê o local.">
          {(id, describedBy) => <Input id={id} aria-describedby={describedBy} value={draft.venue} onChange={(e) => set("venue", e.target.value)} required />}
        </Field>
        <Field label="Cidade">{(id) => <Input id={id} value={draft.city} onChange={(e) => set("city", e.target.value)} placeholder="São Paulo, SP" required />}</Field>
        <Field label="Endereço" className="sm:col-span-2">
          {(id) => <Input id={id} value={draft.address} onChange={(e) => set("address", e.target.value)} placeholder="Rua, número, complemento" />}
        </Field>
        <Field label="Lotação (opcional)" hint="Passou disso, ninguém mais é liberado, mesmo com PASS sobrando." className="sm:col-span-2">
          {(id, describedBy) => <Input id={id} aria-describedby={describedBy} type="number" min={1} inputMode="numeric" value={draft.capacity} onChange={(e) => set("capacity", e.target.value)} />}
        </Field>
        <Field label="Organizador" hint="Quem responde pela festa. Obrigatório para abrir a lista." className="sm:col-span-2">
          {(id, describedBy) => <Input id={id} aria-describedby={describedBy} value={draft.organizerName} maxLength={120} onChange={(e) => set("organizerName", e.target.value)} />}
        </Field>
        <Field label="Política de cancelamento" hint="Obrigatória para abrir a lista (mínimo 20 caracteres). Toda Resenha é 18+ com documento com foto." className="sm:col-span-2">
          {(id, describedBy) => <Textarea id={id} aria-describedby={describedBy} value={draft.cancellationPolicy} maxLength={1500} onChange={(e) => set("cancellationPolicy", e.target.value)} />}
        </Field>
        {(localError || error) && (
          <Notice tone="error" className="sm:col-span-2">
            {localError || error}
          </Notice>
        )}
      </form>
    </Sheet>
  );
}

/** Coloca um Insider na edição, com a cota de PASSes e o link próprio. */
export function InsiderSheet({ edition, existing, busy, error, onClose, onSave }: SheetProps<InsiderPayload> & { edition: AdminEditionView; existing: AdminOverview["insiders"] }) {
  const [draft, setDraft] = useState({ mode: "create" as InsiderPayload["mode"], name: "", email: "", handle: "", kind: "insider" as InsiderKind, quota: "10" });
  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) => setDraft((prev) => ({ ...prev, [key]: value }));
  const known = existing.find((i) => i.email === draft.email.trim().toLowerCase());

  function submit(event: FormEvent) {
    event.preventDefault();
    onSave({ mode: draft.mode, name: known?.name ?? draft.name, email: draft.email, handle: draft.handle, kind: draft.kind, quota: Number(draft.quota) });
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Adicionar Insider"
      description={`${edition.title}: escolha um Insider já cadastrado (digite o e-mail) ou crie um novo. Ele recebe um link próprio e a cota de PASSes.`}
      footer={
        <Button block type="submit" form="resenha-insider-form" disabled={busy}>
          {busy ? "Salvando…" : "Adicionar à edição"}
        </Button>
      }
    >
      <form id="resenha-insider-form" onSubmit={submit} className="grid gap-5 sm:grid-cols-2">
        {!known && (
          <div className="sm:col-span-2">
            <Segmented
              label="Acesso do Insider"
              value={draft.mode}
              onChange={(mode) => set("mode", mode)}
              options={[
                { value: "create", label: "Criar acesso" },
                { value: "link", label: "Vincular conta existente" },
              ]}
            />
          </div>
        )}
        <Field label="E-mail do login" className="sm:col-span-2" hint={known ? `${known.name} já é Insider: ele só entra nesta edição, com o mesmo login.` : undefined}>
          {(id, describedBy) => (
            <>
              <Input id={id} aria-describedby={describedBy} type="email" inputMode="email" autoCapitalize="none" list="resenha-insiders-cadastrados" value={draft.email} onChange={(e) => set("email", e.target.value)} required />
              <datalist id="resenha-insiders-cadastrados">
                {existing
                  .filter((i) => i.active)
                  .map((i) => (
                    <option key={i.id} value={i.email}>
                      {i.name}
                    </option>
                  ))}
              </datalist>
            </>
          )}
        </Field>
        {!known && (
          <>
            <Field label="Nome">{(id) => <Input id={id} value={draft.name} onChange={(e) => set("name", e.target.value)} maxLength={80} required />}</Field>
            <Field label="Instagram (opcional)">{(id) => <Input id={id} autoCapitalize="none" placeholder="@usuario" value={draft.handle} onChange={(e) => set("handle", e.target.value)} />}</Field>
          </>
        )}
        <Field label="Tipo">
          {(id) => (
            <Select id={id} value={draft.kind} onChange={(e) => set("kind", e.target.value as InsiderKind)}>
              {INSIDER_KINDS.map((k) => (
                <option key={k} value={k}>
                  {INSIDER_KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Cota de PASSes" hint="Quantos acessos ele pode liberar. Quando acaba, acabou.">
          {(id, describedBy) => <Input id={id} aria-describedby={describedBy} type="number" min={0} max={500} inputMode="numeric" value={draft.quota} onChange={(e) => set("quota", e.target.value)} required />}
        </Field>
        {error && (
          <Notice tone="error" className="sm:col-span-2">
            {error}
          </Notice>
        )}
      </form>
    </Sheet>
  );
}
