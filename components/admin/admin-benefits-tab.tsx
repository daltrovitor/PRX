// Hello World
"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { PrxImage } from "@/components/ui/prx-image";
import { PRX_CATEGORIES, type Benefit, levelGateOptions } from "@/lib/pass-data";
import { VISIBILITY_PLANS } from "@/lib/partners/plans";
import type { PartnerOverview } from "@/lib/partners/service";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { ImagePicker, useImageUpload } from "@/components/admin/image-picker";
import { Button, EmptyState, Field, Input, Notice, Segmented, Select, Sheet, Tag, Textarea } from "@/components/app/ui";
import { IconImage, IconPlus } from "@/components/icons/prx-icons";
import { ViabilityCalculator, evaluateViability, type ViabilityValues } from "@/components/admin/viability-calculator";
import { DEFAULT_PARTNER_FEE_PCT, MIN_PROFIT_MARGIN_PCT } from "@/lib/points/economics";
import { BADGES, type BadgeCode } from "@/lib/badges/catalog";
import { BadgePicker } from "@/components/admin/badge-picker";
import { BadgeChips } from "@/components/app/pass/badge-chips";

export interface AdminEconomy {
  coinsPerReal: number;
  behaviorCoinsPerMonth: number;
}

interface AdminBenefitsTabProps {
  benefits: Benefit[];
  partners: PartnerOverview[];
  economy: AdminEconomy;
  onRefresh: () => Promise<void>;
  /** Valores vindos da calculadora do Financeiro: abre o cadastro já preenchido. */
  draftEconomics?: ViabilityValues | null;
  onDraftConsumed?: () => void;
}

interface BenefitForm {
  partnerId: string;
  categoryId: string;
  title: string;
  description: string;
  discountLabel: string;
  minPrxLevel: number;
  partnerLocation: string;
  partnerLogo: string;
  partnerBanner: string;
  terms: string;
  economics: ViabilityValues;
  badges: BadgeCode[];
}

const EMPTY_ECONOMICS: ViabilityValues = {
  costPrice: "0",
  revenuePerRedemption: "0",
  partnerFeePct: String(DEFAULT_PARTNER_FEE_PCT),
  minMarginPct: String(MIN_PROFIT_MARGIN_PCT),
  pointsCost: "",
};

const EMPTY_FORM: BenefitForm = {
  partnerId: "",
  categoryId: "gastronomia",
  title: "",
  description: "",
  discountLabel: "",
  minPrxLevel: 1,
  partnerLocation: "",
  partnerLogo: "",
  partnerBanner: "",
  terms: "Apresente o QR Code no balcão ao pedir a conta.",
  economics: EMPTY_ECONOMICS,
  badges: [],
};

const toNumber = (text: string) => {
  const value = Number(String(text).replace(",", "."));
  return Number.isFinite(value) ? value : 0;
};

interface ApiResult {
  success?: boolean;
  error?: string;
}

type Filter = "all" | "unassigned";

export function AdminBenefitsTab({ benefits, partners, economy, onRefresh, draftEconomics, onDraftConsumed }: AdminBenefitsTabProps) {
  const { confirmDelete, showToast } = useConfirmToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Benefit | null>(null);
  const [form, setForm] = useState<BenefitForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const logo = useImageUpload((url) => setForm((f) => ({ ...f, partnerLogo: url })), setError);
  const banner = useImageUpload((url) => setForm((f) => ({ ...f, partnerBanner: url })), setError);

  const partnerById = useMemo(() => new Map(partners.map((p) => [p.id, p])), [partners]);
  const unassigned = benefits.filter((b) => !b.partnerId || !partnerById.has(b.partnerId));
  const visible = filter === "unassigned" ? unassigned : benefits;
  const selectablePartners = partners.filter((p) => p.status !== "BLOQUEADO");

  function openCreate(economics: ViabilityValues = EMPTY_ECONOMICS) {
    setEditing(null);
    setForm({ ...EMPTY_FORM, economics, partnerId: selectablePartners[0]?.id ?? "", categoryId: selectablePartners[0]?.categoryId || EMPTY_FORM.categoryId });
    setError(null);
    setOpen(true);
  }

  // Calculadora do Financeiro → cadastro de benefício com o preço e os números já preenchidos.
  const [pendingDraft, setPendingDraft] = useState<ViabilityValues | null>(null);
  if (draftEconomics && draftEconomics !== pendingDraft) {
    setPendingDraft(draftEconomics);
    setEditing(null);
    setForm({ ...EMPTY_FORM, economics: draftEconomics, partnerId: selectablePartners[0]?.id ?? "", categoryId: selectablePartners[0]?.categoryId || EMPTY_FORM.categoryId });
    setError(null);
    setOpen(true);
  }
  useEffect(() => {
    if (draftEconomics) onDraftConsumed?.();
  }, [draftEconomics, onDraftConsumed]);

  function openEdit(benefit: Benefit) {
    setEditing(benefit);
    setForm({
      partnerId: partnerById.has(benefit.partnerId) ? benefit.partnerId : "",
      categoryId: benefit.categoryId,
      title: benefit.title,
      description: benefit.description,
      discountLabel: benefit.discountLabel,
      minPrxLevel: benefit.minPrxLevel,
      partnerLocation: benefit.partnerLocation,
      partnerLogo: benefit.partnerLogo || "",
      partnerBanner: benefit.partnerBanner || "",
      terms: benefit.terms?.join("\n") || "",
      badges: benefit.badges ?? [],
      economics: {
        costPrice: String(benefit.costPrice ?? 0),
        revenuePerRedemption: String(benefit.prxRevenuePerRedemption ?? 0),
        partnerFeePct: String(benefit.partnerFeePct ?? DEFAULT_PARTNER_FEE_PCT),
        minMarginPct: String(MIN_PROFIT_MARGIN_PCT),
        pointsCost: String(benefit.pointsCost ?? 0),
      },
    });
    setError(null);
    setOpen(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.partnerId) {
      setError("Escolha o parceiro dono do benefício. Só ele poderá validar o QR Code.");
      return;
    }
    const viability = evaluateViability(form.economics, economy.coinsPerReal, economy.behaviorCoinsPerMonth);
    if (viability.status !== "ok") {
      setError(`Publicação bloqueada pela calculadora: ${viability.message}`);
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      partnerId: form.partnerId,
      categoryId: form.categoryId,
      title: form.title,
      description: form.description,
      discountLabel: form.discountLabel,
      minPrxLevel: Number(form.minPrxLevel),
      partnerLocation: form.partnerLocation,
      partnerLogo: form.partnerLogo.trim(),
      partnerBanner: form.partnerBanner.trim(),
      terms: form.terms.split("\n").map((t) => t.trim()).filter(Boolean),
      pointsCost: viability.evaluatedPoints,
      costPrice: toNumber(form.economics.costPrice),
      prxRevenuePerRedemption: toNumber(form.economics.revenuePerRedemption),
      partnerFeePct: toNumber(form.economics.partnerFeePct),
      badges: form.badges,
    };
    try {
      const res = await fetch("/api/admin/benefits", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { id: editing.id, ...payload } : payload),
      });
      const data = (await res.json()) as ApiResult;
      if (!res.ok || !data.success) {
        setError(data.error || "Não foi possível salvar o benefício.");
        return;
      }
      showToast("success", editing ? "Benefício atualizado." : "Benefício publicado no catálogo.");
      setOpen(false);
      await onRefresh();
    } catch {
      setError("Sem internet agora. Confira sua conexão e tente de novo.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(benefit: Benefit) {
    const confirmed = await confirmDelete({
      title: "Excluir benefício",
      message: `"${benefit.title}" sai do catálogo imediatamente e os vouchers dele são apagados. Esta ação não pode ser desfeita.`,
      confirmText: "Excluir",
      cancelText: "Cancelar",
    });
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/admin/benefits?id=${encodeURIComponent(benefit.id)}`, { method: "DELETE" });
      const data = (await res.json()) as ApiResult;
      if (res.ok && data.success) {
        showToast("success", `"${benefit.title}" removido.`);
        await onRefresh();
      } else {
        showToast("error", data.error || "Não foi possível excluir.");
      }
    } catch {
      showToast("error", "Sem internet agora. Confira sua conexão e tente de novo.");
    }
  }

  const selectedPartner = partnerById.get(form.partnerId);
  const formViability = evaluateViability(form.economics, economy.coinsPerReal, economy.behaviorCoinsPerMonth);

  return (
    <section aria-labelledby="benefits-title" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="benefits-title" className="font-display text-2xl font-semibold tracking-[-0.03em] text-ink">
            Benefícios
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Cada benefício pertence a um parceiro: só o login dele valida o QR Code.</p>
        </div>
        <Button onClick={() => openCreate()} disabled={selectablePartners.length === 0} title={selectablePartners.length === 0 ? "Cadastre um parceiro primeiro" : undefined}>
          <IconPlus size={18} />
          Novo benefício avulso
        </Button>
      </div>

      {partners.length === 0 && <Notice tone="warning">Cadastre um parceiro na aba Parceiros antes de criar benefícios.</Notice>}
      {unassigned.length > 0 && (
        <Notice tone="warning">
          {unassigned.length} {unassigned.length === 1 ? "benefício sem parceiro está" : "benefícios sem parceiro estão"} fora do catálogo. Edite e escolha o parceiro dono.
        </Notice>
      )}

      {unassigned.length > 0 && (
        <Segmented
          label="Filtro de benefícios"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "Todos", count: benefits.length },
            { value: "unassigned", label: "Sem parceiro", count: unassigned.length },
          ]}
        />
      )}

      {visible.length === 0 ? (
        <EmptyState
          title="Catálogo vazio"
          body="Benefícios de contrato entram sozinhos quando o parceiro aceita. Para ofertas pontuais, use o benefício avulso."
          action={selectablePartners.length > 0 ? <Button onClick={() => openCreate()}>Cadastrar benefício</Button> : undefined}
        />
      ) : (
        <div className="glass overflow-x-auto rounded-3xl">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-surface text-[13px] text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">Benefício</th>
                <th scope="col" className="px-4 py-3 font-medium">Parceiro dono</th>
                <th scope="col" className="px-4 py-3 font-medium">Oferta</th>
                <th scope="col" className="px-4 py-3 font-medium">Origem</th>
                <th scope="col" className="px-4 py-3 font-medium">Nível mín.</th>
                <th scope="col" className="px-4 py-3 font-medium">PRX Coins</th>
                <th scope="col" className="px-4 py-3 font-medium">Viabilidade</th>
                <th scope="col" className="px-4 py-3">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visible.map((benefit) => {
                const owner = partnerById.get(benefit.partnerId);
                const cat = PRX_CATEGORIES.find((c) => c.id === benefit.categoryId);
                return (
                  <tr key={benefit.id} className="transition-colors hover:bg-surface/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="relative h-10 w-10 shrink-0 overflow-hidden bg-surface">
                          {benefit.partnerLogo ? (
                            <PrxImage src={benefit.partnerLogo} alt="" fill sizes="40px" className="object-cover" />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                              <IconImage size={16} />
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-ink">{benefit.title}</p>
                          <p className="text-[13px] text-muted-foreground">{cat?.name ?? benefit.categoryId}</p>
                          <BadgeChips codes={benefit.badges} className="mt-1" />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {owner ? <span className="text-ink">{owner.tradeName}</span> : <Tag tone="warning">Sem parceiro</Tag>}
                    </td>
                    <td className="px-4 py-3">
                      <Tag tone="accent">{benefit.discountLabel}</Tag>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-muted-foreground">
                      {benefit.campaignId ? `Contrato · ${VISIBILITY_PLANS[benefit.visibilityPlan ?? "basico"].label}` : "Avulso"}
                    </td>
                    <td className="px-4 py-3 font-mono text-ink">{benefit.minPrxLevel}</td>
                    <td className="px-4 py-3 tabular-nums text-ink">{(benefit.pointsCost ?? 0).toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-3">
                      <ViabilityTag benefit={benefit} economy={economy} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" size="sm" onClick={() => openEdit(benefit)}>
                          {owner ? "Editar" : "Atribuir parceiro"}
                        </Button>
                        {!benefit.campaignId && (
                          <Button variant="danger" size="sm" onClick={() => remove(benefit)}>
                            Excluir
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title={editing ? "Editar benefício" : "Novo benefício avulso"}
        description={editing?.campaignId ? "Benefício de contrato: preço, quantidade e vigência seguem o Resumo Comercial aceito." : "Sem contrato de campanha: não tem quantidade garantida nem vigência."}
        footer={
          <Button block type="submit" form="benefit-form" disabled={saving || logo.busy || banner.busy || formViability.status !== "ok"}>
            {formViability.status !== "ok" ? "Ajuste o preço: risco de prejuízo" : saving ? "Salvando…" : editing ? "Salvar alterações" : "Publicar benefício"}
          </Button>
        }
      >
        <form id="benefit-form" onSubmit={submit} className="grid gap-5 sm:grid-cols-2">
          <Field label="Parceiro dono" hint="Só o login deste parceiro valida o QR Code." className="sm:col-span-2">
            {(id, describedBy) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                required
                value={form.partnerId}
                disabled={Boolean(editing?.campaignId)}
                onChange={(e) => setForm({ ...form, partnerId: e.target.value })}
              >
                <option value="" disabled>
                  Escolha o parceiro
                </option>
                {selectablePartners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.tradeName} · {p.legalName}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Categoria">
            {(id) => (
              <Select id={id} value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                {PRX_CATEGORIES.filter((c) => c.id !== "all").map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Título do benefício">
            {(id) => <Input id={id} required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />}
          </Field>
          <Field label="Rótulo da oferta" hint="Ex.: 25% OFF, Leve 2 pague 1.">
            {(id, describedBy) => (
              <Input id={id} aria-describedby={describedBy} required maxLength={24} value={form.discountLabel} onChange={(e) => setForm({ ...form, discountLabel: e.target.value })} />
            )}
          </Field>
          <Field label="Nível mínimo">
            {(id) => (
              <Select id={id} value={form.minPrxLevel} onChange={(e) => setForm({ ...form, minPrxLevel: Number(e.target.value) })}>
                {levelGateOptions(form.minPrxLevel).map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl === 1 ? "Nível 1 (todos)" : `Nível ${lvl}`}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Local ou alcance" hint={selectedPartner ? `Vazio usa o do parceiro: ${selectedPartner.location}.` : undefined} className="sm:col-span-2">
            {(id, describedBy) => <Input id={id} aria-describedby={describedBy} value={form.partnerLocation} onChange={(e) => setForm({ ...form, partnerLocation: e.target.value })} />}
          </Field>
          <Field label="Descrição" className="sm:col-span-2">
            {(id) => <Textarea id={id} rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />}
          </Field>
          <Field label="Regras (uma por linha)" className="sm:col-span-2">
            {(id) => <Textarea id={id} rows={3} value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} />}
          </Field>

          <BadgePicker
            className="sm:col-span-2"
            value={form.badges}
            onChange={(badges) => setForm((f) => ({ ...f, badges }))}
            hint={selectedPartner?.badges?.length ? `Já vêm do parceiro: ${selectedPartner.badges.map((c) => BADGES[c].name).join(", ")}.` : undefined}
          />

          <fieldset className="space-y-3 sm:col-span-2">
            <legend className="text-[15px] font-semibold text-ink">Preço em PRX Coins e viabilidade</legend>
            <p className="text-[13px] text-muted-foreground">
              O membro só vê o preço em coins. Os números abaixo são internos e garantem que o resgate chegue com pelo menos {MIN_PROFIT_MARGIN_PCT}% de lucro.
            </p>
            <ViabilityCalculator
              values={form.economics}
              onChange={(economics) => setForm((f) => ({ ...f, economics }))}
              coinsPerReal={economy.coinsPerReal}
              behaviorCoinsPerMonth={economy.behaviorCoinsPerMonth}
            />
          </fieldset>

          <ImagePicker label="Logo (vazio usa o do parceiro)" value={form.partnerLogo} busy={logo.busy} onChange={(e) => logo.upload(e, "logo")} square />
          <ImagePicker label="Capa (vazio usa a do parceiro)" value={form.partnerBanner} busy={banner.busy} onChange={(e) => banner.upload(e, "banner")} />

          {error && (
            <Notice tone="error" className="sm:col-span-2">
              {error}
            </Notice>
          )}
        </form>
      </Sheet>
    </section>
  );
}

function ViabilityTag({ benefit, economy }: { benefit: Benefit; economy: AdminEconomy }) {
  const result = evaluateViability(
    {
      costPrice: String(benefit.costPrice ?? 0),
      revenuePerRedemption: String(benefit.prxRevenuePerRedemption ?? 0),
      partnerFeePct: String(benefit.partnerFeePct ?? DEFAULT_PARTNER_FEE_PCT),
      minMarginPct: String(MIN_PROFIT_MARGIN_PCT),
      pointsCost: String(benefit.pointsCost ?? 0),
    },
    economy.coinsPerReal,
    economy.behaviorCoinsPerMonth
  );
  if (!(benefit.costPrice && benefit.costPrice > 0)) return <Tag>Sem custo</Tag>;
  if (result.status === "ok") return <Tag tone="success">{result.marginOnCostPct?.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}% de margem</Tag>;
  return <Tag tone="warning">{result.status === "loss" ? "Prejuízo" : "Margem baixa"}</Tag>;
}
