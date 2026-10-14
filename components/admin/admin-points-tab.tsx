// Hello World
"use client";

import { useState, type FormEvent } from "react";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { Button, Checkbox, EmptyState, Field, Input, Notice, Select, Sheet, Tag, Textarea } from "@/components/app/ui";
import { IconPlus } from "@/components/icons/prx-icons";
import {
  POINT_RULE_CATEGORIES,
  POINT_RULE_CATEGORY_LABEL,
  POINT_RULE_PERIODS,
  POINT_RULE_PERIOD_LABEL,
  POINT_RULE_TRIGGERS,
  POINT_RULE_TRIGGER_LABEL,
  type PointRule,
  type PointRuleCategory,
  type PointRulePeriod,
  type PointRuleTrigger,
} from "@/lib/points/types";
import { behaviorCoinsPerMonth, coinsPerRealFromRules } from "@/lib/points/economics";
import { AdminClaimsQueue } from "@/components/admin/admin-claims-queue";

interface RuleForm {
  title: string;
  description: string;
  trigger: PointRuleTrigger;
  coins: string;
  xp: string;
  periodicity: PointRulePeriod;
  category: PointRuleCategory;
  active: boolean;
  sortOrder: string;
}

const EMPTY: RuleForm = { title: "", description: "", trigger: "checkin", coins: "10", xp: "50", periodicity: "weekly", category: "geral", active: true, sortOrder: "0" };

/**
 * Regras de pontos por bom comportamento: o que gera PRX Coins e XP, quanto,
 * com que frequência e se está valendo. O preço em coins de cada benefício
 * fica na aba Benefícios, junto da calculadora de viabilidade.
 */
export function AdminPointsTab({ rules, onRefresh }: { rules: PointRule[]; onRefresh: () => Promise<void> }) {
  const { confirmDelete, showToast } = useConfirmToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PointRule | null>(null);
  const [form, setForm] = useState<RuleForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const k = coinsPerRealFromRules(rules);
  const monthly = behaviorCoinsPerMonth(rules);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setError(null);
    setOpen(true);
  }

  function openEdit(rule: PointRule) {
    setEditing(rule);
    setForm(ruleToForm(rule));
    setError(null);
    setOpen(true);
  }

  function setTrigger(trigger: PointRuleTrigger) {
    // Regras automáticas valem a cada evento; check-in precisa de periodicidade.
    setForm((f) => ({ ...f, trigger, periodicity: trigger === "checkin" ? (f.periodicity === "per_event" ? "weekly" : f.periodicity) : "per_event" }));
  }

  async function send(method: "POST" | "PUT", body: Record<string, unknown>) {
    const res = await fetch("/api/admin/points", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
    if (!res.ok || !json.success) throw new Error(json.error || "Não foi possível salvar a regra.");
  }

  function payload(f: RuleForm) {
    return {
      title: f.title,
      description: f.description,
      trigger: f.trigger,
      coins: Number(f.coins) || 0,
      xp: Number(f.xp) || 0,
      periodicity: f.periodicity,
      category: f.category,
      active: f.active,
      sortOrder: Number(f.sortOrder) || 0,
    };
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await send(editing ? "PUT" : "POST", editing ? { id: editing.id, ...payload(form) } : payload(form));
      showToast("success", editing ? "Regra atualizada." : "Regra criada.");
      setOpen(false);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sem internet agora. Confira sua conexão e tente de novo.");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(rule: PointRule) {
    try {
      await send("PUT", { id: rule.id, ...payload({ ...ruleToForm(rule), active: !rule.active }) });
      showToast("success", rule.active ? "Regra desativada." : "Regra ativada.");
      await onRefresh();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Não foi possível alterar a regra.");
    }
  }

  async function remove(rule: PointRule) {
    const ok = await confirmDelete({
      title: "Excluir regra",
      message: `"${rule.title}" deixa de gerar pontos. O extrato de quem já ganhou continua intacto.`,
      confirmText: "Excluir",
      cancelText: "Cancelar",
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/points?id=${encodeURIComponent(rule.id)}`, { method: "DELETE" });
    if (res.ok) {
      showToast("success", "Regra excluída.");
      await onRefresh();
    } else showToast("error", "Não foi possível excluir.");
  }

  return (
    <section aria-labelledby="points-title" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="points-title" className="text-2xl font-semibold tracking-[-0.03em] text-ink">
            Pontos e bom comportamento
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Cada regra define quantos PRX Coins e quanto XP o membro ganha. A regra de compra define a taxa de emissão usada pela calculadora de viabilidade.
          </p>
        </div>
        <Button onClick={openCreate}>
          <IconPlus size={18} />
          Nova regra
        </Button>
      </div>

      <AdminClaimsQueue />

      <dl className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Emissão em compras" value={`${k.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} coin por R$ 1`} />
        <Kpi label="Coins/mês de comportamento (se tudo aprovado)" value={monthly.toLocaleString("pt-BR")} />
        <Kpi label="Regras ativas" value={`${rules.filter((r) => r.active).length} de ${rules.length}`} />
      </dl>

      {rules.length === 0 ? (
        <EmptyState title="Nenhuma regra" body="Crie a primeira regra de bom comportamento." action={<Button onClick={openCreate}>Criar regra</Button>} />
      ) : (
        <div className="glass overflow-x-auto rounded-3xl">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-surface text-[13px] text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">Regra</th>
                <th scope="col" className="px-4 py-3 font-medium">Gatilho</th>
                <th scope="col" className="px-4 py-3 font-medium">Periodicidade</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Coins</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">XP</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rules.map((rule) => (
                <tr key={rule.id} className="transition-colors hover:bg-surface/60">
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{rule.title}</p>
                    <p className="text-[13px] text-muted-foreground">{POINT_RULE_CATEGORY_LABEL[rule.category]}</p>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-ink">{POINT_RULE_TRIGGER_LABEL[rule.trigger]}</td>
                  <td className="px-4 py-3 text-[13px] text-ink">{POINT_RULE_PERIOD_LABEL[rule.periodicity]}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink">{rule.coins.toLocaleString("pt-BR")}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink">{rule.xp.toLocaleString("pt-BR")}</td>
                  <td className="px-4 py-3">{rule.active ? <Tag tone="success">Ativa</Tag> : <Tag>Inativa</Tag>}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" size="sm" onClick={() => openEdit(rule)}>
                        Editar
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void toggle(rule)}>
                        {rule.active ? "Desativar" : "Ativar"}
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => void remove(rule)}>
                        Excluir
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Editar regra" : "Nova regra de pontos"}
        description="Coins e XP são creditados pelo servidor; o app nunca informa quanto o membro ganhou."
        footer={
          <Button block type="submit" form="rule-form" disabled={saving}>
            {saving ? "Salvando…" : editing ? "Salvar regra" : "Criar regra"}
          </Button>
        }
      >
        <form id="rule-form" onSubmit={submit} className="grid gap-5 sm:grid-cols-2">
          <Field label="Título do bom comportamento" className="sm:col-span-2">
            {(id) => <Input id={id} required minLength={3} maxLength={80} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />}
          </Field>
          <Field label="Descrição" className="sm:col-span-2">
            {(id) => <Textarea id={id} rows={2} maxLength={280} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />}
          </Field>
          <Field label="Gatilho">
            {(id) => (
              <Select id={id} value={form.trigger} onChange={(e) => setTrigger(e.target.value as PointRuleTrigger)}>
                {POINT_RULE_TRIGGERS.map((t) => (
                  <option key={t} value={t}>
                    {POINT_RULE_TRIGGER_LABEL[t]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Periodicidade" hint={form.trigger === "checkin" ? "Quantas vezes o membro pode reivindicar." : "Automáticas valem a cada evento."}>
            {(id, describedBy) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                value={form.periodicity}
                disabled={form.trigger !== "checkin"}
                onChange={(e) => setForm({ ...form, periodicity: e.target.value as PointRulePeriod })}
              >
                {POINT_RULE_PERIODS.filter((p) => (form.trigger === "checkin" ? p !== "per_event" : p === "per_event")).map((p) => (
                  <option key={p} value={p}>
                    {POINT_RULE_PERIOD_LABEL[p]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={form.trigger === "partner_purchase" ? "PRX Coins a cada R$ 10" : "PRX Coins concedidos"}>
            {(id) => <Input id={id} type="number" min={0} max={100000} value={form.coins} onChange={(e) => setForm({ ...form, coins: e.target.value })} />}
          </Field>
          <Field label={form.trigger === "partner_purchase" ? "XP a cada R$ 10" : "XP concedido"}>
            {(id) => <Input id={id} type="number" min={0} max={1000000} value={form.xp} onChange={(e) => setForm({ ...form, xp: e.target.value })} />}
          </Field>
          <Field label="Categoria">
            {(id) => (
              <Select id={id} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as PointRuleCategory })}>
                {POINT_RULE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {POINT_RULE_CATEGORY_LABEL[c]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Ordem de exibição">
            {(id) => <Input id={id} type="number" min={0} max={999} value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />}
          </Field>
          <Checkbox className="sm:col-span-2" label="Regra ativa" checked={form.active} onChange={(active) => setForm({ ...form, active })} />
          {form.trigger === "checkin" && (
            <Notice tone="neutral" className="sm:col-span-2">
              Bom comportamento passa pela fila de análise: o membro envia um relato e os pontos só entram quando alguém da equipe aprova. Esses coins não vêm de
              compra com comissão; acompanhe o custo na aba Financeiro.
            </Notice>
          )}
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

function ruleToForm(rule: PointRule): RuleForm {
  return {
    title: rule.title,
    description: rule.description,
    trigger: rule.trigger,
    coins: String(rule.coins),
    xp: String(rule.xp),
    periodicity: rule.periodicity,
    category: rule.category,
    active: rule.active,
    sortOrder: String(rule.sortOrder),
  };
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl glass p-5">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className="mt-2 text-[22px] font-light leading-tight tracking-[-0.02em] text-ink">{value}</dd>
    </div>
  );
}
