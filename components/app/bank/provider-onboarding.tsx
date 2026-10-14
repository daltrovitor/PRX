// Hello World
"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { Button, Notice, Tag } from "@/components/app/ui";
import { compressImageFile } from "@/lib/media/compression";
import type { BankProviderView } from "@/lib/prx/bank";

/**
 * Abertura da conta no banco parceiro (Asaas) depois do KYC aprovado pelo PRX:
 * cria a subconta, reaproveita os documentos já enviados e lista o que o
 * parceiro ainda pede. Tudo passa pelas rotas do PRX; o navegador nunca fala
 * com o Asaas.
 */

interface DocumentGroup {
  id: string;
  title: string;
  description: string;
  status: string;
  onboardingUrl: string | null;
  canUpload: boolean;
}

/** Status dos grupos de documentos do banco parceiro (PENDING = enviado e em análise). */
const STATUS_LABEL: Record<string, string> = {
  NOT_SENT: "Não enviado",
  PENDING: "Em análise",
  AWAITING_APPROVAL: "Em análise",
  APPROVED: "Aprovado",
  REJECTED: "Recusado",
  IGNORED: "Dispensado",
};

async function call(url: string, init?: RequestInit): Promise<{ ok: boolean; json: Record<string, unknown> }> {
  try {
    const res = await fetch(url, { cache: "no-store", ...init });
    return { ok: res.ok, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  } catch {
    return { ok: false, json: { error: "Sem internet agora. Confira sua conexão e tente de novo." } };
  }
}

const errorOf = (json: Record<string, unknown>, fallback: string) => (typeof json.error === "string" ? json.error : fallback);

export function ProviderOnboarding({ provider, onChanged }: { provider: BankProviderView; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [groups, setGroups] = useState<DocumentGroup[] | null>(null);
  const hasAccount = provider.state === "pending_activation" || provider.state === "rejected";

  useEffect(() => {
    if (!hasAccount) return;
    // Consulta inicial dos documentos pendentes no banco parceiro (sincroniza a tela com o Asaas).
    let cancelled = false;
    void call("/api/bank/accounts/documents").then(({ ok, json }) => {
      if (cancelled) return;
      if (!ok) setError(errorOf(json, "Não foi possível consultar os documentos agora."));
      else setGroups(Array.isArray(json.groups) ? (json.groups as DocumentGroup[]) : []);
    });
    return () => {
      cancelled = true;
    };
  }, [hasAccount]);

  useEffect(() => {
    if (provider.state !== "pending_activation") return;
    // A aprovação chega por aviso do banco: relê a conta a cada 30s para a resposta aparecer sem o membro precisar voltar.
    const timer = setInterval(() => onChanged(), 30_000);
    return () => clearInterval(timer);
  }, [provider.state, onChanged]);

  async function run(label: string, url: string, init: RequestInit, done?: (json: Record<string, unknown>) => void) {
    setBusy(label);
    setError(null);
    setInfo(null);
    const { ok, json } = await call(url, init);
    setBusy(null);
    if (!ok) return setError(errorOf(json, "Não foi possível concluir agora."));
    done?.(json);
  }

  const post = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  /** Foto ou PDF, uma ou mais partes (ex.: frente e verso): fotos viram JPEG aqui e o servidor junta tudo num arquivo só. */
  async function upload(groupId: string, event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []).slice(0, 4);
    event.target.value = "";
    if (picked.length === 0) return;
    setBusy(`upload-${groupId}`);
    const files = await Promise.all(
      picked.map((f) => (f.type.startsWith("image/") ? compressImageFile(f, { maxWidth: 2000, maxHeight: 2000, quality: 0.85, mimeType: "image/jpeg" }) : f))
    );
    const form = new FormData();
    form.append("groupId", groupId);
    for (const file of files) form.append("file", file);
    await run(`upload-${groupId}`, "/api/bank/accounts/documents", { method: "POST", body: form }, (json) => {
      setGroups(Array.isArray(json.groups) ? (json.groups as DocumentGroup[]) : groups);
      setInfo("Documento enviado ao PRX BANK.");
    });
  }

  if (provider.state === "none" || provider.state === "provisioning") {
    return (
      <div className="space-y-4 rounded-3xl glass p-5 sm:p-6">
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-ink">Abrir sua conta de pagamento</h2>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          Abrimos a conta em seu nome com o PRX BANK, usando os dados e os documentos que você enviou. O PRX BANK confere tudo e aprova a conta, em geral em
          até 2 dias úteis.
        </p>
        <Button
          className="min-h-12"
          disabled={busy !== null}
          onClick={() => void run("open", "/api/bank/accounts", post({ action: "open" }), onChanged)}
        >
          {busy === "open" ? "Abrindo conta…" : provider.state === "provisioning" ? "Concluir abertura" : "Abrir conta"}
        </Button>
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    );
  }

  if (!hasAccount) return null;

  return (
    <div className="space-y-5 rounded-3xl glass p-5 sm:p-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-ink">Documentos para o PRX BANK</h2>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          {provider.state === "rejected"
            ? "O PRX BANK pediu um novo envio para liberar sua conta."
            : "Sua conta foi aberta e está em análise. Envie o que ainda falta para liberar Pix e boletos."}
        </p>
        {provider.rejectReason && <Notice tone="warning">{provider.rejectReason}</Notice>}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="secondary"
          className="min-h-12"
          disabled={busy !== null}
          onClick={() =>
            void run("forward", "/api/bank/accounts/documents", post({ action: "forward_kyc" }), (json) => {
              setGroups(Array.isArray(json.groups) ? (json.groups as DocumentGroup[]) : groups);
              setInfo(
                typeof json.wait === "number"
                  ? "Sua conta acabou de ser aberta. Aguarde alguns segundos e tente de novo."
                  : Number(json.sent) > 0
                    ? "Documentos do seu cadastro enviados ao PRX BANK."
                    : "Não achamos fotos do documento no seu cadastro. Use o botão de cada documento abaixo para enviar."
              );
            })
          }
        >
          {busy === "forward" ? "Enviando…" : "Usar os documentos do meu cadastro"}
        </Button>
        <Button variant="ghost" className="min-h-12" disabled={busy !== null} onClick={() => void run("refresh", "/api/bank/accounts", post({ action: "refresh" }), onChanged)}>
          {busy === "refresh" ? "Verificando…" : "Verificar aprovação"}
        </Button>
      </div>

      {groups === null ? (
        <p className="text-[13px] text-muted-foreground">Consultando documentos pendentes…</p>
      ) : groups.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Nenhum documento pendente. A análise do PRX BANK costuma levar até 2 dias úteis.</p>
      ) : (
        <ul className="space-y-2">
          {groups.map((g) => (
            <li key={g.id} className="flex flex-col gap-3 rounded-2xl glass-soft px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium text-ink">
                  {g.title} <Tag tone={g.status === "APPROVED" ? "success" : g.status === "REJECTED" ? "warning" : "neutral"}>{STATUS_LABEL[g.status] ?? g.status}</Tag>
                </p>
                {g.description && <p className="mt-0.5 text-[13px] text-muted-foreground">{g.description}</p>}
              </div>
              {g.onboardingUrl ? (
                <a
                  href={g.onboardingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-12 shrink-0 cursor-pointer items-center justify-center rounded-full bg-ink px-5 text-sm font-medium text-background"
                >
                  Enviar pelo link seguro
                </a>
              ) : g.canUpload ? (
                <label className="inline-flex min-h-12 shrink-0 cursor-pointer items-center justify-center rounded-full bg-surface px-5 text-sm font-medium text-ink hover:bg-line">
                  {busy === `upload-${g.id}` ? "Enviando…" : "Escolher foto ou PDF"}
                  <input
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
                    aria-label={`Enviar ${g.title}: foto ou PDF, pode escolher frente e verso juntos`}
                    className="sr-only"
                    disabled={busy !== null}
                    onChange={(e) => void upload(g.id, e)}
                  />
                </label>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {info && <Notice tone="success">{info}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
