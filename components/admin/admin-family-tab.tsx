// Hello World
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, EmptyState, Input, Notice, Segmented, Tag } from "@/components/app/ui";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { ageOn } from "@/lib/family/age";
import { DOCUMENT_LABEL, GUARDIANSHIP_LABEL, INCOME_LABEL, REVIEW_STATUS_LABEL, type DocumentRef, type EmancipationRequest, type ParentApplication, type ReviewStatus } from "@/lib/family/types";
import type { BankKycApplication } from "@/lib/kyc/types";

type KycRow = BankKycApplication & { guardianReady: boolean };

type Filter = ReviewStatus | "all";
const when = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const tone = (s: ReviewStatus) => (s === "approved" ? "success" : s === "rejected" ? "warning" : "neutral") as "success" | "warning" | "neutral";
const phone = (d: string) => (d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}` : d || "—");

/**
 * Verificações de identidade — só existem em dois cenários:
 *   1. abertura do PRX BANK (KYC bancário);
 *   2. tutela de menores: Conta Pai (com certidão/termo de guarda) e emancipação.
 * Documentos abrem por link temporário, só para o admin.
 */
export function AdminFamilyTab() {
  const { showToast } = useConfirmToast();
  const [filter, setFilter] = useState<Filter>("pending");
  const [data, setData] = useState<{ parents: ParentApplication[]; emancipations: EmancipationRequest[]; bankKyc: KycRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async (status: Filter) => {
    try {
      const res = await fetch(`/api/admin/family?status=${status}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { parents?: ParentApplication[]; emancipations?: EmancipationRequest[]; bankKyc?: KycRow[]; error?: string };
      if (!res.ok || !json.parents || !json.emancipations) throw new Error(json.error || "Não foi possível carregar a fila.");
      setData({ parents: json.parents, emancipations: json.emancipations, bankKyc: json.bankKyc ?? [] });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sem internet agora. Confira sua conexão e tente de novo.");
      setData((d) => d ?? { parents: [], emancipations: [], bankKyc: [] });
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (alive) await load(filter);
    })();
    return () => {
      alive = false;
    };
  }, [load, filter]);

  async function decide(kind: "parent" | "emancipation" | "bank", id: string, decision: "approve" | "reject") {
    setBusy(id);
    try {
      const res = await fetch("/api/admin/family", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id, decision, note: notes[id] ?? "" }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Não foi possível registrar a decisão.");
      showToast("success", decision === "approve" ? "Aprovado. A conta foi liberada." : "Recusado. A pessoa vê o motivo e pode reenviar.");
      await load(filter);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Sem internet agora. Confira sua conexão e tente de novo.");
    } finally {
      setBusy(null);
    }
  }

  const pendingCount =
    (data?.parents.filter((p) => p.status === "pending").length ?? 0) +
    (data?.emancipations.filter((e) => e.status === "pending").length ?? 0);

  return (
    <section aria-labelledby="family-title" className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="family-title" className="text-lg font-semibold tracking-[-0.02em] text-ink sm:text-xl">
            Verificações {filter === "pending" && pendingCount > 0 ? <span className="text-primary">· {pendingCount}</span> : null}
          </h2>
          <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
            O cadastro comum não pede documentos. Aqui chega a tutela de menores (Conta Pai e emancipação). Aprove apenas com documentos legíveis e coerentes com os dados.
          </p>
        </div>
        <Segmented
          label="Filtro de famílias"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "pending", label: "Em análise" },
            { value: "approved", label: "Aprovados" },
            { value: "rejected", label: "Recusados" },
            { value: "all", label: "Todos" },
          ]}
        />
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {data === null ? (
        <div role="status" aria-label="Carregando" className="h-32 rounded-3xl bg-surface" />
      ) : (
        <>
          <Notice>A abertura do PRX BANK agora é analisada em PRX BANK → Identidade (documento a documento, com histórico).</Notice>

          <div className="space-y-3">
            <h3 className="text-[15px] font-semibold text-ink">Conta Pai</h3>
            {data.parents.length === 0 ? (
              <EmptyState title={filter === "pending" ? "Nenhum cadastro para analisar" : "Nenhum cadastro"} body="Os cadastros feitos em Sou Pai aparecem aqui." />
            ) : (
              <ul className="space-y-3">
                {data.parents.map((app) => (
                  <li key={app.id} className="glass-soft space-y-4 rounded-3xl p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[16px] font-semibold text-ink">{app.fullName}</p>
                        <p className="text-[13px] text-muted-foreground">
                          {app.email} · {phone(app.phone)} · {when.format(new Date(app.createdAt)).replace(".", "")}
                        </p>
                      </div>
                      <Tag tone={tone(app.status)}>{REVIEW_STATUS_LABEL[app.status]}</Tag>
                    </div>
                    <dl className="grid gap-2 text-[14px] sm:grid-cols-3">
                      <Info label="Parentesco" value={GUARDIANSHIP_LABEL[app.relationship]} />
                      <Info label="Profissão" value={app.profession} />
                      <Info label="Renda" value={INCOME_LABEL[app.incomeRange]} />
                      <Info label="Filho" value={`${app.childName} · ${ageOn(app.childBirthDate)} anos`} />
                    </dl>
                    <Documents documents={app.documents} />
                    <Decision id={app.id} status={app.status} note={app.reviewNote} value={notes[app.id] ?? ""} onNote={(v) => setNotes((n) => ({ ...n, [app.id]: v }))} busy={busy} onDecide={(d) => void decide("parent", app.id, d)} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-3">
            <h3 className="text-[15px] font-semibold text-ink">Emancipação (16–17 anos)</h3>
            {data.emancipations.length === 0 ? (
              <EmptyState title={filter === "pending" ? "Nenhuma emancipação para analisar" : "Nenhum pedido"} body="Os jovens que escolhem comprovar emancipação aparecem aqui." />
            ) : (
              <ul className="space-y-3">
                {data.emancipations.map((req) => (
                  <li key={req.id} className="glass-soft space-y-4 rounded-3xl p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[16px] font-semibold text-ink">{req.fullName}</p>
                        <p className="text-[13px] text-muted-foreground">
                          {req.email} · {when.format(new Date(req.createdAt)).replace(".", "")}
                        </p>
                      </div>
                      <Tag tone={tone(req.status)}>{REVIEW_STATUS_LABEL[req.status]}</Tag>
                    </div>
                    <Documents documents={req.documents} />
                    <Decision id={req.id} status={req.status} note={req.reviewNote} value={notes[req.id] ?? ""} onNote={(v) => setNotes((n) => ({ ...n, [req.id]: v }))} busy={busy} onDecide={(d) => void decide("emancipation", req.id, d)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-surface px-3.5 py-2.5">
      <dt className="text-[12px] text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium text-ink">{value}</dd>
    </div>
  );
}

function Documents({ documents }: { documents: DocumentRef[] }) {
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Documentos enviados">
      {documents.map((doc) => (
        <li key={doc.path}>
          <a
            href={`/api/admin/family/documents?path=${encodeURIComponent(doc.path)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="glass-chip inline-flex min-h-12 cursor-pointer items-center rounded-full px-4 text-[13px] font-medium text-ink"
          >
            {DOCUMENT_LABEL[doc.kind]}
          </a>
        </li>
      ))}
    </ul>
  );
}

function Decision({
  id,
  status,
  note,
  value,
  onNote,
  busy,
  onDecide,
}: {
  id: string;
  status: ReviewStatus;
  note: string;
  value: string;
  onNote: (v: string) => void;
  busy: string | null;
  onDecide: (d: "approve" | "reject") => void;
}) {
  if (status !== "pending") {
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface/50 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-ink">
            Situação: <span className={status === "approved" ? "text-success font-semibold" : "text-destructive font-semibold"}>{status === "approved" ? "Aprovado" : "Recusado"}</span>
            {note ? <span className="font-normal text-muted-foreground"> · Motivo: {note}</span> : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {status === "rejected" && (
            <Button
              size="sm"
              className="min-h-11 cursor-pointer"
              disabled={busy !== null}
              onClick={() => onDecide("approve")}
            >
              {busy === id ? "Salvando…" : "Reverter e Aprovar"}
            </Button>
          )}
          {status === "approved" && (
            <Button
              size="sm"
              variant="danger"
              className="min-h-11 cursor-pointer"
              disabled={busy !== null}
              onClick={() => onDecide("reject")}
            >
              {busy === id ? "Salvando…" : "Reverter e Recusar"}
            </Button>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <label htmlFor={`note-${id}`} className="sr-only">
        Observação para a pessoa
      </label>
      <Input id={`note-${id}`} value={value} onChange={(e) => onNote(e.target.value)} placeholder="Motivo ou observação (aparece para a pessoa)" maxLength={280} className="sm:flex-1" />
      <div className="flex gap-2">
        <Button size="sm" className="min-h-12" disabled={busy !== null} onClick={() => onDecide("approve")}>
          {busy === id ? "Salvando…" : "Aprovar"}
        </Button>
        <Button size="sm" variant="danger" className="min-h-12" disabled={busy !== null} onClick={() => onDecide("reject")}>
          Recusar
        </Button>
      </div>
    </div>
  );
}
