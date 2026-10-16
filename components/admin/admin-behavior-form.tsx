// Hello World
"use client";

import { useEffect, useState } from "react";
import { Button, Checkbox, Field, Input, Select, Sheet, Tag, Textarea } from "@/components/app/ui";
import { useDebounced } from "@/components/admin/pager";
import { adminGet, adminPost, errorText, formatCnpj } from "@/components/admin/admin-api";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { BEHAVIOR_CHANNELS, CHANNEL_LABEL, COMPARATOR_LABEL, type BehaviorCompany, type BehaviorRule, type Comparator, type Polarity } from "@/lib/behaviors/types";

interface Form {
  name: string;
  description: string;
  polarity: Polarity;
  comparator: Comparator;
  threshold: string;
  minAmount: string;
  channels: string[];
  categories: string[];
  companies: Array<Pick<BehaviorCompany, "id" | "legalName" | "tradeName" | "cnpj">>;
  observationDays: string;
  startsAt: string;
  endsAt: string;
  coins: string;
  xp: string;
  active: boolean;
}

const local = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : "");
const toIso = (value: string) => (value ? new Date(value).toISOString() : null);

function initial(rule: BehaviorRule | null, companies: BehaviorCompany[]): Form {
  if (!rule) return { name: "", description: "", polarity: "positive", comparator: "none", threshold: "1", minAmount: "0", channels: [...BEHAVIOR_CHANNELS], categories: [], companies: [], observationDays: "30", startsAt: "", endsAt: "", coins: "0", xp: "0", active: false };
  return {
    name: rule.name,
    description: rule.description,
    polarity: rule.polarity,
    comparator: rule.comparator,
    threshold: String(rule.threshold),
    minAmount: String(rule.minAmount),
    channels: rule.channels,
    categories: rule.categories,
    companies,
    observationDays: String(rule.observationDays),
    startsAt: local(rule.startsAt),
    endsAt: local(rule.endsAt),
    coins: String(rule.coins),
    xp: String(rule.xp),
    active: rule.status === "active",
  };
}

/** Formulário da regra: o que conta como o comportamento, em que período, com quais empresas ou categorias. */
export function AdminBehaviorForm({ rule, linked, categories, onClose, onSaved }: { rule: BehaviorRule | null; linked: BehaviorCompany[]; categories: string[]; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useConfirmToast();
  const [form, setForm] = useState<Form>(() => initial(rule, linked));
  const [query, setQuery] = useState("");
  const q = useDebounced(query);
  const [found, setFound] = useState<BehaviorCompany[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (q.trim().length < 2) return alive && setFound([]);
      const res = await adminGet<{ items: BehaviorCompany[] }>(`/api/admin/behaviors/companies?q=${encodeURIComponent(q)}&pageSize=10`).catch(() => ({ items: [] }));
      if (alive) setFound(res.items);
    })();
    return () => {
      alive = false;
    };
  }, [q]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  async function save() {
    setSaving(true);
    try {
      await adminPost("/api/admin/behaviors", {
        action: "save_rule",
        id: rule?.id,
        data: {
          name: form.name,
          description: form.description,
          polarity: form.polarity,
          comparator: form.comparator,
          threshold: Number(form.threshold),
          minAmount: Number(form.minAmount.replace(",", ".")),
          channels: form.channels,
          categories: form.categories,
          companyIds: form.companies.map((c) => c.id),
          observationDays: Number(form.observationDays),
          startsAt: toIso(form.startsAt),
          endsAt: toIso(form.endsAt),
          coins: form.polarity === "positive" ? Number(form.coins) : 0,
          xp: form.polarity === "positive" ? Number(form.xp) : 0,
          status: form.active ? "active" : "inactive",
        },
      });
      showToast("success", rule ? "Regra atualizada." : "Regra criada.");
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
      title={rule ? "Editar comportamento" : "Novo comportamento"}
      description="Só pagamentos da conta PRX BANK contam. Sem conta ativa, o resultado é 'não verificável'."
      size="lg"
      footer={
        <Button block disabled={saving} onClick={() => void save()}>
          {saving ? "Salvando…" : "Salvar comportamento"}
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" className="sm:col-span-2">{(id) => <Input id={id} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex.: 30 dias sem apostas" />}</Field>
        <Field label="Descrição (o membro vê)" className="sm:col-span-2">{(id) => <Textarea id={id} rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} />}</Field>
        <Field label="Tipo">
          {(id) => (
            <Select id={id} value={form.polarity} onChange={(e) => set("polarity", e.target.value as Polarity)}>
              <option value="positive">Positivo (a incentivar)</option>
              <option value="negative">Negativo (a evitar)</option>
            </Select>
          )}
        </Field>
        <Field label="Critério">
          {(id) => (
            <Select id={id} value={form.comparator} onChange={(e) => set("comparator", e.target.value as Comparator)}>
              <option value="none">{COMPARATOR_LABEL.none}</option>
              <option value="at_least">{COMPARATOR_LABEL.at_least}</option>
            </Select>
          )}
        </Field>
        {form.comparator === "at_least" && <Field label="Quantas vezes (N)">{(id) => <Input id={id} type="number" min={1} value={form.threshold} onChange={(e) => set("threshold", e.target.value)} />}</Field>}
        <Field label="Valor mínimo por pagamento (R$)">{(id) => <Input id={id} inputMode="decimal" value={form.minAmount} onChange={(e) => set("minAmount", e.target.value)} />}</Field>
        <Field label="Período observado (dias)">{(id) => <Input id={id} type="number" min={1} max={366} value={form.observationDays} onChange={(e) => set("observationDays", e.target.value)} />}</Field>
        <Field label="Começa em (opcional)">{(id) => <Input id={id} type="datetime-local" value={form.startsAt} onChange={(e) => set("startsAt", e.target.value)} />}</Field>
        <Field label="Termina em (opcional)">{(id) => <Input id={id} type="datetime-local" value={form.endsAt} onChange={(e) => set("endsAt", e.target.value)} />}</Field>

        <fieldset className="sm:col-span-2">
          <legend className="text-[13px] font-medium text-ink">Canais</legend>
          <div className="flex flex-wrap gap-x-6">
            {BEHAVIOR_CHANNELS.map((c) => (
              <Checkbox key={c} label={CHANNEL_LABEL[c]} checked={form.channels.includes(c)} onChange={() => set("channels", toggle(form.channels, c))} />
            ))}
          </div>
        </fieldset>

        {categories.length > 0 && (
          <fieldset className="sm:col-span-2">
            <legend className="text-[13px] font-medium text-ink">Categorias inteiras (todas as empresas da categoria)</legend>
            <div className="flex flex-wrap gap-x-6">
              {categories.map((c) => (
                <Checkbox key={c} label={c} checked={form.categories.includes(c)} onChange={() => set("categories", toggle(form.categories, c))} />
              ))}
            </div>
          </fieldset>
        )}

        <div className="space-y-2 sm:col-span-2">
          <Field label="Empresas específicas" hint="Busque pelo nome ou CNPJ e toque para ligar.">
            {(id, hint) => <Input id={id} aria-describedby={hint} type="search" value={query} onChange={(e) => setQuery(e.target.value)} />}
          </Field>
          {found.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {found
                .filter((c) => !form.companies.some((s) => s.id === c.id))
                .map((c) => (
                  <li key={c.id}>
                    <Button variant="secondary" size="sm" onClick={() => set("companies", [...form.companies, c])}>
                      + {c.tradeName || c.legalName}
                    </Button>
                  </li>
                ))}
            </ul>
          )}
          {form.companies.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="Empresas ligadas">
              {form.companies.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => set("companies", form.companies.filter((s) => s.id !== c.id))}
                    className="glass-chip min-h-12 cursor-pointer rounded-full px-4 text-[13px] text-ink"
                    aria-label={`Desligar ${c.tradeName || c.legalName}`}
                  >
                    {c.tradeName || c.legalName} · {formatCnpj(c.cnpj)} ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {form.polarity === "positive" ? (
          <>
            <Field label="Coins ao identificar" hint="Opcional. Credita uma vez por período avaliado.">{(id, hint) => <Input id={id} aria-describedby={hint} type="number" min={0} value={form.coins} onChange={(e) => set("coins", e.target.value)} />}</Field>
            <Field label="XP ao identificar">{(id) => <Input id={id} type="number" min={0} value={form.xp} onChange={(e) => set("xp", e.target.value)} />}</Field>
          </>
        ) : (
          <p className="text-[13px] text-muted-foreground sm:col-span-2">
            <Tag tone="warning">Negativo</Tag> Comportamento negativo só é classificado (não tira coins): use os resultados para acompanhar e revisar.
          </p>
        )}
        <Checkbox label="Regra ativa (entra na avaliação diária e aparece para os membros)" checked={form.active} onChange={(v) => set("active", v)} className="sm:col-span-2" />
      </div>
    </Sheet>
  );
}
