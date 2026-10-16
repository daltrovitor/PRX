// Hello World
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, EmptyState, Notice, Segmented, Tag } from "@/components/app/ui";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { AdminBehaviorForm } from "@/components/admin/admin-behavior-form";
import { AdminBehaviorResults } from "@/components/admin/admin-behavior-results";
import { adminGet, adminPost, errorText } from "@/components/admin/admin-api";
import { CHANNEL_LABEL, POLARITY_LABEL, type BehaviorCompany, type BehaviorRule } from "@/lib/behaviors/types";

interface Data {
  rules: BehaviorRule[];
  categories: string[];
  reviewCount: number;
  bankOnline: boolean;
}

const describe = (r: BehaviorRule) =>
  `${r.comparator === "none" ? "Nenhum pagamento" : `Pelo menos ${r.threshold} pagamento(s)`}${r.minAmount > 0 ? ` de ${r.minAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} ou mais` : ""} em ${r.observationDays} dia(s) · ${r.channels.map((c) => CHANNEL_LABEL[c]).join(", ")} · ${r.companyIds.length} empresa(s)${r.categories.length ? ` + ${r.categories.join(", ")}` : ""}`;

/**
 * Comportamentos financeiros verificáveis (substitui o "bom comportamento"
 * por relato). Cada regra é configurada aqui; o motor confere com os
 * pagamentos da conta PRX BANK, todo dia e quando o admin pede.
 */
export function AdminBehaviorsTab() {
  const { confirmDelete, showToast } = useConfirmToast();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"rules" | "review">("rules");
  const [editing, setEditing] = useState<{ rule: BehaviorRule | null; linked: BehaviorCompany[] } | null>(null);
  const [results, setResults] = useState<BehaviorRule | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await adminGet<Data>("/api/admin/behaviors"));
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (alive) await load();
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  async function edit(rule: BehaviorRule | null) {
    if (!rule) return setEditing({ rule: null, linked: [] });
    try {
      // Empresas ligadas, com os nomes, para o formulário.
      const linked = rule.companyIds.length ? (await adminGet<{ items: BehaviorCompany[] }>(`/api/admin/behaviors/companies?ids=${rule.companyIds.slice(0, 500).join(",")}`)).items : [];
      setEditing({ rule, linked });
    } catch (err) {
      showToast("error", errorText(err));
    }
  }

  async function act(rule: BehaviorRule, action: "evaluate" | "delete_rule") {
    if (action === "delete_rule" && !(await confirmDelete({ title: "Excluir comportamento", message: `Excluir "${rule.name}"? Os resultados dele saem juntos.`, confirmText: "Excluir", type: "danger" }))) return;
    setBusy(rule.id);
    try {
      const res = await adminPost<{ result?: { evaluated: number; identified: number; review: number; unverifiable: number; skipped: string | null } }>("/api/admin/behaviors", { action, id: rule.id });
      if (res.result?.skipped) showToast("info", res.result.skipped);
      else if (res.result) showToast("success", `${res.result.evaluated} avaliada(s): ${res.result.identified} identificado(s), ${res.result.review} para revisar, ${res.result.unverifiable} não verificável(is).`);
      else showToast("success", "Comportamento excluído.");
      await load();
    } catch (err) {
      showToast("error", errorText(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="behaviors-title" className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 id="behaviors-title" className="text-lg font-semibold tracking-[-0.02em] text-ink sm:text-xl">
            Comportamentos financeiros
          </h2>
          <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
            Regras conferidas com os pagamentos feitos pela conta PRX BANK (Pix e boletos). Cartão ainda não entra: a PRX não recebe essas compras. Sem dado suficiente, o resultado é
            &quot;não verificável&quot;.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Visão dos comportamentos"
            value={view}
            onChange={setView}
            options={[
              { value: "rules", label: "Regras" },
              { value: "review", label: "Revisão", count: data?.reviewCount },
            ]}
          />
          <Button onClick={() => void edit(null)}>Novo comportamento</Button>
        </div>
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      {data && !data.bankOnline && <Notice tone="warning">Banco parceiro desligado neste ambiente: as regras ficam salvas, mas não há pagamentos para avaliar.</Notice>}

      {view === "review" ? (
        <AdminBehaviorResults ruleId={null} ruleName="revisão" onlyReview />
      ) : data === null ? (
        <div role="status" aria-label="Carregando" className="h-32 rounded-3xl bg-surface" />
      ) : data.rules.length === 0 ? (
        <EmptyState title="Nenhum comportamento" body="Cadastre empresas na aba Empresas e crie a primeira regra." />
      ) : (
        <ul className="space-y-3">
          {data.rules.map((r) => (
            <li key={r.id} className="glass-soft space-y-3 rounded-3xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[16px] font-semibold text-ink">{r.name}</p>
                  <p className="text-[13px] text-muted-foreground">{describe(r)}</p>
                </div>
                <span className="flex flex-wrap gap-1.5">
                  <Tag tone={r.polarity === "positive" ? "success" : "warning"}>{POLARITY_LABEL[r.polarity]}</Tag>
                  <Tag tone={r.status === "active" ? "accent" : "neutral"}>{r.status === "active" ? "Ativa" : "Inativa"}</Tag>
                  {(r.coins > 0 || r.xp > 0) && <Tag>{`${r.coins} coins · ${r.xp} XP`}</Tag>}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => void edit(r)}>
                  Editar
                </Button>
                <Button size="sm" variant="secondary" disabled={busy !== null || r.status !== "active"} onClick={() => void act(r, "evaluate")}>
                  {busy === r.id ? "Avaliando…" : "Avaliar agora"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setResults(results?.id === r.id ? null : r)}>
                  {results?.id === r.id ? "Fechar resultados" : "Ver resultados"}
                </Button>
                <Button size="sm" variant="danger" disabled={busy !== null} onClick={() => void act(r, "delete_rule")}>
                  Excluir
                </Button>
              </div>
              {results?.id === r.id && <AdminBehaviorResults ruleId={r.id} ruleName={r.name} onlyReview={false} />}
            </li>
          ))}
        </ul>
      )}

      {editing && data && (
        <AdminBehaviorForm
          key={editing.rule?.id ?? "new"}
          rule={editing.rule}
          linked={editing.linked}
          categories={data.categories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </section>
  );
}
