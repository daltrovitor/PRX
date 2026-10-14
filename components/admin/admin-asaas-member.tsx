// Hello World
"use client";

import { useState, type FormEvent } from "react";
import { Button, Field, Input, Notice, Tag } from "@/components/app/ui";
import type { MemberDiagnostics } from "@/lib/bank/asaas/admin";
import { DimensionTag, Row, adminCall, postJson, when } from "@/components/admin/admin-asaas-shared";

type Action = "refresh" | "documents" | "webhook" | "webhook_reactivate" | "regenerate_key" | "recover";

const ACTIONS: ReadonlyArray<{ action: Action; label: string; hint: string }> = [
  { action: "refresh", label: "Consultar situação", hint: "GET /myAccount/status e aplica no PRX." },
  { action: "documents", label: "Enviar documentos", hint: "Manda o que o PRX tem; o resto fica para o link do membro." },
  { action: "webhook", label: "Atualizar webhook", hint: "Grava URL, eventos e o token atual." },
  { action: "webhook_reactivate", label: "Atualizar e reativar fila", hint: "Idem e religa a fila parada pelo Asaas." },
  { action: "regenerate_key", label: "Gerar chave da subconta", hint: "Só sem chave guardada. Exige liberação de 2 h no painel do Asaas e whitelist de IP." },
  { action: "recover", label: "Retomar abertura", hint: "Procura a subconta pelo CPF antes de criar outra." },
];

const OUTCOME_TONE: Record<string, "success" | "warning" | "neutral"> = { sent: "success", recovered: "success", failed: "warning", uncertain: "warning", blocked: "neutral" };

/** Situação de um membro no Asaas: o que o PRX sabe, o que o Asaas diz agora e as ações do suporte. */
export function AdminAsaasMember({ onShowRequests }: { onShowRequests: (user: string) => void }) {
  const [user, setUser] = useState("");
  const [diag, setDiag] = useState<MemberDiagnostics | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function lookup(event?: FormEvent) {
    event?.preventDefault();
    if (!user.trim()) return;
    setBusy("lookup");
    setError(null);
    setInfo(null);
    try {
      setDiag((await adminCall<{ diagnostics: MemberDiagnostics }>(`/api/admin/bank/asaas/member?user=${encodeURIComponent(user.trim())}`)).diagnostics);
    } catch (err) {
      setDiag(null);
      setError(err instanceof Error ? err.message : "Sem internet agora. Confira sua conexão e tente de novo.");
    } finally {
      setBusy(null);
    }
  }

  async function run(action: Action) {
    if (!diag) return;
    setBusy(action);
    setError(null);
    setInfo(null);
    try {
      const res = await adminCall<{ diagnostics: MemberDiagnostics; result: unknown }>("/api/admin/bank/asaas/member", postJson({ user: diag.userId, action }));
      setDiag(res.diagnostics);
      setInfo(`Concluído: ${ACTIONS.find((a) => a.action === action)?.label}. Resultado: ${JSON.stringify(res.result)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sem internet agora. Confira sua conexão e tente de novo.");
    } finally {
      setBusy(null);
    }
  }

  const sub = diag?.subaccount;
  const status = diag?.live.status;
  const webhook = diag?.live.webhook;
  const documents = diag?.live.documents;

  return (
    <section aria-labelledby="asaas-member-title" className="glass space-y-4 rounded-3xl p-5 sm:p-6">
      <h2 id="asaas-member-title" className="text-lg font-semibold tracking-[-0.02em] text-ink">
        Situação de um membro
      </h2>
      <form onSubmit={(e) => void lookup(e)} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="Id ou e-mail do membro" className="flex-1">
          {(id) => <Input id={id} value={user} onChange={(e) => setUser(e.target.value)} placeholder="ana@exemplo.com" />}
        </Field>
        <Button type="submit" size="sm" disabled={busy !== null}>
          {busy === "lookup" ? "Consultando…" : "Consultar"}
        </Button>
      </form>
      {error && <Notice tone="error">{error}</Notice>}
      {info && <Notice tone="success">{info}</Notice>}

      {diag && (
        <div className="space-y-4">
          {!sub && <Notice>Este membro ainda não tem registro de subconta no PRX (não enviou a abertura ou ela não foi aprovada).</Notice>}
          {sub && (
            <dl className="divide-y divide-line">
              <Row label="Conta no PRX">
                <Tag tone={sub.status === "active" ? "success" : sub.status === "rejected" ? "warning" : "neutral"}>{sub.status}</Tag> · {sub.environment === "production" ? "produção" : "sandbox"}
                {sub.rejectReason ? ` · motivo: ${sub.rejectReason}` : ""}
              </Row>
              <Row label="Subconta no Asaas">
                {sub.asaasAccountId ? <span className="font-mono text-[12px]">{sub.asaasAccountId}</span> : sub.provisioningStartedAt ? `abertura em andamento desde ${when(sub.provisioningStartedAt)}` : "não criada"}
                {sub.asaasAccountId && (
                  <>
                    {" "}
                    · chave guardada <Tag tone={sub.hasApiKey ? "success" : "warning"}>{sub.hasApiKey ? "sim" : "não — gerar chave"}</Tag>
                  </>
                )}
              </Row>
              <Row label="Situação aplicada no PRX">
                <span className="flex flex-wrap items-center gap-1.5">
                  geral <DimensionTag value={sub.generalStatus} /> documentos <DimensionTag value={sub.documentationStatus} /> comercial <DimensionTag value={sub.commercialInfoStatus} /> bancária{" "}
                  <DimensionTag value={sub.bankAccountInfoStatus} />
                </span>
                <span className="mt-1 block text-[12px] text-muted-foreground">
                  informação de {when(sub.statusUpdatedAt)}
                  {sub.commercialInfoAlert ? ` · dados comerciais: ${sub.commercialInfoAlert === "EXPIRED" ? "expirados" : "expirando"}` : ""}
                </span>
              </Row>
              <Row label="Documentos">
                criada em {when(sub.accountCreatedAt)} · última sincronização {when(sub.documentsSyncedAt)} · membro avisado {when(sub.onboardingNotifiedAt)}
              </Row>
            </dl>
          )}

          {status && (
            <div className="rounded-2xl border border-line p-4">
              <p className="text-[14px] font-semibold text-ink">No Asaas agora (GET /myAccount/status)</p>
              {status.ok ? (
                <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[13px] text-ink">
                  geral <DimensionTag value={status.value.general} /> documentos <DimensionTag value={status.value.documentation} /> comercial <DimensionTag value={status.value.commercialInfo} /> bancária{" "}
                  <DimensionTag value={status.value.bankAccountInfo} />
                </p>
              ) : (
                <p className="mt-1 text-[13px] text-warning">{status.error}</p>
              )}
            </div>
          )}

          {webhook && (
            <div className="rounded-2xl border border-line p-4">
              <p className="text-[14px] font-semibold text-ink">Webhook da subconta</p>
              {webhook.ok ? (
                <ul className="mt-2 space-y-1 text-[13px] text-ink">
                  <li>
                    {webhook.value.configured ? "Configurado" : "Não existe webhook do PRX nesta subconta"} {webhook.value.configured && (webhook.value.urlMatches ? "· URL certa" : `· URL diferente: ${webhook.value.url}`)}
                  </li>
                  {webhook.value.configured && (
                    <li>
                      Fila <Tag tone={webhook.value.interrupted ? "warning" : "success"}>{webhook.value.interrupted ? "interrompida — nenhum evento chega" : "ativa"}</Tag> · {webhook.value.penalizedRequests} envio(s) penalizado(s) · token{" "}
                      {webhook.value.hasAuthToken ? "presente" : "ausente"}
                    </li>
                  )}
                  {webhook.value.missingEvents.length > 0 && <li className="text-warning">Eventos faltando: {webhook.value.missingEvents.join(", ")}</li>}
                </ul>
              ) : (
                <p className="mt-1 text-[13px] text-warning">{webhook.error}</p>
              )}
            </div>
          )}

          {documents && (
            <div className="rounded-2xl border border-line p-4">
              <p className="text-[14px] font-semibold text-ink">Documentos pedidos pelo Asaas</p>
              {documents.ok ? (
                <ul className="mt-2 space-y-1 text-[13px] text-ink">
                  {documents.value.groups.length === 0 && <li className="text-muted-foreground">Nenhum grupo pendente informado.</li>}
                  {documents.value.groups.map((g) => (
                    <li key={g.id}>
                      {g.title ?? g.type} <span className="font-mono text-[12px] text-muted-foreground">{g.type}</span> · <Tag>{g.status}</Tag> {g.viaLink ? "· envio pelo link seguro (membro)" : "· envio pela API"}
                    </li>
                  ))}
                  {documents.value.rejectReasons && <li className="text-warning">Motivo da recusa: {documents.value.rejectReasons}</li>}
                </ul>
              ) : (
                <p className="mt-1 text-[13px] text-warning">{documents.error}</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ACTIONS.map((a) => (
              <Button key={a.action} variant="secondary" size="sm" title={a.hint} disabled={busy !== null} onClick={() => void run(a.action)} className="justify-start text-left">
                {busy === a.action ? "Executando…" : a.label}
              </Button>
            ))}
            <Button variant="ghost" size="sm" onClick={() => onShowRequests(diag.userId)}>
              Ver chamadas deste membro
            </Button>
          </div>

          {diag.provisioning.length > 0 && (
            <div>
              <p className="text-[14px] font-semibold text-ink">Histórico da abertura</p>
              <ul className="mt-1 divide-y divide-line">
                {diag.provisioning.map((p, n) => (
                  <li key={`${p.createdAt}-${n}`} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <span className="min-w-0 break-words text-[13px] text-ink">
                      {when(p.createdAt)} · {p.step} · {p.detail ?? "—"}
                    </span>
                    <Tag tone={OUTCOME_TONE[p.outcome] ?? "neutral"}>{p.outcome}</Tag>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
