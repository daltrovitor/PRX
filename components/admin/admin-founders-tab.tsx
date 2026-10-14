// Hello World
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, EmptyState, Field, Notice, Select, Sheet, Tag, Textarea } from "@/components/app/ui";
import { IconExternal, IconRefresh } from "@/components/icons/prx-icons";
import { FOUNDERS_STATUSES, FOUNDERS_STATUS_LABEL, STARTUP_STAGE_LABEL, type FoundersStatus, type FoundersSubmission } from "@/lib/live/types";
import { formatDateTime } from "@/lib/live/format";

const TONE: Record<FoundersStatus, "neutral" | "warning" | "success" | "accent"> = { sent: "warning", review: "accent", selected: "success", not_selected: "neutral" };

async function fetchSubmissions(): Promise<{ submissions?: FoundersSubmission[]; error?: string }> {
  try {
    const res = await fetch("/api/admin/live/founders", { cache: "no-store" });
    const data = (await res.json()) as { submissions?: FoundersSubmission[]; error?: string };
    return res.ok ? data : { error: data.error || "Não foi possível carregar as submissões." };
  } catch {
    return { error: "Sem internet agora. Confira sua conexão e tente de novo." };
  }
}

/** Esteira do PRX FOUNDERS: submissões dos membros, pitch deck privado e retorno. */
export function AdminFoundersTab() {
  const [submissions, setSubmissions] = useState<FoundersSubmission[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FoundersStatus | "all">("all");

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchSubmissions();
    setLoading(false);
    setError(data.error ?? null);
    if (data.submissions) setSubmissions(data.submissions);
  }, []);

  useEffect(() => {
    let active = true;
    fetchSubmissions().then((data) => {
      if (!active) return;
      setLoading(false);
      setError(data.error ?? null);
      if (data.submissions) setSubmissions(data.submissions);
    });
    return () => {
      active = false;
    };
  }, []);

  const open = submissions.find((s) => s.id === openId) ?? null;
  const shown = submissions.filter((s) => filter === "all" || s.status === filter);

  return (
    <section aria-labelledby="founders-title" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="founders-title" className="font-display text-2xl font-semibold tracking-[-0.03em] text-ink">
            PRX Founders
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Startups enviadas pelos membros. O membro vê a etapa e o retorno no app.</p>
        </div>
        <div className="flex gap-2">
          <label htmlFor="founders-filter" className="sr-only">
            Filtrar por etapa
          </label>
          <Select id="founders-filter" value={filter} onChange={(e) => setFilter(e.target.value as FoundersStatus | "all")} className="sm:w-52">
            <option value="all">Todas as etapas</option>
            {FOUNDERS_STATUSES.map((s) => (
              <option key={s} value={s}>
                {FOUNDERS_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
          <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading} aria-label="Atualizar submissões">
            <IconRefresh size={16} />
          </Button>
        </div>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {!loading && shown.length === 0 ? (
        <EmptyState title={submissions.length === 0 ? "Nenhuma startup enviada" : "Nada nesta etapa"} body={submissions.length === 0 ? "As submissões feitas na aba LIVE › Founders aparecem aqui." : undefined} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {shown.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => setOpenId(s.id)} className="flex h-full w-full cursor-pointer flex-col gap-3 rounded-3xl glass p-5 text-left glass-lift">
                <span className="flex items-start justify-between gap-3">
                  <span className="text-[17px] font-semibold text-ink">{s.startupName}</span>
                  <Tag tone={TONE[s.status]}>{FOUNDERS_STATUS_LABEL[s.status]}</Tag>
                </span>
                <span className="line-clamp-2 text-sm text-muted-foreground">{s.oneLiner}</span>
                <span className="text-[13px] text-muted-foreground">
                  {s.userName} · {STARTUP_STAGE_LABEL[s.stage]} · {formatDateTime(s.createdAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={Boolean(open)} onClose={() => setOpenId(null)} title={open?.startupName ?? "Startup"} description={open ? `${open.userName} · ${open.userEmail}` : undefined}>
        {open && <SubmissionReview key={open.id} submission={open} onSaved={load} />}
      </Sheet>
    </section>
  );
}

function SubmissionReview({ submission, onSaved }: { submission: FoundersSubmission; onSaved: () => Promise<void> }) {
  const [status, setStatus] = useState<FoundersStatus>(submission.status);
  const [note, setNote] = useState(submission.adminNote);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/live/founders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: submission.id, status, adminNote: note }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) return setFeedback({ ok: false, text: data.error || "Não foi possível salvar." });
      setFeedback({ ok: true, text: "Retorno salvo. O membro já vê a nova etapa." });
      await onSaved();
    } catch {
      setFeedback({ ok: false, text: "Sem internet agora. Confira sua conexão e tente de novo." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-[15px] leading-relaxed text-ink">{submission.oneLiner}</p>
      <dl className="divide-y divide-line rounded-3xl glass px-4 text-sm">
        <div className="flex justify-between gap-4 py-3">
          <dt className="text-muted-foreground">Estágio</dt>
          <dd className="text-ink">{STARTUP_STAGE_LABEL[submission.stage]}</dd>
        </div>
        <div className="flex justify-between gap-4 py-3">
          <dt className="text-muted-foreground">Enviada</dt>
          <dd className="text-ink">{formatDateTime(submission.createdAt)}</dd>
        </div>
        {submission.videoUrl && (
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-muted-foreground">Vídeo</dt>
            <dd>
              <a href={submission.videoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline">
                Abrir vídeo <IconExternal size={14} />
              </a>
            </dd>
          </div>
        )}
        {submission.deckPath && (
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-muted-foreground">Pitch deck</dt>
            <dd>
              <a
                href={`/api/admin/live/founders?deck=${encodeURIComponent(submission.id)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline"
              >
                {submission.deckFileName || "Abrir PDF"} <IconExternal size={14} />
              </a>
            </dd>
          </div>
        )}
      </dl>
      <Field label="Etapa">
        {(id) => (
          <Select id={id} value={status} onChange={(e) => setStatus(e.target.value as FoundersStatus)}>
            {FOUNDERS_STATUSES.map((s) => (
              <option key={s} value={s}>
                {FOUNDERS_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Retorno para o membro (opcional)" hint="Aparece no app a partir da etapa Em análise.">
        {(id, describedBy) => <Textarea id={id} aria-describedby={describedBy} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />}
      </Field>
      {feedback && <Notice tone={feedback.ok ? "success" : "error"}>{feedback.text}</Notice>}
      <Button block onClick={() => void save()} disabled={busy}>
        {busy ? "Salvando…" : "Salvar retorno"}
      </Button>
    </div>
  );
}
