// Hello World
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, EmptyState, Field, Notice, Sheet, Tag, Textarea } from "@/components/app/ui";
import { AdminCampaignSheet } from "@/components/admin/admin-campaign-form";
import { AdminPartnerAccessSheet, AdminPartnerSheet } from "@/components/admin/admin-partner-form";
import type { AdminUser } from "@/components/admin/admin-members-tab";
import { MetricsPanel } from "@/components/partners/metrics-panel";
import { IconArrowLeft, IconExternal, IconPlus } from "@/components/icons/prx-icons";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { PRX_CATEGORIES, type Benefit } from "@/lib/pass-data";
import { formatDateBR, formatDateTimeBR, missingForAcceptance } from "@/lib/partners/contract";
import { formatDocument } from "@/lib/partners/documents";
import { VISIBILITY_PLANS, describeOffer } from "@/lib/partners/plans";
import type { PartnerOverview } from "@/lib/partners/service";
import { CAMPAIGN_STATUS_LABEL, PARTNER_STATUS_LABEL, type Campaign, type ContractAcceptance, type Partner } from "@/lib/partners/types";

type AdminCampaign = Campaign & { acceptance: ContractAcceptance | null };

interface Props {
  partners: PartnerOverview[];
  benefits: Benefit[];
  users: AdminUser[];
  onRefresh: () => Promise<void>;
  onGoToBenefits: () => void;
}

const STATUS_TONE = { ATIVO: "success", PENDENTE: "warning", SUSPENSO: "neutral", BLOQUEADO: "neutral" } as const;
const CAMPAIGN_TONE = { draft: "neutral", sent: "warning", accepted: "success", cancelled: "neutral" } as const;

export function AdminPartnersTab({ partners, benefits, users, onRefresh, onGoToBenefits }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState<{ prefillEmail?: string } | null>(null);
  const selected = partners.find((p) => p.id === selectedId) ?? null;

  const unassigned = benefits.filter((b) => !b.partnerId).length;
  const linkedOwners = new Set(partners.map((p) => p.ownerUserId).filter(Boolean));
  const orphanLogins = users.filter((u) => u.role === "partner" && !linkedOwners.has(u.id));

  if (selected) {
    return (
      <PartnerDetail
        partner={selected}
        benefits={benefits.filter((b) => b.partnerId === selected.id)}
        onBack={() => setSelectedId(null)}
        onRefresh={onRefresh}
      />
    );
  }

  return (
    <section aria-labelledby="partners-title" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="partners-title" className="font-display text-2xl font-semibold tracking-[-0.03em] text-ink">
            Parceiros
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Empresas, contratos de campanha e quem pode validar cada QR Code.</p>
        </div>
        <Button onClick={() => setCreating({})}>
          <IconPlus size={18} />
          Novo parceiro
        </Button>
      </div>

      {unassigned > 0 && (
        <Notice tone="warning">
          <span className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>
              {unassigned} {unassigned === 1 ? "benefício está" : "benefícios estão"} sem parceiro: fora do catálogo e sem ninguém que possa validar o QR Code.
            </span>
            <Button variant="secondary" size="sm" onClick={onGoToBenefits}>
              Atribuir em Benefícios
            </Button>
          </span>
        </Notice>
      )}

      {orphanLogins.length > 0 && (
        <div className="rounded-3xl glass p-5">
          <p className="text-[15px] font-medium text-ink">Logins de parceiro sem empresa cadastrada</p>
          <p className="mt-1 text-[13px] text-muted-foreground">Estas contas entram no portal, mas não validam nada até serem vinculadas a um parceiro.</p>
          <ul className="mt-3 divide-y divide-line">
            {orphanLogins.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0 truncate text-sm text-ink">
                  {u.name} · <span className="text-muted-foreground">{u.email}</span>
                </span>
                <Button variant="secondary" size="sm" onClick={() => setCreating({ prefillEmail: u.email })}>
                  Cadastrar empresa
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {partners.length === 0 ? (
        <EmptyState title="Nenhum parceiro cadastrado" body="Cadastre a empresa, o representante e o login. Depois gere o contrato da campanha." action={<Button onClick={() => setCreating({})}>Cadastrar parceiro</Button>} />
      ) : (
        <div className="glass overflow-x-auto rounded-3xl">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-surface text-[13px] text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">Parceiro</th>
                <th scope="col" className="px-4 py-3 font-medium">CNPJ / CPF</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Login</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Benefícios</th>
                <th scope="col" className="px-4 py-3 font-medium">Contratos</th>
                <th scope="col" className="px-4 py-3">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {partners.map((p) => (
                <tr key={p.id} className="transition-colors hover:bg-surface/60">
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{p.tradeName}</p>
                    <p className="text-[13px] text-muted-foreground">{p.legalName}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-[13px] text-ink">{formatDocument(p.documentType, p.document)}</td>
                  <td className="px-4 py-3">
                    <Tag tone={STATUS_TONE[p.status]}>{PARTNER_STATUS_LABEL[p.status]}</Tag>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-muted-foreground">{p.ownerEmail || "Sem login"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink">{p.benefitCount}</td>
                  <td className="px-4 py-3 text-[13px] text-muted-foreground">
                    {p.campaignCounts.accepted} {p.campaignCounts.accepted === 1 ? "aceito" : "aceitos"}
                    {p.campaignCounts.sent > 0 && <span className="text-warning"> · {p.campaignCounts.sent} aguardando</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="secondary" size="sm" onClick={() => setSelectedId(p.id)}>
                      Abrir
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdminPartnerSheet
        open={creating !== null}
        onClose={() => setCreating(null)}
        partner={null}
        prefillEmail={creating?.prefillEmail}
        existing={partners}
        onOpenExisting={(id) => {
          setCreating(null);
          setSelectedId(id);
        }}
        onSaved={async (partner) => {
          setCreating(null);
          await onRefresh();
          setSelectedId(partner.id);
        }}
      />
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Detalhe                                                                     */
/* -------------------------------------------------------------------------- */

function PartnerDetail({ partner, benefits, onBack, onRefresh }: { partner: PartnerOverview; benefits: Benefit[]; onBack: () => void; onRefresh: () => Promise<void> }) {
  const { showToast } = useConfirmToast();
  const [campaigns, setCampaigns] = useState<AdminCampaign[] | null>(null);
  const [editingPartner, setEditingPartner] = useState(false);
  const [editingAccess, setEditingAccess] = useState(false);
  const [campaignSheet, setCampaignSheet] = useState<{ campaign: Campaign | null } | null>(null);
  const [cancelling, setCancelling] = useState<AdminCampaign | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCampaigns = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/campaigns?partnerId=${encodeURIComponent(partner.id)}`, { cache: "no-store" });
      const data = (await res.json()) as { campaigns?: AdminCampaign[]; error?: string };
      if (!res.ok) setError(data.error || "Não foi possível carregar as campanhas.");
      setCampaigns(data.campaigns ?? []);
    } catch {
      setError("Sem internet agora. Confira sua conexão e tente de novo.");
      setCampaigns([]);
    }
  }, [partner.id]);

  useEffect(() => {
    let active = true;
    fetch(`/api/admin/campaigns?partnerId=${encodeURIComponent(partner.id)}`, { cache: "no-store" })
      .then((res) => res.json() as Promise<{ campaigns?: AdminCampaign[]; error?: string }>)
      .then((data) => {
        if (!active) return;
        if (data.error) setError(data.error);
        setCampaigns(data.campaigns ?? []);
      })
      .catch(() => active && setCampaigns([]));
    return () => {
      active = false;
    };
  }, [partner.id]);

  const missing = useMemo(
    () =>
      missingForAcceptance({
        tradeName: partner.tradeName,
        legalName: partner.legalName,
        documentType: partner.documentType,
        document: partner.document,
        location: partner.location,
        representative: partner.representative,
        contact: partner.contact,
      }),
    [partner]
  );

  async function action(campaign: AdminCampaign, body: Record<string, unknown>) {
    setBusyId(campaign.id);
    setError(null);
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: campaign.id, ...body }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string; message?: string };
      if (!res.ok || !data.success) {
        setError(data.error || "Não foi possível concluir a ação.");
        return false;
      }
      showToast("success", data.message || "Feito.");
      await Promise.all([loadCampaigns(), onRefresh()]);
      return true;
    } catch {
      setError("Sem internet agora. Confira sua conexão e tente de novo.");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  const latestCampaign = campaigns?.reduce<AdminCampaign | null>((last, c) => (!last || c.createdAt > last.createdAt ? c : last), null) ?? null;
  const category = PRX_CATEGORIES.find((c) => c.id === partner.categoryId)?.name ?? partner.categoryId;
  const docLink = (c: Campaign, kind: "contract" | "certificate") => `/api/partners/document?campaignId=${encodeURIComponent(c.id)}&kind=${kind}`;
  const linkClass =
    "inline-flex min-h-12 items-center gap-1.5 rounded-full bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-line cursor-pointer in-[.bg-surface]:bg-card";

  return (
    <section aria-labelledby="partner-detail-title" className="space-y-8">
      <div className="space-y-4">
        <Button variant="ghost" size="sm" className="-ml-3" onClick={onBack}>
          <IconArrowLeft size={16} />
          Parceiros
        </Button>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="partner-detail-title" className="text-[28px] font-semibold tracking-[-0.03em] text-ink sm:text-4xl">
                {partner.tradeName}
              </h2>
              <Tag tone={STATUS_TONE[partner.status]}>{PARTNER_STATUS_LABEL[partner.status]}</Tag>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {partner.legalName} · {partner.documentType} <span className="font-mono">{formatDocument(partner.documentType, partner.document)}</span> · {category} · {partner.location}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setEditingPartner(true)}>
              Editar cadastro
            </Button>
            <Button onClick={() => setCampaignSheet({ campaign: null })} disabled={partner.status === "SUSPENSO" || partner.status === "BLOQUEADO"}>
              <IconPlus size={18} />
              Novo contrato
            </Button>
          </div>
        </div>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      <div className="grid gap-10 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">
          <h3 className="font-display text-xl font-semibold tracking-[-0.02em] text-ink">Campanhas e contratos</h3>
          {campaigns === null ? (
            <div className="h-24 bg-surface" aria-hidden />
          ) : campaigns.length === 0 ? (
            <EmptyState title="Nenhum contrato ainda" body="Preencha o Resumo Comercial (cláusula 3) e o contrato individual é gerado na hora." action={<Button onClick={() => setCampaignSheet({ campaign: null })}>Gerar contrato</Button>} />
          ) : (
            <ul className="space-y-3">
              {campaigns.map((c) => {
                const s = c.acceptance?.summarySnapshot ?? c.summary;
                const busy = busyId === c.id;
                return (
                  <li key={c.id} className="space-y-3 rounded-3xl glass-soft p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-base font-semibold text-ink">{s.benefitTitle}</p>
                        <p className="mt-0.5 text-[13px] text-muted-foreground">
                          {describeOffer(s)} · {s.quantity.toLocaleString("pt-BR")} {s.quantityUnit} · {formatDateBR(s.startDate)} a {formatDateBR(s.endDate)} · {VISIBILITY_PLANS[s.plan].label} · v
                          {c.acceptance?.campaignVersion ?? c.version}
                        </p>
                      </div>
                      <Tag tone={CAMPAIGN_TONE[c.status]}>{CAMPAIGN_STATUS_LABEL[c.status]}</Tag>
                    </div>
                    {c.acceptance && (
                      <p className="text-[13px] text-ink">
                        Certificado <span className="font-mono">{c.acceptance.certificateId}</span> · aceito em {formatDateTimeBR(c.acceptance.acceptedAt)} por {c.acceptance.userEmail}
                      </p>
                    )}
                    {c.status === "accepted" && !c.benefitId && (
                      <Notice tone="warning">Aceite registrado, mas o benefício ainda não foi publicado no catálogo.</Notice>
                    )}
                    {c.status === "cancelled" && c.cancelReason && <p className="text-[13px] text-muted-foreground">Motivo do cancelamento: {c.cancelReason}</p>}
                    <div className="flex flex-wrap gap-2">
                      <a className={linkClass} href={docLink(c, "contract")} target="_blank" rel="noopener noreferrer">
                        Ver contrato
                        <IconExternal size={14} />
                      </a>
                      {c.acceptance && (
                        <a className={linkClass} href={docLink(c, "certificate")} target="_blank" rel="noopener noreferrer">
                          Certificado
                          <IconExternal size={14} />
                        </a>
                      )}
                      {(c.status === "draft" || c.status === "sent") && (
                        <Button variant="secondary" size="sm" onClick={() => setCampaignSheet({ campaign: c })}>
                          Editar
                        </Button>
                      )}
                      {c.status === "draft" && (
                        <Button size="sm" disabled={busy || !partner.ownerUserId} onClick={() => void action(c, { action: "send" })} title={partner.ownerUserId ? undefined : "Vincule um login antes"}>
                          {busy ? "Enviando…" : "Enviar para aceite"}
                        </Button>
                      )}
                      {c.status === "accepted" && !c.benefitId && (
                        <Button size="sm" disabled={busy} onClick={() => void action(c, { action: "publish" })}>
                          Publicar benefício
                        </Button>
                      )}
                      {c.status !== "cancelled" && (
                        <Button variant="danger" size="sm" disabled={busy} onClick={() => setCancelling(c)}>
                          {c.status === "accepted" ? "Encerrar campanha" : "Cancelar"}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <aside className="space-y-6 lg:col-span-5">
          <div className="rounded-3xl glass p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-[15px] font-semibold text-ink">Login do portal</h3>
                <p className="mt-1 truncate text-sm text-muted-foreground">{partner.ownerEmail || "Nenhum login vinculado"}</p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setEditingAccess(true)}>
                {partner.ownerEmail ? "Gerenciar" : "Configurar"}
              </Button>
            </div>
            <p className="mt-3 text-[13px] text-muted-foreground">Só este login escaneia e dá baixa nos QR Codes dos benefícios deste parceiro.</p>
          </div>

          <div className="rounded-3xl glass p-5">
            <h3 className="text-[15px] font-semibold text-ink">Representante e contato</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-[13px] text-muted-foreground">Representante</dt>
                <dd className="text-ink">
                  {partner.representative.name || "—"}
                  {partner.representative.role && `, ${partner.representative.role}`}
                  {partner.representative.document && <span className="block font-mono text-[13px]">CPF {formatDocument("CPF", partner.representative.document)}</span>}
                </dd>
              </div>
              <div>
                <dt className="text-[13px] text-muted-foreground">Contato operacional</dt>
                <dd className="text-ink">{[partner.contact.name, partner.contact.phone, partner.contact.email].filter(Boolean).join(" · ") || "—"}</dd>
              </div>
            </dl>
            {missing.length > 0 && (
              <Notice tone="warning" className="mt-4">
                Falta para o aceite: {missing.join(", ")}. O parceiro pode completar no portal.
              </Notice>
            )}
          </div>

          <div className="rounded-3xl glass p-5">
            <h3 className="text-[15px] font-semibold text-ink">Benefícios no catálogo</h3>
            {benefits.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Nenhum ainda. O aceite de um contrato publica o benefício automaticamente.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {benefits.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0 truncate text-sm text-ink">{b.title}</span>
                    <span className="flex shrink-0 gap-1.5">
                      {b.sponsored && <Tag tone="accent">{VISIBILITY_PLANS[b.visibilityPlan ?? "basico"].label}</Tag>}
                      <Tag>{b.campaignId ? "Contrato" : "Avulso"}</Tag>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      <div className="border-t border-line pt-10">
        <MetricsPanel endpoint={`/api/admin/partners/metrics?partnerId=${encodeURIComponent(partner.id)}`} title="Métricas do parceiro" />
      </div>

      <AdminPartnerSheet
        open={editingPartner}
        onClose={() => setEditingPartner(false)}
        partner={partner}
        onSaved={async () => {
          setEditingPartner(false);
          await onRefresh();
        }}
      />
      <AdminPartnerAccessSheet
        open={editingAccess}
        onClose={() => setEditingAccess(false)}
        partner={partner as Partner}
        onSaved={async () => {
          setEditingAccess(false);
          await onRefresh();
        }}
      />
      <AdminCampaignSheet
        open={campaignSheet !== null}
        onClose={() => setCampaignSheet(null)}
        partner={partner}
        campaign={campaignSheet?.campaign ?? null}
        template={latestCampaign?.summary}
        onSaved={async () => {
          setCampaignSheet(null);
          await Promise.all([loadCampaigns(), onRefresh()]);
        }}
      />
      <CancelSheet
        campaign={cancelling}
        onClose={() => setCancelling(null)}
        onConfirm={async (reason) => {
          if (cancelling && (await action(cancelling, { action: "cancel", reason }))) setCancelling(null);
        }}
      />
    </section>
  );
}

function CancelSheet({ campaign, onClose, onConfirm }: { campaign: AdminCampaign | null; onClose: () => void; onConfirm: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const accepted = campaign?.status === "accepted";
  return (
    <Sheet
      open={Boolean(campaign)}
      onClose={onClose}
      title={accepted ? "Encerrar campanha" : "Cancelar contrato"}
      description={
        accepted
          ? "O benefício sai do catálogo agora. O aceite e o certificado continuam registrados; vouchers já emitidos seguem valendo pelo contrato."
          : "O parceiro deixa de ver este contrato para aceite."
      }
      footer={
        <Button
          block
          variant="danger"
          disabled={busy || reason.trim().length < 3}
          onClick={async () => {
            setBusy(true);
            await onConfirm(reason.trim());
            setBusy(false);
            setReason("");
          }}
        >
          {busy ? "Salvando…" : accepted ? "Encerrar campanha" : "Cancelar contrato"}
        </Button>
      }
    >
      <Field label="Motivo" hint="Fica registrado na campanha (cláusulas 5.5 e 16.3).">
        {(id, d) => <Textarea id={id} aria-describedby={d} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />}
      </Field>
    </Sheet>
  );
}
