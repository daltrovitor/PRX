// Hello World
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Input, Notice, Sheet, Tag, Textarea } from "@/components/app/ui";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { formatDateTimeBr } from "@/components/admin/pager";
import { INCOME_LABEL, type DocumentKind } from "@/lib/family/types";
import { DOC_REVIEW_LABEL, KYC_EVENT_LABEL, KYC_STATUS_LABEL, RISK_FLAG_LABEL } from "@/lib/kyc/types";
import type { IdentityDetail } from "@/lib/kyc/identity-admin";

const cpf = (d: string) => (d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d);
const phone = (d: string) => (d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}` : d || "—");
const dateBr = (iso: string) => iso.split("-").reverse().join("/");
const docUrl = (id: string, kind: string) => `/api/admin/bank/identity/document?id=${encodeURIComponent(id)}&kind=${encodeURIComponent(kind)}`;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-muted-foreground">{label}</dt>
      <dd className="break-words text-[14px] text-ink">{value || "—"}</dd>
    </div>
  );
}

/** Ficha da abertura: dados para conferir, documentos (abertos um a um), decisões e histórico. */
export function AdminIdentityDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { confirmDelete, showToast } = useConfirmToast();
  const [detail, setDetail] = useState<IdentityDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [shown, setShown] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");

  const load = useCallback(async (target: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/bank/identity?id=${encodeURIComponent(target)}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { detail?: IdentityDetail; error?: string };
      if (!res.ok || !json.detail) throw new Error(json.error || "Não foi possível abrir a ficha.");
      setDetail(json.detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sem internet agora. Confira sua conexão e tente de novo.");
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (alive) await load(id);
    })();
    return () => {
      alive = false;
    };
  }, [id, load]);

  async function act(label: string, payload: Record<string, unknown>, success: string) {
    setBusy(label);
    try {
      const res = await fetch("/api/admin/bank/identity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...payload }) });
      const json = (await res.json().catch(() => ({}))) as { detail?: IdentityDetail; error?: string };
      if (!res.ok) throw new Error(json.error || "Não foi possível registrar a decisão.");
      if (json.detail) setDetail(json.detail);
      showToast("success", success);
      onChanged();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Sem internet agora. Confira sua conexão e tente de novo.");
    } finally {
      setBusy(null);
    }
  }

  const app = detail?.application;
  const pending = app?.status === "pending";
  const allApproved = detail?.documents.every((d) => d.status === "approved") ?? false;
  const anyRejected = detail?.documents.some((d) => d.status === "rejected") ?? false;
  const anyReceived = detail?.documents.some((d) => d.status === "received") ?? false;

  return (
    <Sheet open onClose={onClose} title={app ? app.fullName : "Abertura do PRX BANK"} description={app ? `${KYC_STATUS_LABEL[app.status]} · enviada ${formatDateTimeBr(app.createdAt)}` : undefined} size="lg">
      {error && <Notice tone="error">{error}</Notice>}
      {!detail || !app ? (
        !error && <div role="status" aria-label="Carregando" className="h-40 rounded-3xl bg-surface" />
      ) : (
        <div className="space-y-6">
          {!detail.schemaReady && <Notice tone="warning">Falta aplicar a migração 20261015_prx_bank_identity.sql: a análise por documento e o histórico ficam indisponíveis.</Notice>}
          {app.riskFlags.includes("minor") && !detail.guardianReady && <Notice tone="warning">Menor de idade: o responsável ainda não aceitou o vínculo na Conta Pai. A aprovação fica bloqueada até lá.</Notice>}
          {detail.overAge && (
            <Notice tone={detail.overAgeGrant ? "neutral" : "warning"}>
              {detail.overAgeGrant
                ? `Acima de 29 anos, com liberação de ${detail.overAgeGrant.grantedBy} em ${formatDateTimeBr(detail.overAgeGrant.grantedAt)}.`
                : "Acima de 29 anos sem liberação vigente: libere em PRX BANK → Liberação +29 antes de aprovar."}
            </Notice>
          )}

          <section aria-label="Dados da pessoa" className="glass-soft rounded-3xl p-5">
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Row label="Nome completo" value={app.fullName} />
              <Row label="CPF" value={cpf(app.cpf)} />
              <Row label="Nascimento" value={`${dateBr(app.birthDate)} (${detail.age} anos)`} />
              <Row label="Nome da mãe" value={app.motherName} />
              <Row label="Celular" value={phone(app.phone)} />
              <Row label="E-mail" value={app.email} />
              <Row label="Ocupação" value={app.occupation} />
              <Row label="Renda mensal" value={INCOME_LABEL[app.incomeRange]} />
              <Row label="Pessoa politicamente exposta" value={app.pep ? "Sim — diligência reforçada" : "Não"} />
              <Row label="Endereço" value={`${app.address.street}, ${app.address.number}${app.address.complement ? ` (${app.address.complement})` : ""} · ${app.address.district} · ${app.address.city}/${app.address.state} · CEP ${app.address.cep}`} />
              <Row label="IP do envio" value={app.ip ?? "—"} />
              <Row label="Navegador" value={app.userAgent.slice(0, 120)} />
            </dl>
            {app.riskFlags.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2">
                {app.riskFlags.map((f) => (
                  <li key={f}>
                    <Tag tone="accent">{RISK_FLAG_LABEL[f]}</Tag>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="docs-title" className="space-y-3">
            <h3 id="docs-title" className="text-[15px] font-semibold text-ink">
              Documentos
            </h3>
            {app.documentsPurgedAt && <Notice>Arquivos apagados em {formatDateTimeBr(app.documentsPurgedAt)} pela política de retenção.</Notice>}
            <ul className="grid gap-3 md:grid-cols-2">
              {detail.documents.map((d) => (
                <li key={d.kind} className="glass-soft space-y-3 rounded-3xl p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[14px] font-medium text-ink">{d.label}</p>
                    <Tag tone={d.status === "approved" ? "success" : d.status === "rejected" || d.status === "missing" ? "warning" : "neutral"}>{DOC_REVIEW_LABEL[d.status]}</Tag>
                  </div>
                  {d.reason && <p className="text-[13px] text-muted-foreground">Motivo: {d.reason}</p>}
                  {d.status !== "missing" && !app.documentsPurgedAt && (
                    <div className="space-y-2">
                      {shown[d.kind] ? (
                        // eslint-disable-next-line @next/next/no-img-element -- link assinado de 60 s, privado: não passa pelo otimizador de imagens
                        <img src={`${docUrl(app.id, d.kind)}&v=${shown[d.kind]}`} alt={`${d.label} de ${app.fullName}`} className="max-h-80 w-full rounded-2xl bg-surface object-contain" />
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" size="sm" onClick={() => setShown((s) => ({ ...s, [d.kind]: Date.now() }))}>
                          {shown[d.kind] ? "Recarregar" : "Mostrar aqui"}
                        </Button>
                        <a href={docUrl(app.id, d.kind)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 cursor-pointer items-center rounded-full px-4 text-sm font-medium text-ink hover:bg-surface">
                          Abrir em outra aba
                        </a>
                      </div>
                    </div>
                  )}
                  {pending && d.status !== "missing" && (
                    <div className="space-y-2 border-t border-line pt-3">
                      <Input
                        value={reasons[d.kind] ?? ""}
                        onChange={(e) => setReasons((r) => ({ ...r, [d.kind]: e.target.value }))}
                        placeholder="Motivo da recusa (a pessoa vê)"
                        aria-label={`Motivo da recusa de ${d.label}`}
                        maxLength={280}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" disabled={busy !== null || d.status === "approved"} onClick={() => void act(`ok-${d.kind}`, { action: "review_document", kind: d.kind as DocumentKind, decision: "approve" }, `${d.label} aprovado.`)}>
                          Aprovar
                        </Button>
                        <Button size="sm" variant="danger" disabled={busy !== null} onClick={() => void act(`no-${d.kind}`, { action: "review_document", kind: d.kind, decision: "reject", reason: reasons[d.kind] ?? "" }, `${d.label} recusado.`)}>
                          Recusar
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {pending && (
            <section aria-labelledby="decision-title" className="glass-soft space-y-4 rounded-3xl p-5">
              <h3 id="decision-title" className="text-[15px] font-semibold text-ink">
                Decisão
              </h3>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} placeholder="Observação (obrigatória para recusar a abertura; a pessoa vê)" aria-label="Observação da decisão" />
              <div className="flex flex-wrap gap-2">
                {anyReceived && (
                  <Button
                    variant="secondary"
                    disabled={busy !== null}
                    onClick={async () => {
                      if (await confirmDelete({ title: "Aprovar documentos", message: "Confirma que conferiu todos os documentos recebidos e a selfie contra os dados da pessoa?", confirmText: "Aprovar documentos", type: "warning" }))
                        await act("docs", { action: "approve_documents" }, "Documentos aprovados.");
                    }}
                  >
                    Aprovar documentos recebidos
                  </Button>
                )}
                {anyRejected && (
                  <Button variant="secondary" disabled={busy !== null} onClick={() => void act("resubmit", { action: "request_resubmission", note }, "Reenvio pedido. A pessoa foi avisada no app.")}>
                    Pedir reenvio dos recusados
                  </Button>
                )}
                <Button
                  disabled={busy !== null || !allApproved}
                  title={allApproved ? undefined : "Aprove cada documento antes"}
                  onClick={async () => {
                    if (await confirmDelete({ title: "Aprovar identidade", message: `Aprovar a identidade de ${app.fullName}? A conta segue para o banco parceiro, que faz a análise dele.`, confirmText: "Aprovar identidade", type: "warning" }))
                      await act("approve", { action: "approve", note }, "Identidade aprovada. A conta segue para o banco parceiro.");
                  }}
                >
                  {busy === "approve" ? "Aprovando…" : "Aprovar identidade"}
                </Button>
                <Button
                  variant="danger"
                  disabled={busy !== null}
                  onClick={async () => {
                    if (await confirmDelete({ title: "Recusar abertura", message: "Recusar esta abertura? A pessoa vê o motivo e pode enviar uma nova.", confirmText: "Recusar", type: "danger" }))
                      await act("reject", { action: "reject", note }, "Abertura recusada.");
                  }}
                >
                  Recusar abertura
                </Button>
              </div>
            </section>
          )}

          {app.status !== "pending" && app.reviewNote && <Notice>{`Decisão de ${app.reviewedBy ?? "—"}: ${app.reviewNote}`}</Notice>}

          <section aria-labelledby="history-title" className="space-y-3">
            <h3 id="history-title" className="text-[15px] font-semibold text-ink">
              Histórico
            </h3>
            {detail.events.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Sem registros ainda.</p>
            ) : (
              <ol className="space-y-2">
                {detail.events.map((e) => (
                  <li key={e.id} className="flex flex-col gap-0.5 rounded-2xl bg-surface px-4 py-2.5 text-[13px] sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                    <span className="text-ink">
                      {KYC_EVENT_LABEL[e.action]}
                      {e.documentKind ? ` · ${detail.documents.find((d) => d.kind === e.documentKind)?.label ?? e.documentKind}` : ""}
                      {e.detail ? ` · ${e.detail}` : ""}
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {e.actor} · {formatDateTimeBr(e.createdAt)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </Sheet>
  );
}
