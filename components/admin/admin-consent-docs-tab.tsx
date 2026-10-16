// Hello World
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Checkbox, Field, Input, Notice, Tag, Textarea } from "@/components/app/ui";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { formatDateTimeBr } from "@/components/admin/pager";
import { adminGet, adminPost, errorText } from "@/components/admin/admin-api";
import type { ConsentDocument } from "@/lib/live/consent-documents";

/**
 * Termo que o responsável aceita ao liberar um menor (PRX LIVE). Enquanto o
 * documento oficial e o certificado não chegam, vale o texto padrão marcado
 * como "aguardando revisão jurídica". Cada liberação registra a versão e o
 * hash do texto aceito; a aprovação jurídica é registrada aqui, com o parecer.
 */
export function AdminConsentDocsTab() {
  const { confirmDelete, showToast } = useConfirmToast();
  const [data, setData] = useState<{ versions: ConsentDocument[]; active: ConsentDocument } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ version: "", title: "", body: "", certificateUrl: "" });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try {
      setData(await adminGet("/api/admin/legal/consent-documents"));
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (alive) await load();
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  async function post(body: Record<string, unknown>, ok: string) {
    try {
      await adminPost("/api/admin/legal/consent-documents", body);
      showToast("success", ok);
      await load();
      return true;
    } catch (err) {
      showToast("error", errorText(err));
      return false;
    }
  }

  return (
    <section aria-labelledby="consent-title" className="space-y-6">
      <div>
        <h2 id="consent-title" className="text-lg font-semibold tracking-[-0.02em] text-ink sm:text-xl">
          Termo de liberação do responsável
        </h2>
        <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">Material pendente da PRX: o documento oficial, o certificado e a aprovação jurídica. A estrutura está pronta para recebê-los.</p>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {data && (
        <div className="glass-soft space-y-2 rounded-3xl p-5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[15px] font-semibold text-ink">Vigente: {data.active.title}</p>
            <Tag>{data.active.version}</Tag>
            <Tag tone={data.active.legalStatus === "approved" ? "success" : "warning"}>{data.active.legalStatus === "approved" ? "Aprovado pelo jurídico" : "Aguardando revisão jurídica"}</Tag>
          </div>
          <p className="whitespace-pre-line text-[13px] text-muted-foreground">{data.active.body}</p>
          {data.active.certificateUrl && (
            <a href={data.active.certificateUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center text-[13px] font-medium text-primary underline">
              Certificado
            </a>
          )}
        </div>
      )}

      <div className="glass-soft space-y-4 rounded-3xl p-5">
        <h3 className="text-[15px] font-semibold text-ink">Nova versão</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Versão (ex.: 2026-11-01)">{(id) => <Input id={id} value={draft.version} onChange={(e) => setDraft({ ...draft, version: e.target.value })} />}</Field>
          <Field label="Link do certificado (PDF, https, opcional)">{(id) => <Input id={id} value={draft.certificateUrl} onChange={(e) => setDraft({ ...draft, certificateUrl: e.target.value })} />}</Field>
          <Field label="Título" className="sm:col-span-2">{(id) => <Input id={id} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />}</Field>
          <Field label="Texto completo (o responsável lê e aceita)" className="sm:col-span-2">{(id) => <Textarea id={id} rows={8} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />}</Field>
        </div>
        <Button
          onClick={async () => {
            if (await post({ action: "create", data: { ...draft, certificateUrl: draft.certificateUrl.trim() || null } }, "Versão criada (ainda não vigente).")) setDraft({ version: "", title: "", body: "", certificateUrl: "" });
          }}
        >
          Salvar versão
        </Button>
      </div>

      {data && data.versions.length > 0 && (
        <ul className="space-y-3">
          {data.versions.map((d) => (
            <li key={d.id} className="glass-soft space-y-3 rounded-3xl p-5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-ink">{d.title}</p>
                <Tag>{d.version}</Tag>
                {d.active && <Tag tone="accent">Vigente</Tag>}
                <Tag tone={d.legalStatus === "approved" ? "success" : "warning"}>{d.legalStatus === "approved" ? `Aprovado por ${d.legalReviewedBy} em ${formatDateTimeBr(d.legalReviewedAt)}` : "Aguardando revisão jurídica"}</Tag>
              </div>
              {d.legalNote && <p className="text-[13px] text-muted-foreground">Parecer: {d.legalNote}</p>}
              <div className="flex flex-wrap gap-2">
                {!d.active && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      if (await confirmDelete({ title: "Tornar vigente", message: "As próximas liberações passam a usar esta versão.", confirmText: "Tornar vigente", type: "warning" })) await post({ action: "activate", id: d.id }, "Versão vigente trocada.");
                    }}
                  >
                    Tornar vigente
                  </Button>
                )}
              </div>
              {d.legalStatus !== "approved" && (
                <div className="space-y-2 border-t border-line pt-3">
                  <Textarea rows={2} value={notes[d.id ?? ""] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [d.id ?? ""]: e.target.value }))} placeholder="Parecer (nº, advogado responsável, data)" aria-label="Parecer jurídico" />
                  <Checkbox label="Confirmo que o jurídico aprovou esta versão" checked={confirmed[d.id ?? ""] ?? false} onChange={(v) => setConfirmed((c) => ({ ...c, [d.id ?? ""]: v }))} />
                  <Button size="sm" disabled={!confirmed[d.id ?? ""]} onClick={() => void post({ action: "approve", id: d.id, note: notes[d.id ?? ""] ?? "", confirmed: true }, "Aprovação jurídica registrada.")}>
                    Registrar aprovação jurídica
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
