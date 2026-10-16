// Hello World
"use client";

import { useState } from "react";
import { Button, Checkbox, Field, Input, Select, Sheet, Textarea } from "@/components/app/ui";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { adminPost, errorText } from "@/components/admin/admin-api";
import { BILLING_TYPES, BILLING_TYPE_LABEL, CYCLES, CYCLE_LABEL, type BillingType, type Cycle } from "@/lib/asaas/billing";
import { CANCELLATION_LABEL, CANCELLATION_POLICIES, PLAN_STATUSES, PLAN_STATUS_LABEL, type CancellationPolicy, type PlanStatus, type SubscriptionPlan } from "@/lib/subscriptions/types";

const local = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : "");
const toIso = (v: string) => (v ? new Date(v).toISOString() : null);
const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

type Form = Record<"name" | "description" | "price" | "benefits" | "minAge" | "maxAge" | "saleStartsAt" | "saleEndsAt" | "trialDays" | "introDiscountPercent" | "introCycles" | "cancellationTerms" | "sortOrder", string> & {
  cycle: Cycle;
  paymentMethods: BillingType[];
  requiresActiveBank: boolean;
  foundersOnly: boolean;
  cancellationPolicy: CancellationPolicy;
  status: PlanStatus;
};

const from = (p: SubscriptionPlan | null): Form => ({
  name: p?.name ?? "",
  description: p?.description ?? "",
  price: p ? String(p.price).replace(".", ",") : "",
  benefits: p?.benefits.join("\n") ?? "",
  minAge: p?.minAge?.toString() ?? "",
  maxAge: p?.maxAge?.toString() ?? "",
  saleStartsAt: local(p?.saleStartsAt ?? null),
  saleEndsAt: local(p?.saleEndsAt ?? null),
  trialDays: String(p?.trialDays ?? 0),
  introDiscountPercent: String(p?.introDiscountPercent ?? 0),
  introCycles: String(p?.introCycles ?? 0),
  cancellationTerms: p?.cancellationTerms ?? "",
  sortOrder: String(p?.sortOrder ?? 0),
  cycle: p?.cycle ?? "MONTHLY",
  paymentMethods: p?.paymentMethods ?? ["PIX", "CREDIT_CARD"],
  requiresActiveBank: p?.requiresActiveBank ?? false,
  foundersOnly: p?.foundersOnly ?? false,
  cancellationPolicy: p?.cancellationPolicy ?? "end_of_period",
  status: p?.status ?? "draft",
});

/** Plano de assinatura: preço, ciclo, benefícios, elegibilidade, venda, teste grátis, desconto e cancelamento. */
export function AdminPlanForm({ plan, onClose, onSaved }: { plan: SubscriptionPlan | null; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useConfirmToast();
  const [form, setForm] = useState<Form>(() => from(plan));
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setSaving(true);
    try {
      await adminPost("/api/admin/subscriptions", {
        action: "save_plan",
        id: plan?.id,
        data: {
          name: form.name,
          description: form.description,
          price: num(form.price),
          cycle: form.cycle,
          benefits: form.benefits.split("\n").map((b) => b.trim()).filter(Boolean),
          paymentMethods: form.paymentMethods,
          minAge: num(form.minAge),
          maxAge: num(form.maxAge),
          requiresActiveBank: form.requiresActiveBank,
          foundersOnly: form.foundersOnly,
          saleStartsAt: toIso(form.saleStartsAt),
          saleEndsAt: toIso(form.saleEndsAt),
          trialDays: num(form.trialDays) ?? 0,
          introDiscountPercent: num(form.introDiscountPercent) ?? 0,
          introCycles: num(form.introCycles) ?? 0,
          cancellationPolicy: form.cancellationPolicy,
          cancellationTerms: form.cancellationTerms,
          status: form.status,
          sortOrder: num(form.sortOrder) ?? 0,
        },
      });
      showToast("success", plan ? "Plano atualizado. O preço novo vale para novas assinaturas." : "Plano criado.");
      onSaved();
    } catch (err) {
      showToast("error", errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={plan ? "Editar plano" : "Novo plano"}
      description="A cobrança é feita pelo Asaas. O plano só fica ativo para a pessoa depois do pagamento confirmado."
      size="lg"
      footer={
        <Button block disabled={saving} onClick={() => void save()}>
          {saving ? "Salvando…" : "Salvar plano"}
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" className="sm:col-span-2">{(id) => <Input id={id} value={form.name} onChange={(e) => set("name", e.target.value)} />}</Field>
        <Field label="Descrição" className="sm:col-span-2">{(id) => <Textarea id={id} rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} />}</Field>
        <Field label="Preço (R$)" hint="Mínimo R$ 5,00 (regra do Asaas).">{(id, hint) => <Input id={id} aria-describedby={hint} inputMode="decimal" value={form.price} onChange={(e) => set("price", e.target.value)} />}</Field>
        <Field label="Cobrança">
          {(id) => (
            <Select id={id} value={form.cycle} onChange={(e) => set("cycle", e.target.value as Cycle)}>
              {CYCLES.map((c) => (
                <option key={c} value={c}>
                  {CYCLE_LABEL[c]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Benefícios (um por linha)" className="sm:col-span-2">{(id) => <Textarea id={id} rows={4} value={form.benefits} onChange={(e) => set("benefits", e.target.value)} />}</Field>
        <fieldset className="sm:col-span-2">
          <legend className="text-[13px] font-medium text-ink">Formas de pagamento</legend>
          <div className="flex flex-wrap gap-x-6">
            {BILLING_TYPES.map((b) => (
              <Checkbox key={b} label={BILLING_TYPE_LABEL[b]} checked={form.paymentMethods.includes(b)} onChange={(on) => set("paymentMethods", on ? [...form.paymentMethods, b] : form.paymentMethods.filter((x) => x !== b))} />
            ))}
          </div>
          <p className="text-[12px] text-muted-foreground">Cartão de débito não aparece: o Asaas não permite pedir débito pela API.</p>
        </fieldset>
        <Field label="Idade mínima (opcional)">{(id) => <Input id={id} type="number" min={12} value={form.minAge} onChange={(e) => set("minAge", e.target.value)} />}</Field>
        <Field label="Idade máxima (opcional)">{(id) => <Input id={id} type="number" min={12} value={form.maxAge} onChange={(e) => set("maxAge", e.target.value)} />}</Field>
        <Checkbox label="Só para quem tem a conta PRX BANK ativa" checked={form.requiresActiveBank} onChange={(v) => set("requiresActiveBank", v)} />
        <Checkbox label="Só para Founders da PRX" checked={form.foundersOnly} onChange={(v) => set("foundersOnly", v)} />
        <Field label="À venda a partir de (opcional)">{(id) => <Input id={id} type="datetime-local" value={form.saleStartsAt} onChange={(e) => set("saleStartsAt", e.target.value)} />}</Field>
        <Field label="À venda até (opcional)">{(id) => <Input id={id} type="datetime-local" value={form.saleEndsAt} onChange={(e) => set("saleEndsAt", e.target.value)} />}</Field>
        <Field label="Teste grátis (dias)">{(id) => <Input id={id} type="number" min={0} max={90} value={form.trialDays} onChange={(e) => set("trialDays", e.target.value)} />}</Field>
        <Field label="Ordem na vitrine">{(id) => <Input id={id} type="number" min={0} value={form.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} />}</Field>
        <Field label="Desconto de entrada (%)">{(id) => <Input id={id} type="number" min={0} max={90} value={form.introDiscountPercent} onChange={(e) => set("introDiscountPercent", e.target.value)} />}</Field>
        <Field label="Cobranças com desconto">{(id) => <Input id={id} type="number" min={0} max={24} value={form.introCycles} onChange={(e) => set("introCycles", e.target.value)} />}</Field>
        <Field label="Cancelamento" className="sm:col-span-2">
          {(id) => (
            <Select id={id} value={form.cancellationPolicy} onChange={(e) => set("cancellationPolicy", e.target.value as CancellationPolicy)}>
              {CANCELLATION_POLICIES.map((c) => (
                <option key={c} value={c}>
                  {CANCELLATION_LABEL[c]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Condições de cancelamento (o membro vê antes de assinar)" className="sm:col-span-2">
          {(id) => <Textarea id={id} rows={3} value={form.cancellationTerms} onChange={(e) => set("cancellationTerms", e.target.value)} />}
        </Field>
        <Field label="Situação">
          {(id) => (
            <Select id={id} value={form.status} onChange={(e) => set("status", e.target.value as PlanStatus)}>
              {PLAN_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PLAN_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
    </Sheet>
  );
}
