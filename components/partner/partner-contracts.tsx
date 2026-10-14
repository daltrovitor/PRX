// Hello World
"use client";

import { useState } from "react";
import { Button, Checkbox, EmptyState, Field, Input, Notice, Sheet, Tag } from "@/components/app/ui";
import { IconExternal } from "@/components/icons/prx-icons";
import { ACCEPTANCE_DECLARATION, formatDateBR, formatDateTimeBR } from "@/lib/partners/contract";
import { describeOffer } from "@/lib/partners/plans";
import type { PartnerCampaignView } from "@/lib/partners/service";
import { CAMPAIGN_STATUS_LABEL } from "@/lib/partners/types";

const PRIVACY_URL = process.env.NEXT_PUBLIC_PRIVACY_POLICY_URL || "";
const TONE = { draft: "neutral", sent: "warning", accepted: "success", cancelled: "neutral" } as const;

const docLink = (id: string, kind: "contract" | "certificate") => `/api/partners/document?campaignId=${encodeURIComponent(id)}&kind=${kind}`;
const linkClass =
  "inline-flex min-h-12 cursor-pointer items-center gap-1.5 rounded-full bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-line in-[.bg-surface]:bg-card";

interface AcceptResponse {
  success?: boolean;
  error?: string;
  certificateId?: string;
  acceptedAt?: string;
}

export function PartnerContracts({
  campaigns,
  onChanged,
  onCompleteProfile,
}: {
  campaigns: PartnerCampaignView[] | null;
  onChanged: () => Promise<void>;
  onCompleteProfile: () => void;
}) {
  // Guarda só o id: depois de recarregar, a revisão mostra sempre a versão atual.
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const reviewing = campaigns?.find((c) => c.id === reviewingId) ?? null;

  if (campaigns === null) return <div className="h-32 bg-surface" aria-hidden />;

  const pending = campaigns.filter((c) => c.status === "sent");
  const others = campaigns.filter((c) => c.status !== "sent");

  return (
    <section aria-labelledby="contracts-title" className="space-y-8">
      <div>
        <h2 id="contracts-title" className="ob-display text-[28px] text-ink sm:text-[40px]">
          Contratos
        </h2>
        <p className="mt-3 max-w-xl text-[15px] text-muted-foreground">
          Cada campanha tem um contrato individual: o Termo de Parceria PRX PASS com o seu Resumo Comercial. O benefício entra no app assim que você aceita.
        </p>
      </div>

      {campaigns.length === 0 && <EmptyState title="Nenhum contrato enviado ainda" body="Quando a equipe PRX gerar a proposta da sua campanha, ela aparece aqui para revisão e aceite." />}

      {pending.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-[13px] font-semibold text-ink">Aguardando o seu aceite</h3>
          <ul className="space-y-2">
            {pending.map((c) => (
              <li key={c.id} className="flex flex-col gap-3 rounded-3xl glass-soft p-5 sm:flex-row sm:items-center sm:justify-between">
                <CampaignLine campaign={c} />
                <Button onClick={() => setReviewingId(c.id)}>Revisar e aceitar</Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {others.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-[13px] font-semibold text-ink">Histórico</h3>
          <ul className="space-y-2">
            {others.map((c) => (
              <li key={c.id} className="space-y-3 rounded-3xl glass-soft p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <CampaignLine campaign={c} />
                  <Tag tone={TONE[c.status]}>{CAMPAIGN_STATUS_LABEL[c.status]}</Tag>
                </div>
                {c.acceptance && (
                  <p className="text-[13px] text-muted-foreground">
                    Certificado <span className="font-mono text-ink">{c.acceptance.certificateId}</span> · aceito em {formatDateTimeBR(c.acceptance.acceptedAt)}
                  </p>
                )}
                {c.cancelReason && <p className="text-[13px] text-muted-foreground">Encerrada pela PRX: {c.cancelReason}</p>}
                <div className="flex flex-wrap gap-2">
                  <a className={linkClass} href={docLink(c.id, "contract")} target="_blank" rel="noopener noreferrer">
                    Contrato
                    <IconExternal size={14} />
                  </a>
                  {c.acceptance && (
                    <a className={linkClass} href={docLink(c.id, "certificate")} target="_blank" rel="noopener noreferrer">
                      Certificado da campanha
                      <IconExternal size={14} />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <AcceptSheet
        campaign={reviewing}
        onClose={() => setReviewingId(null)}
        onAccepted={onChanged}
        onCompleteProfile={() => {
          setReviewingId(null);
          onCompleteProfile();
        }}
      />
    </section>
  );
}

function CampaignLine({ campaign }: { campaign: PartnerCampaignView }) {
  const s = campaign.summary;
  return (
    <div className="min-w-0">
      <p className="text-base font-semibold text-ink">{s.benefitTitle}</p>
      <p className="mt-0.5 text-[13px] text-muted-foreground">
        {describeOffer(s)} · {s.quantity.toLocaleString("pt-BR")} {s.quantityUnit} · {formatDateBR(s.startDate)} a {formatDateBR(s.endDate)}
      </p>
    </div>
  );
}

function AcceptSheet({
  campaign,
  onClose,
  onAccepted,
  onCompleteProfile,
}: {
  campaign: PartnerCampaignView | null;
  onClose: () => void;
  onAccepted: () => Promise<void>;
  onCompleteProfile: () => void;
}) {
  return (
    <Sheet open={Boolean(campaign)} onClose={onClose} size="lg" title="Resumo Comercial" description={campaign ? `${campaign.summary.benefitTitle} · versão ${campaign.version}` : undefined}>
      {campaign && <AcceptForm key={`${campaign.id}-${campaign.version}`} campaign={campaign} onAccepted={onAccepted} onCompleteProfile={onCompleteProfile} onClose={onClose} />}
    </Sheet>
  );
}

function AcceptForm({
  campaign,
  onAccepted,
  onCompleteProfile,
  onClose,
}: {
  campaign: PartnerCampaignView;
  onAccepted: () => Promise<void>;
  onCompleteProfile: () => void;
  onClose: () => void;
}) {
  const [declared, setDeclared] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ certificateId: string; acceptedAt: string } | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/partner/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: campaign.id, version: campaign.version, contentHash: campaign.contractHash, declarationAccepted: declared, password }),
      });
      const data = (await res.json()) as AcceptResponse;
      if (!res.ok || !data.success || !data.certificateId || !data.acceptedAt) {
        setError(data.error || "Não foi possível registrar o aceite.");
        setPassword("");
        if (res.status === 409) await onAccepted();
        return;
      }
      setDone({ certificateId: data.certificateId, acceptedAt: data.acceptedAt });
      await onAccepted();
    } catch {
      setError("Sem internet agora. Confira sua conexão e tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-6">
        <Notice tone="success">Parceria aceita em {formatDateTimeBR(done.acceptedAt)}. O benefício já está no app.</Notice>
        <div className="rounded-3xl glass p-5">
          <p className="text-[13px] text-muted-foreground">Certificado da Campanha PRX</p>
          <p className="mt-1 font-mono text-xl tracking-[0.04em] text-ink">{done.certificateId}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className={linkClass} href={docLink(campaign.id, "certificate")} target="_blank" rel="noopener noreferrer">
            Abrir certificado
            <IconExternal size={14} />
          </a>
          <a className={linkClass} href={docLink(campaign.id, "contract")} target="_blank" rel="noopener noreferrer">
            Cópia do contrato aceito
            <IconExternal size={14} />
          </a>
        </div>
        <Button block variant="ink" onClick={onClose}>
          Concluir
        </Button>
      </div>
    );
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        void accept();
      }}
    >
      <table className="w-full overflow-hidden rounded-2xl bg-surface text-sm">
        <caption className="sr-only">Resumo Comercial da campanha</caption>
        <tbody className="divide-y divide-line">
          {campaign.summaryRows.map(([label, value]) => (
            <tr key={label}>
              <th scope="row" className="w-[38.2%] px-4 py-2.5 text-left align-top font-medium text-muted-foreground">
                {label}
              </th>
              <td className="px-4 py-2.5 text-ink">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-wrap gap-2">
        <a className={linkClass} href={docLink(campaign.id, "contract")} target="_blank" rel="noopener noreferrer">
          Ler o Termo de Parceria completo
          <IconExternal size={14} />
        </a>
        {PRIVACY_URL && (
          <a className={linkClass} href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">
            Política de Privacidade
            <IconExternal size={14} />
          </a>
        )}
      </div>

      {campaign.missing.length > 0 ? (
        <Notice tone="warning">
          <span className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>Antes de aceitar, complete: {campaign.missing.join(", ")}.</span>
            <Button variant="secondary" size="sm" onClick={onCompleteProfile}>
              Completar cadastro
            </Button>
          </span>
        </Notice>
      ) : (
        <>
          <Checkbox label={ACCEPTANCE_DECLARATION} checked={declared} onChange={setDeclared} />
          <Field label="Confirme sua senha para assinar" hint="O aceite fica registrado com data, hora, login e a versão exata deste contrato.">
            {(id, d) => <Input id={id} aria-describedby={d} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
          </Field>
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" block disabled={busy || !declared || !password}>
            {busy ? "Registrando aceite…" : "Aceitar parceria"}
          </Button>
          <p className="break-all font-mono text-[12px] text-muted-foreground">Versão {campaign.version} · SHA-256 {campaign.contractHash}</p>
        </>
      )}
    </form>
  );
}
