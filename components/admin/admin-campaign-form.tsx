// Hello World
"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Button, Checkbox, Field, Input, Notice, RadioCards, Select, Sheet, Textarea } from "@/components/app/ui";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { useFormDraft } from "@/components/admin/use-form-draft";
import { PRX_CATEGORIES, levelGateOptions } from "@/lib/pass-data";
import { buildSummaryRows } from "@/lib/partners/contract";
import {
  OFFER_KINDS,
  QUANTITY_UNITS,
  REDEMPTION_MODES,
  REDEMPTION_MODE_IDS,
  VISIBILITY_PLANS,
  VISIBILITY_PLAN_IDS,
  deriveOfferLabel,
  formatMoney,
  referenceMediaPrice,
  type OfferKind,
  type QuantityUnit,
  type RedemptionMode,
  type VisibilityPlan,
} from "@/lib/partners/plans";
import { commercialSummarySchema, type Campaign, type CommercialSummary, type Partner } from "@/lib/partners/types";

interface FormState {
  benefitTitle: string;
  benefitDescription: string;
  eligibleItem: string;
  categoryId: string;
  normalPrice: string;
  offerKind: OfferKind;
  prxPrice: string;
  discountPercent: string;
  giftDescription: string;
  catalogLabel: string;
  quantity: string;
  quantityUnit: QuantityUnit;
  perUserLimit: string;
  startDate: string;
  endDate: string;
  channels: string;
  redemptionModes: RedemptionMode[];
  usageDeadlineDays: string;
  earlyEndOnSellOut: boolean;
  exclusive: boolean;
  exclusivityMonths: string;
  plan: VisibilityPlan;
  mediaPeriods: string;
  mediaPrice: string;
  commission: string;
  minPrxLevel: string;
  rules: string;
}

/** AAAA-MM-DD no horário de Brasília, somando `days`. */
function brDate(days = 0): string {
  return new Date(Date.now() + days * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

const toText = (value: number | null) => (value === null ? "" : String(value).replace(".", ","));

/** Aceita "1.490,00", "1490,5", "19.90" e "1.490" (milhar). */
function toNumber(value: string): number | null {
  let v = value.trim().replace(/[R$\s]/g, "");
  if (v === "") return null;
  if (v.includes(",")) v = v.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, "");
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Termos que se repetem entre campanhas do mesmo parceiro: um contrato novo já vem com os do último. */
function reusedTerms(t: CommercialSummary): Partial<FormState> {
  return {
    categoryId: t.categoryId,
    quantityUnit: t.quantityUnit,
    perUserLimit: String(t.perUserLimit),
    channels: t.channels,
    redemptionModes: t.redemptionModes,
    usageDeadlineDays: String(t.usageDeadlineDays),
    earlyEndOnSellOut: t.earlyEndOnSellOut,
    exclusive: t.exclusive,
    exclusivityMonths: String(t.exclusivityMonths),
    plan: t.plan,
    mediaPeriods: String(t.mediaPeriods),
    mediaPrice: String(t.mediaPrice),
    commission: t.commission,
    minPrxLevel: String(t.minPrxLevel),
    rules: t.rules.join("\n"),
  };
}

function initialState(partner: Partner, summary?: CommercialSummary, template?: CommercialSummary): FormState {
  if (!summary && template) return { ...initialState(partner), ...reusedTerms(template) };
  if (summary) {
    return {
      ...summary,
      normalPrice: toText(summary.normalPrice),
      prxPrice: toText(summary.prxPrice),
      discountPercent: toText(summary.discountPercent),
      quantity: String(summary.quantity),
      perUserLimit: String(summary.perUserLimit),
      usageDeadlineDays: String(summary.usageDeadlineDays),
      exclusivityMonths: String(summary.exclusivityMonths),
      mediaPeriods: String(summary.mediaPeriods),
      mediaPrice: String(summary.mediaPrice),
      minPrxLevel: String(summary.minPrxLevel),
      rules: summary.rules.join("\n"),
    };
  }
  return {
    benefitTitle: "",
    benefitDescription: "",
    eligibleItem: "",
    categoryId: partner.categoryId || "gastronomia",
    normalPrice: "",
    offerKind: "percentual",
    prxPrice: "",
    discountPercent: "",
    giftDescription: "",
    catalogLabel: "",
    quantity: "100",
    quantityUnit: "unidades",
    perUserLimit: "1",
    startDate: brDate(1),
    endDate: brDate(31),
    channels: partner.location,
    redemptionModes: ["qr_presencial"],
    usageDeadlineDays: "7",
    earlyEndOnSellOut: false,
    exclusive: true,
    exclusivityMonths: "3",
    plan: "basico",
    mediaPeriods: "1",
    mediaPrice: "0",
    commission: "Sem comissão: o pagamento acontece direto no estabelecimento do parceiro.",
    minPrxLevel: "1",
    rules: "",
  };
}

function toSummary(form: FormState): Record<string, unknown> {
  return {
    ...form,
    normalPrice: toNumber(form.normalPrice),
    prxPrice: form.offerKind === "preco" ? toNumber(form.prxPrice) : null,
    discountPercent: form.offerKind === "percentual" ? toNumber(form.discountPercent) : null,
    giftDescription: form.offerKind === "brinde" ? form.giftDescription : "",
    quantity: toNumber(form.quantity) ?? 0,
    perUserLimit: toNumber(form.perUserLimit) ?? 0,
    usageDeadlineDays: toNumber(form.usageDeadlineDays) ?? 0,
    exclusivityMonths: form.exclusive ? toNumber(form.exclusivityMonths) ?? 0 : 0,
    mediaPeriods: toNumber(form.mediaPeriods) ?? 1,
    mediaPrice: toNumber(form.mediaPrice) ?? 0,
    minPrxLevel: toNumber(form.minPrxLevel) ?? 1,
    rules: form.rules.split("\n").map((r) => r.trim()).filter(Boolean),
  };
}

interface ApiResult {
  success?: boolean;
  error?: string;
  message?: string;
}

export function AdminCampaignSheet({
  open,
  onClose,
  partner,
  campaign,
  onSaved,
  template,
}: {
  open: boolean;
  onClose: () => void;
  partner: Partner;
  campaign: Campaign | null;
  onSaved: () => void;
  /** Último contrato do parceiro: o novo já vem com canais, comissão, plano e regras dele. */
  template?: CommercialSummary;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      size="lg"
      title={campaign ? `Editar contrato · v${campaign.version}` : "Novo contrato de campanha"}
      description={`${partner.tradeName} · cláusula 3, Resumo Comercial. O contrato individual é gerado a partir deste formulário.`}
    >
      {open && <CampaignForm key={campaign?.id ?? "new"} partner={partner} campaign={campaign} template={template} onSaved={onSaved} />}
    </Sheet>
  );
}

function CampaignForm({ partner, campaign, template, onSaved }: { partner: Partner; campaign: Campaign | null; template?: CommercialSummary; onSaved: () => void }) {
  const { showToast } = useConfirmToast();
  // Rascunho no navegador: fechar o painel ou um erro não apagam o contrato em preenchimento.
  const draft = useFormDraft<FormState>(
    `prx_admin_campaign_draft:${partner.id}:${campaign?.id ?? "new"}`,
    campaign ? `${campaign.id}:${campaign.version}` : "new",
    () => initialState(partner, campaign?.summary, template)
  );
  const form = draft.value;
  const setForm = draft.setValue;
  const [mediaTouched, setMediaTouched] = useState(Boolean(campaign));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState<null | "draft" | "send">(null);
  const [showPreview, setShowPreview] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  function setMediaBasis(plan: VisibilityPlan, periods: string) {
    setForm((prev) => ({
      ...prev,
      plan,
      mediaPeriods: periods,
      mediaPrice: mediaTouched && plan !== "basico" ? prev.mediaPrice : String(referenceMediaPrice(plan, toNumber(periods) ?? 1)),
    }));
  }

  const parsed = useMemo(() => commercialSummarySchema.safeParse(toSummary(form)), [form]);
  const previewRows = useMemo(() => {
    if (!parsed.success) return null;
    return buildSummaryRows(
      {
        tradeName: partner.tradeName,
        legalName: partner.legalName,
        documentType: partner.documentType,
        document: partner.document,
        location: partner.location,
        representative: partner.representative,
        contact: partner.contact,
      },
      parsed.data
    );
  }, [parsed, partner]);

  const autoLabel = deriveOfferLabel({
    offerKind: form.offerKind,
    prxPrice: toNumber(form.prxPrice),
    discountPercent: toNumber(form.discountPercent),
  });
  const plan = VISIBILITY_PLANS[form.plan];
  const periodLabel = plan.period === "mês" ? "Meses de mídia" : "Períodos de 7 dias";

  async function save(send: boolean) {
    setServerError(null);
    if (!parsed.success) {
      const map: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => {
        const key = String(issue.path[0] ?? "form");
        map[key] ??= issue.message;
      });
      setErrors(map);
      setServerError("Revise os campos destacados.");
      return;
    }
    setErrors({});
    setSaving(send ? "send" : "draft");
    try {
      const res = await fetch("/api/admin/campaigns", {
        method: campaign ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(campaign ? { id: campaign.id, summary: parsed.data } : { partnerId: partner.id, summary: parsed.data, send }),
      });
      const data = (await res.json()) as ApiResult;
      if (!res.ok || !data.success) {
        setServerError(data.error || "Não foi possível salvar o contrato.");
        return;
      }
      draft.clear();
      showToast("success", data.message || "Contrato salvo.");
      onSaved();
    } catch {
      setServerError("Sem internet agora. Confira sua conexão e tente de novo.");
    } finally {
      setSaving(null);
    }
  }

  const err = (key: keyof FormState) => errors[key];
  const sectionTitle = "col-span-full border-t border-line pt-5 text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground first:border-t-0 first:pt-0";

  return (
    <form
      onSubmit={(e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        void save(!campaign);
      }}
      noValidate
      className="grid gap-5 sm:grid-cols-2"
    >
      {draft.restored && (
        <Notice className="col-span-full">
          <span className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>Recuperamos o que você já tinha preenchido neste contrato.</span>
            <Button variant="secondary" size="sm" onClick={draft.discard}>
              Descartar rascunho
            </Button>
          </span>
        </Notice>
      )}
      <h3 className={sectionTitle}>Benefício</h3>
      <Field label="Título no catálogo" hint="Curto e direto. Ex.: Café coado grátis." error={err("benefitTitle")}>
        {(id, d) => <Input id={id} aria-describedby={d} value={form.benefitTitle} onChange={(e) => set("benefitTitle", e.target.value)} maxLength={80} />}
      </Field>
      <Field label="Categoria">
        {(id) => (
          <Select id={id} value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
            {PRX_CATEGORIES.filter((c) => c.id !== "all").map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Benefício / vantagem (descrição clara e completa)" error={err("benefitDescription")} className="sm:col-span-2">
        {(id, d) => <Textarea id={id} aria-describedby={d} rows={3} value={form.benefitDescription} onChange={(e) => set("benefitDescription", e.target.value)} />}
      </Field>
      <Field label="Produto / serviço / experiência" error={err("eligibleItem")}>
        {(id, d) => <Input id={id} aria-describedby={d} value={form.eligibleItem} onChange={(e) => set("eligibleItem", e.target.value)} />}
      </Field>
      <Field label="Nível mínimo no app">
        {(id) => (
          <Select id={id} value={form.minPrxLevel} onChange={(e) => set("minPrxLevel", e.target.value)}>
            {levelGateOptions(Number(form.minPrxLevel)).map((lvl) => (
              <option key={lvl} value={lvl}>
                {lvl === 1 ? "Nível 1 (todos)" : `Nível ${lvl}`}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <h3 className={sectionTitle}>Preço e oferta</h3>
      <RadioCards
        label="Condição PRX"
        value={form.offerKind}
        onChange={(v) => set("offerKind", v)}
        options={(Object.keys(OFFER_KINDS) as OfferKind[]).map((k) => ({ value: k, title: OFFER_KINDS[k] }))}
        className="sm:col-span-2"
      />
      <Field label="Preço normal (R$)" hint={form.offerKind === "brinde" ? "Opcional para brinde." : undefined} error={err("normalPrice")}>
        {(id, d) => <Input id={id} aria-describedby={d} inputMode="decimal" value={form.normalPrice} onChange={(e) => set("normalPrice", e.target.value)} placeholder="0,00" />}
      </Field>
      {form.offerKind === "preco" && (
        <Field label="Preço PRX (R$)" hint="Use 0 para gratuito." error={err("prxPrice")}>
          {(id, d) => <Input id={id} aria-describedby={d} inputMode="decimal" value={form.prxPrice} onChange={(e) => set("prxPrice", e.target.value)} placeholder="0,00" />}
        </Field>
      )}
      {form.offerKind === "percentual" && (
        <Field label="Desconto (%)" error={err("discountPercent")}>
          {(id, d) => <Input id={id} aria-describedby={d} inputMode="numeric" value={form.discountPercent} onChange={(e) => set("discountPercent", e.target.value)} placeholder="25" />}
        </Field>
      )}
      {form.offerKind === "brinde" && (
        <Field label="Descrição do brinde" error={err("giftDescription")}>
          {(id, d) => <Input id={id} aria-describedby={d} value={form.giftDescription} onChange={(e) => set("giftDescription", e.target.value)} />}
        </Field>
      )}
      <Field label="Rótulo no card (opcional)" hint={`Automático: ${autoLabel}`} error={err("catalogLabel")} className="sm:col-span-2">
        {(id, d) => <Input id={id} aria-describedby={d} value={form.catalogLabel} maxLength={24} onChange={(e) => set("catalogLabel", e.target.value)} placeholder={autoLabel} />}
      </Field>

      <h3 className={sectionTitle}>Quantidade e vigência</h3>
      <Field label="Quantidade total garantida" error={err("quantity")}>
        {(id, d) => <Input id={id} aria-describedby={d} inputMode="numeric" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} />}
      </Field>
      <Field label="Unidade">
        {(id) => (
          <Select id={id} value={form.quantityUnit} onChange={(e) => set("quantityUnit", e.target.value as QuantityUnit)}>
            {(Object.keys(QUANTITY_UNITS) as QuantityUnit[]).map((u) => (
              <option key={u} value={u}>
                {QUANTITY_UNITS[u]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Limite por usuário" error={err("perUserLimit")}>
        {(id, d) => <Input id={id} aria-describedby={d} inputMode="numeric" value={form.perUserLimit} onChange={(e) => set("perUserLimit", e.target.value)} />}
      </Field>
      <Field label="Prazo para uso após aquisição (dias)" error={err("usageDeadlineDays")}>
        {(id, d) => <Input id={id} aria-describedby={d} inputMode="numeric" value={form.usageDeadlineDays} onChange={(e) => set("usageDeadlineDays", e.target.value)} />}
      </Field>
      <Field label="Início da campanha" error={err("startDate")}>
        {(id, d) => <Input id={id} aria-describedby={d} type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />}
      </Field>
      <Field label="Fim da campanha" error={err("endDate")}>
        {(id, d) => <Input id={id} aria-describedby={d} type="date" value={form.endDate} min={form.startDate} onChange={(e) => set("endDate", e.target.value)} />}
      </Field>
      <Checkbox
        className="sm:col-span-2"
        label="A oferta autoriza encerramento antecipado quando a quantidade esgotar"
        hint="Sem isso, a quantidade é garantida durante toda a vigência (cláusula 5.1)."
        checked={form.earlyEndOnSellOut}
        onChange={(v) => set("earlyEndOnSellOut", v)}
      />

      <h3 className={sectionTitle}>Onde e como usar</h3>
      <Field label="Unidades / canais participantes" hint="Endereços, online ou nacional." error={err("channels")} className="sm:col-span-2">
        {(id, d) => <Textarea id={id} aria-describedby={d} rows={2} value={form.channels} onChange={(e) => set("channels", e.target.value)} />}
      </Field>
      <fieldset className="sm:col-span-2">
        <legend className="mb-1 text-[13px] font-medium text-ink">Modalidade de uso</legend>
        <div className="grid sm:grid-cols-2">
          {REDEMPTION_MODE_IDS.map((mode) => (
            <Checkbox
              key={mode}
              label={REDEMPTION_MODES[mode].label}
              checked={form.redemptionModes.includes(mode)}
              onChange={(checked) =>
                set("redemptionModes", checked ? [...form.redemptionModes, mode] : form.redemptionModes.filter((m) => m !== mode))
              }
            />
          ))}
        </div>
        {err("redemptionModes") && <p className="text-[13px] text-destructive">{err("redemptionModes")}</p>}
      </fieldset>
      <Field label="Regras adicionais (uma por linha)" hint="Ex.: Válido de segunda a sexta." className="sm:col-span-2">
        {(id, d) => <Textarea id={id} aria-describedby={d} rows={2} value={form.rules} onChange={(e) => set("rules", e.target.value)} />}
      </Field>

      <h3 className={sectionTitle}>Exclusividade</h3>
      <Checkbox
        label="Benefício Exclusivo PRX"
        hint="A condição não pode ser oferecida igual ou melhor em outra plataforma (cláusula 7.2). Não há exclusividade de segmento."
        checked={form.exclusive}
        onChange={(v) => setForm((prev) => ({ ...prev, exclusive: v, exclusivityMonths: v ? prev.exclusivityMonths : "0" }))}
      />
      <Field label="Exclusividade após a campanha" error={err("exclusivityMonths")}>
        {(id, d) => (
          <Select id={id} aria-describedby={d} value={form.exclusivityMonths} disabled={!form.exclusive} onChange={(e) => set("exclusivityMonths", e.target.value)}>
            {[0, 1, 2, 3].map((m) => (
              <option key={m} value={m}>
                {m === 0 ? "Nenhuma" : `${m} ${m === 1 ? "mês" : "meses"}`}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <h3 className={sectionTitle}>Visibilidade, mídia e comissão</h3>
      <RadioCards
        label="Plano de visibilidade"
        value={form.plan}
        onChange={(v) => setMediaBasis(v, form.mediaPeriods)}
        options={VISIBILITY_PLAN_IDS.map((id) => {
          const def = VISIBILITY_PLANS[id];
          return {
            value: id,
            title: def.label,
            meta: def.price === 0 ? "R$ 0" : `${def.startingAt ? "a partir de " : ""}${formatMoney(def.price)}/${def.period}`,
            body: def.perks,
          };
        })}
        className="sm:col-span-2"
      />
      <Field label={periodLabel} error={err("mediaPeriods")}>
        {(id, d) => (
          <Input
            id={id}
            aria-describedby={d}
            inputMode="numeric"
            value={form.mediaPeriods}
            disabled={form.plan === "basico"}
            onChange={(e) => setMediaBasis(form.plan, e.target.value)}
          />
        )}
      </Field>
      <Field
        label="Valor de mídia (R$)"
        hint={form.plan === "basico" ? "Sem custo de mídia." : `Referência da tabela: ${formatMoney(referenceMediaPrice(form.plan, toNumber(form.mediaPeriods) ?? 1))}.`}
        error={err("mediaPrice")}
      >
        {(id, d) => (
          <Input
            id={id}
            aria-describedby={d}
            inputMode="decimal"
            value={form.mediaPrice}
            disabled={form.plan === "basico"}
            onChange={(e) => {
              setMediaTouched(true);
              set("mediaPrice", e.target.value);
            }}
          />
        )}
      </Field>
      <Field label="Repasse / comissão / taxa" hint="Calendário de repasses, comissão, taxas e retenções (cláusula 9.3)." error={err("commission")} className="sm:col-span-2">
        {(id, d) => <Textarea id={id} aria-describedby={d} rows={2} value={form.commission} onChange={(e) => set("commission", e.target.value)} />}
      </Field>

      <div className="col-span-full space-y-3 border-t border-line pt-5">
        <Button variant="secondary" size="sm" onClick={() => setShowPreview((v) => !v)} aria-expanded={showPreview}>
          {showPreview ? "Ocultar Resumo Comercial" : "Pré-visualizar Resumo Comercial"}
        </Button>
        {showPreview &&
          (previewRows ? (
            <table className="w-full overflow-hidden rounded-2xl bg-surface text-sm">
              <caption className="sr-only">Resumo Comercial como sairá no contrato</caption>
              <tbody className="divide-y divide-line">
                {previewRows.map(([label, value]) => (
                  <tr key={label}>
                    <th scope="row" className="w-[38.2%] px-4 py-2.5 text-left align-top font-medium text-muted-foreground">
                      {label}
                    </th>
                    <td className="px-4 py-2.5 text-ink">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Notice tone="warning">Complete os campos obrigatórios para ver o Resumo Comercial.</Notice>
          ))}
      </div>

      {serverError && (
        <Notice tone="error" className="col-span-full">
          {serverError}
        </Notice>
      )}

      <div className="col-span-full flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
        {campaign ? (
          <Button type="submit" disabled={saving !== null}>
            {saving ? "Salvando…" : `Salvar versão ${campaign.version + 1}`}
          </Button>
        ) : (
          <>
            <Button variant="secondary" disabled={saving !== null} onClick={() => void save(false)}>
              {saving === "draft" ? "Salvando…" : "Salvar rascunho"}
            </Button>
            <Button type="submit" disabled={saving !== null}>
              {saving === "send" ? "Gerando…" : "Gerar contrato e enviar para aceite"}
            </Button>
          </>
        )}
      </div>
    </form>
  );
}
