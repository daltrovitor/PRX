// Hello World
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button, EmptyState, Field, Input, Notice, Segmented, Select, Sheet, Tag, Textarea } from "@/components/app/ui";
import { IconPlus } from "@/components/icons/prx-icons";
import { formatDateTimeBr } from "@/components/admin/pager";
import { fromLocalInput, toLocalInput } from "@/lib/live/format";
import {
  RELATIONSHIP_LABEL,
  STARTUP_RELATIONSHIPS,
  STARTUP_STAGES,
  STARTUP_STAGE_TEXT,
  UPDATE_KINDS,
  UPDATE_KIND_LABEL,
  type FoundersMeeting,
  type FoundersStartup,
  type FoundersUpdate,
} from "@/lib/founders/types";

/**
 * Conteúdo do PRX Founders: encontros (data, local, programação), startups
 * acompanhadas e atualizações (novidades, oportunidades, materiais). Tudo nasce
 * em rascunho; só o publicado aparece no app. Nada é preenchido de antemão.
 */

type Kind = "meeting" | "startup" | "update";
type Item = FoundersMeeting | FoundersStartup | FoundersUpdate;
interface Content {
  meetings: FoundersMeeting[];
  startups: FoundersStartup[];
  updates: FoundersUpdate[];
}

const STATUS_TEXT: Record<string, string> = { draft: "Rascunho", published: "Publicado", cancelled: "Cancelado" };

export function AdminFoundersContent() {
  const [kind, setKind] = useState<Kind>("meeting");
  const [content, setContent] = useState<Content | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ kind: Kind; item: Item | null } | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/founders", { cache: "no-store" })
      .then((r) => r.json() as Promise<Partial<Content> & { error?: string }>)
      .then((json) => {
        if (!active) return;
        if (json.meetings && json.startups && json.updates) {
          setContent({ meetings: json.meetings, startups: json.startups, updates: json.updates });
          setError(null);
        } else setError(json.error || "Não foi possível carregar o PRX Founders.");
      })
      .catch(() => active && setError("Sem conexão com o servidor."));
    return () => {
      active = false;
    };
  }, [reload]);

  async function remove(k: Kind, item: Item) {
    if (!window.confirm("Excluir este item? Esta ação não pode ser desfeita.")) return;
    const res = await fetch("/api/admin/founders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", kind: k, id: item.id }) });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return setError(json.error || "Não foi possível excluir.");
    setFeedback("Item excluído.");
    setReload((r) => r + 1);
  }

  const list: Item[] = !content ? [] : kind === "meeting" ? content.meetings : kind === "startup" ? content.startups : content.updates;

  return (
    <section aria-labelledby="founders-content-title" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="founders-content-title" className="font-display text-2xl font-semibold tracking-[-0.03em] text-ink">
            Conteúdo do PRX Founders
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Encontros, startups e atualizações. Só o que estiver publicado aparece na aba Founders do app.</p>
        </div>
        <Button onClick={() => setEditing({ kind, item: null })}>
          <IconPlus size={16} />
          {kind === "meeting" ? "Novo encontro" : kind === "startup" ? "Nova startup" : "Nova atualização"}
        </Button>
      </div>
      <Segmented
        label="Tipo de conteúdo"
        value={kind}
        onChange={setKind}
        options={[
          { value: "meeting", label: "Encontros", count: content?.meetings.length },
          { value: "startup", label: "Startups", count: content?.startups.length },
          { value: "update", label: "Atualizações", count: content?.updates.length },
        ]}
      />
      {feedback && <Notice tone="success">{feedback}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      {!content ? (
        !error && <div role="status" aria-label="Carregando" className="h-40 rounded-3xl bg-surface" />
      ) : list.length === 0 ? (
        <EmptyState title="Nada cadastrado" body="Cadastre quando houver informação real. O app mostra um estado vazio até lá." />
      ) : (
        <ul className="space-y-2">
          {list.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-3xl glass px-5 py-4">
              <div className="min-w-0">
                <p className="font-medium text-ink">{"title" in item ? item.title : item.name}</p>
                <p className="text-[13px] text-muted-foreground">
                  {"startsAt" in item
                    ? `${formatDateTimeBr(item.startsAt)} · ${[item.venue, item.city].filter(Boolean).join(", ") || "local a definir"}`
                    : "relationship" in item
                      ? `${RELATIONSHIP_LABEL[item.relationship]} · ${STARTUP_STAGE_TEXT[item.stage]}${item.sector ? ` · ${item.sector}` : ""}`
                      : `${UPDATE_KIND_LABEL[item.kind]}${item.publishedAt ? ` · ${formatDateTimeBr(item.publishedAt)}` : ""}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Tag tone={item.status === "published" ? "success" : item.status === "cancelled" ? "warning" : "neutral"}>{STATUS_TEXT[item.status]}</Tag>
                <Button variant="secondary" size="sm" onClick={() => setEditing({ kind, item })}>
                  Editar
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void remove(kind, item)}>
                  Excluir
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <ContentSheet
          kind={editing.kind}
          item={editing.item}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setFeedback("Salvo.");
            setReload((r) => r + 1);
          }}
        />
      )}
    </section>
  );
}

type Draft = Record<string, string>;

function initial(kind: Kind, item: Item | null): Draft {
  if (kind === "meeting") {
    const m = item as FoundersMeeting | null;
    return { title: m?.title ?? "", startsAt: toLocalInput(m?.startsAt), endsAt: toLocalInput(m?.endsAt), venue: m?.venue ?? "", city: m?.city ?? "", address: m?.address ?? "", agenda: m?.agenda ?? "", status: m?.status ?? "draft" };
  }
  if (kind === "startup") {
    const s = item as FoundersStartup | null;
    return { name: s?.name ?? "", oneLiner: s?.oneLiner ?? "", description: s?.description ?? "", sector: s?.sector ?? "", stage: s?.stage ?? "ideia", relationship: s?.relationship ?? "acompanhada", websiteUrl: s?.websiteUrl ?? "", pitchUrl: s?.pitchUrl ?? "", status: s?.status ?? "draft", sortOrder: String(s?.sortOrder ?? 0) };
  }
  const u = item as FoundersUpdate | null;
  return { kind: u?.kind ?? "novidade", title: u?.title ?? "", body: u?.body ?? "", linkUrl: u?.linkUrl ?? "", linkLabel: u?.linkLabel ?? "", status: u?.status ?? "draft" };
}

function payload(kind: Kind, d: Draft): Record<string, unknown> {
  if (kind === "meeting") return { ...d, startsAt: fromLocalInput(d.startsAt) ?? "", endsAt: d.endsAt ? fromLocalInput(d.endsAt) : null };
  if (kind === "startup") return { ...d, sortOrder: Number(d.sortOrder) || 0 };
  return d;
}

function ContentSheet({ kind, item, onClose, onSaved }: { kind: Kind; item: Item | null; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<Draft>(() => initial(kind, item));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: string, value: string) => setDraft((p) => ({ ...p, [key]: value }));
  const text = (key: string, label: string, opts: { hint?: string; max?: number; wide?: boolean; type?: string } = {}) => (
    <Field label={label} hint={opts.hint} className={opts.wide ? "sm:col-span-2" : undefined}>
      {(id, describedBy) => <Input id={id} aria-describedby={describedBy} type={opts.type ?? "text"} value={draft[key] ?? ""} maxLength={opts.max ?? 200} onChange={(e) => set(key, e.target.value)} />}
    </Field>
  );
  const area = (key: string, label: string, hint?: string) => (
    <Field label={label} hint={hint} className="sm:col-span-2">
      {(id, describedBy) => <Textarea id={id} aria-describedby={describedBy} value={draft[key] ?? ""} onChange={(e) => set(key, e.target.value)} />}
    </Field>
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/founders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", kind, id: item?.id, data: payload(kind, draft) }) });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) return setError(json.error || "Não foi possível salvar.");
    onSaved();
  }

  const statusOptions = kind === "meeting" ? ["draft", "published", "cancelled"] : ["draft", "published"];

  return (
    <Sheet
      open
      onClose={onClose}
      title={item ? "Editar" : kind === "meeting" ? "Novo encontro" : kind === "startup" ? "Nova startup" : "Nova atualização"}
      footer={
        <Button block type="submit" form="founders-form" disabled={busy}>
          {busy ? "Salvando…" : "Salvar"}
        </Button>
      }
    >
      <form id="founders-form" onSubmit={submit} className="grid gap-5 sm:grid-cols-2">
        {kind === "meeting" && (
          <>
            {text("title", "Título", { wide: true, max: 120 })}
            {text("startsAt", "Início", { type: "datetime-local" })}
            {text("endsAt", "Fim (opcional)", { type: "datetime-local" })}
            {text("venue", "Local", { max: 120 })}
            {text("city", "Cidade", { max: 120 })}
            {text("address", "Endereço (opcional)", { wide: true, max: 300 })}
            {area("agenda", "Programação", "Uma linha por atividade, ex.: 19h · Abertura.")}
          </>
        )}
        {kind === "startup" && (
          <>
            {text("name", "Nome da startup", { max: 80 })}
            {text("sector", "Setor", { max: 60 })}
            {text("oneLiner", "Frase de apresentação", { wide: true, max: 200 })}
            {area("description", "Apresentação")}
            <Field label="Estágio">
              {(id) => (
                <Select id={id} value={draft.stage} onChange={(e) => set("stage", e.target.value)}>
                  {STARTUP_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {STARTUP_STAGE_TEXT[s]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Relação com a PRX" hint="Marque “Investida” só com investimento efetivamente realizado.">
              {(id, describedBy) => (
                <Select id={id} aria-describedby={describedBy} value={draft.relationship} onChange={(e) => set("relationship", e.target.value)}>
                  {STARTUP_RELATIONSHIPS.map((r) => (
                    <option key={r} value={r}>
                      {RELATIONSHIP_LABEL[r]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {text("websiteUrl", "Site (https://)", { max: 500 })}
            {text("pitchUrl", "Apresentação/pitch (https://)", { max: 500 })}
            {text("sortOrder", "Ordem", { type: "number" })}
          </>
        )}
        {kind === "update" && (
          <>
            <Field label="Tipo">
              {(id) => (
                <Select id={id} value={draft.kind} onChange={(e) => set("kind", e.target.value)}>
                  {UPDATE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {UPDATE_KIND_LABEL[k]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {text("title", "Título", { max: 140 })}
            {area("body", "Texto", draft.kind === "oportunidade" ? "Conteúdo informativo. Oferta pública de investimento exige regras da CVM: valide com o jurídico antes de publicar." : undefined)}
            {text("linkUrl", "Link (https://)", { max: 500 })}
            {text("linkLabel", "Texto do link", { max: 60 })}
          </>
        )}
        <Field label="Situação" className="sm:col-span-2">
          {(id) => (
            <Select id={id} value={draft.status} onChange={(e) => set("status", e.target.value)}>
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {STATUS_TEXT[s]}
                </option>
              ))}
            </Select>
          )}
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
