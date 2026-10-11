// Hello World
"use client";

import { useState, type FormEvent } from "react";
import type { ActionResult } from "@/components/app/use-prx-stores";
import { Button, EmptyState, Field, Input, Notice, Select, Tag, Textarea } from "@/components/app/ui";
import { IconUpload } from "@/components/icons/prx-icons";
import type { MemberSubmission } from "@/lib/live/service";
import { FOUNDERS_PIPELINE, FOUNDERS_STATUS_LABEL } from "@/lib/live/types";
import { cn } from "@/lib/utils";

/** Inscrição de startup no PRX Founders (pitch deck ou vídeo) e o andamento da análise. */

const MAX_DECK_MB = 10;
const EMPTY_FORM = { startupName: "", oneLiner: "", stage: "ideia" as "ideia" | "mvp" | "tracao", videoUrl: "" };

export function FoundersPanel({ submissions, submit }: { submissions: MemberSubmission[]; submit: (form: FormData) => Promise<ActionResult> }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [deck, setDeck] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const inReview = submissions.some((s) => s.status === "sent" || s.status === "review");

  async function send(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSent(false);
    if (form.startupName.trim().length < 2) return setError("Informe o nome da startup.");
    if (form.oneLiner.trim().length < 20) return setError("Descreva a startup em pelo menos 20 caracteres.");
    if (!deck && !form.videoUrl.trim()) return setError("Anexe o pitch deck em PDF ou informe o link do vídeo.");
    if (form.videoUrl && !/^https:\/\/\S+\.\S+/.test(form.videoUrl.trim())) return setError("O link do vídeo precisa começar com https://");
    const data = new FormData();
    data.set("startupName", form.startupName.trim());
    data.set("oneLiner", form.oneLiner.trim());
    data.set("stage", form.stage);
    data.set("videoUrl", form.videoUrl.trim());
    if (deck) data.set("deck", deck);
    setBusy(true);
    const result = await submit(data);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setForm(EMPTY_FORM);
    setDeck(null);
    setFileKey((k) => k + 1);
    setSent(true);
  }

  return (
    <div className="grid gap-12 lg:grid-cols-12">
      <section aria-labelledby="founders-form" className="space-y-6 lg:col-span-7">
        <div>
          <h2 id="founders-form" className="text-2xl font-semibold tracking-[-0.02em] text-ink">
            Submeta sua startup
          </h2>
          <p className="mt-2 max-w-lg text-sm text-muted-foreground">
            O time de Rafael Molina avalia cada projeto. Selecionados sobem ao palco do Founders Demo Day e ganham mentoria.
          </p>
        </div>
        {inReview ? (
          <Notice>Sua startup está em análise. Você pode enviar outra depois do retorno.</Notice>
        ) : (
          <form onSubmit={(e) => void send(e)} className="space-y-5">
            <Field label="Nome da startup">{(id) => <Input id={id} value={form.startupName} maxLength={80} onChange={(e) => setForm({ ...form, startupName: e.target.value })} />}</Field>
            <Field label="Em uma frase, o que ela resolve?">
              {(id) => <Textarea id={id} value={form.oneLiner} maxLength={280} onChange={(e) => setForm({ ...form, oneLiner: e.target.value })} />}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Estágio">
                {(id) => (
                  <Select id={id} value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value as typeof form.stage })}>
                    <option value="ideia">Ideia</option>
                    <option value="mvp">MVP no ar</option>
                    <option value="tracao">Com tração</option>
                  </Select>
                )}
              </Field>
              <Field label="Link do vídeo (opcional)" hint="YouTube, Loom ou Drive, até 60s.">
                {(id, describedBy) => (
                  <Input id={id} aria-describedby={describedBy} type="url" inputMode="url" value={form.videoUrl} onChange={(e) => setForm({ ...form, videoUrl: e.target.value })} />
                )}
              </Field>
            </div>
            <div>
              <p className="text-[13px] font-medium text-ink">Pitch deck (PDF)</p>
              <label className="mt-1.5 flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-2xl bg-surface px-4 transition-colors hover:bg-line has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring">
                <span className="truncate text-sm text-muted-foreground">{deck ? deck.name : `Selecionar arquivo · até ${MAX_DECK_MB} MB`}</span>
                <IconUpload size={18} className="shrink-0 text-ink" />
                <input
                  key={fileKey}
                  type="file"
                  accept="application/pdf"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    if (file && file.size > MAX_DECK_MB * 1024 * 1024) {
                      setError(`O arquivo passa de ${MAX_DECK_MB} MB.`);
                      return;
                    }
                    setError(null);
                    setDeck(file);
                  }}
                />
              </label>
            </div>
            {error && <Notice tone="error">{error}</Notice>}
            <Button type="submit" block disabled={busy}>
              {busy ? "Enviando…" : "Enviar para análise"}
            </Button>
          </form>
        )}
        {sent && <Notice tone="success">Startup enviada. Acompanhe o status ao lado.</Notice>}
      </section>

      <section aria-labelledby="founders-status" className="space-y-5 lg:col-span-5">
        <h2 id="founders-status" className="text-xl font-semibold tracking-[-0.02em] text-ink">
          Suas submissões
        </h2>
        {submissions.length === 0 ? (
          <EmptyState title="Nada enviado ainda" body="Depois de enviar, o status aparece aqui." />
        ) : (
          <ul className="space-y-6">
            {submissions.map((submission) => {
              const stepIndex = FOUNDERS_PIPELINE.findIndex((p) => p.status === submission.status);
              return (
                <li key={submission.id} className="rounded-3xl glass-soft p-5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[17px] font-semibold text-ink">{submission.startupName}</p>
                    {submission.status === "not_selected" && <Tag>{FOUNDERS_STATUS_LABEL.not_selected}</Tag>}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{submission.oneLiner}</p>
                  {submission.status !== "not_selected" && (
                    <>
                      <ol className="mt-5 grid grid-cols-3 gap-2">
                        {FOUNDERS_PIPELINE.map((step, index) => (
                          <li key={step.status}>
                            <span aria-hidden className={cn("block h-1.5 rounded-full", index <= stepIndex ? "bg-primary" : "bg-line")} />
                            <span className={cn("mt-2 block text-[13px]", index <= stepIndex ? "font-medium text-ink" : "text-muted-foreground")}>{step.label}</span>
                          </li>
                        ))}
                      </ol>
                      <p className="mt-3 text-[13px] text-muted-foreground">{FOUNDERS_PIPELINE[stepIndex]?.detail}</p>
                    </>
                  )}
                  {submission.adminNote && <p className="mt-3 rounded-2xl bg-card px-4 py-3 text-[13px] text-ink">{submission.adminNote}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
