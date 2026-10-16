// Hello World
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Checkbox, EmptyState, Field, Input, Notice, Select, Sheet, Tag, Textarea } from "@/components/app/ui";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { Pager, formatDateTimeBr, useDebounced } from "@/components/admin/pager";
import { AdminCompaniesImport } from "@/components/admin/admin-companies-import";
import { adminGet, adminPost, errorText, formatCnpj } from "@/components/admin/admin-api";
import type { BehaviorCompany, ImportRun } from "@/lib/behaviors/types";

type Form = { cnpj: string; legalName: string; tradeName: string; category: string; identifiers: string; notes: string; active: boolean };
const EMPTY: Form = { cnpj: "", legalName: "", tradeName: "", category: "", identifiers: "", notes: "", active: true };

/**
 * Empresas para os comportamentos verificáveis: CNPJ, razão social, nome
 * fantasia, categoria e outros identificadores (chaves Pix, nomes). Cadastro
 * manual, importação em lote (CSV/XLSX ou lista colada) e o histórico das
 * importações com os erros de cada uma.
 */
export function AdminCompaniesTab() {
  const { confirmDelete, showToast } = useConfirmToast();
  const [query, setQuery] = useState("");
  const q = useDebounced(query);
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: BehaviorCompany[]; total: number } | null>(null);
  const [meta, setMeta] = useState<{ categories: string[]; runs: ImportRun[] }>({ categories: [], runs: [] });
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<BehaviorCompany | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const loadedMeta = useRef(false);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ q, category, page: String(page), pageSize: "25" });
      const [list, info] = await Promise.all([
        adminGet<{ items: BehaviorCompany[]; total: number }>(`/api/admin/behaviors/companies?${params}`),
        loadedMeta.current ? Promise.resolve(null) : adminGet<{ categories: string[]; runs: ImportRun[] }>("/api/admin/behaviors"),
      ]);
      setData({ items: list.items, total: list.total });
      if (info) setMeta({ categories: info.categories, runs: info.runs });
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, [q, category, page]);

  const reloadAll = useCallback(async () => {
    loadedMeta.current = false;
    await load();
    loadedMeta.current = true;
  }, [load]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!alive) return;
      await load();
      loadedMeta.current = true;
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  function openForm(company: BehaviorCompany | null) {
    setEditing(company);
    setForm(
      company
        ? { cnpj: formatCnpj(company.cnpj), legalName: company.legalName, tradeName: company.tradeName, category: company.category, identifiers: company.identifiers.join("\n"), notes: company.notes, active: company.active }
        : EMPTY
    );
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      const data = { ...form, identifiers: form.identifiers.split(/\n|\|/).map((s) => s.trim()).filter(Boolean) };
      await adminPost("/api/admin/behaviors/companies", { action: "save", id: editing?.id, data });
      showToast("success", editing ? "Empresa atualizada." : "Empresa cadastrada.");
      setForm(null);
      await reloadAll();
    } catch (err) {
      showToast("error", errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(company: BehaviorCompany) {
    if (!(await confirmDelete({ title: "Excluir empresa", message: `Excluir ${company.legalName}? Ela sai de todas as regras ligadas a ela.`, confirmText: "Excluir", type: "danger" }))) return;
    try {
      await adminPost("/api/admin/behaviors/companies", { action: "delete", id: company.id });
      showToast("success", "Empresa excluída.");
      await reloadAll();
    } catch (err) {
      showToast("error", errorText(err));
    }
  }

  return (
    <section aria-labelledby="companies-title" className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 id="companies-title" className="text-lg font-semibold tracking-[-0.02em] text-ink sm:text-xl">
            Empresas {data ? <span className="text-muted-foreground">· {data.total.toLocaleString("pt-BR")}</span> : null}
          </h2>
          <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
            Base dos comportamentos: um pagamento só conta quando o CNPJ do recebedor ou uma chave Pix cadastrada aqui bate. Nome parecido vai para a sua revisão.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AdminCompaniesImport onImported={reloadAll} />
          <Button onClick={() => openForm(null)}>Nova empresa</Button>
        </div>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Input type="search" value={query} onChange={(e) => (setQuery(e.target.value), setPage(1))} placeholder="Buscar por nome ou CNPJ" aria-label="Buscar empresa por nome ou CNPJ" className="sm:max-w-sm" />
        <Select value={category} onChange={(e) => (setCategory(e.target.value), setPage(1))} aria-label="Filtrar por categoria" className="sm:max-w-xs">
          <option value="">Todas as categorias</option>
          {meta.categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </div>

      {data === null ? (
        <div role="status" aria-label="Carregando" className="h-32 rounded-3xl bg-surface" />
      ) : data.items.length === 0 ? (
        <EmptyState title="Nenhuma empresa" body="Cadastre uma empresa ou importe uma planilha (CSV ou XLSX)." />
      ) : (
        <ul className="space-y-2">
          {data.items.map((c) => (
            <li key={c.id} className="glass-soft flex flex-col gap-3 rounded-2xl px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-medium text-ink">
                  {c.tradeName || c.legalName} {!c.active && <Tag>Inativa</Tag>}
                </p>
                <p className="truncate text-[13px] text-muted-foreground">
                  {c.legalName} · CNPJ {formatCnpj(c.cnpj)}
                  {c.category ? ` · ${c.category}` : ""}
                  {c.identifiers.length > 0 ? ` · ${c.identifiers.length} identificador(es)` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => openForm(c)}>
                  Editar
                </Button>
                <Button variant="danger" size="sm" onClick={() => void remove(c)}>
                  Excluir
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {data && data.total > 25 && <Pager page={page} pageSize={25} total={data.total} onPage={setPage} />}

      {meta.runs.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-[15px] font-semibold text-ink">Últimas importações</h3>
          <ul className="space-y-2">
            {meta.runs.map((r) => (
              <li key={r.id} className="rounded-2xl bg-surface px-4 py-3 text-[13px] text-ink">
                <p>
                  <span className="font-medium">{r.fileName || "Lista colada"}</span> · {formatDateTimeBr(r.createdAt)} · {r.actor}
                </p>
                <p className="text-muted-foreground">
                  {r.total} linha(s): {r.created} nova(s), {r.updated} atualizada(s), {r.unchanged} igual(is), {r.duplicates} duplicada(s), {r.errors.length} com erro
                </p>
                {r.errors.length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-primary">Ver erros</summary>
                    <ul className="mt-1 space-y-0.5 text-muted-foreground">
                      {r.errors.slice(0, 100).map((e, i) => (
                        <li key={i}>
                          Linha {e.row}: {e.message}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Sheet
        open={form !== null}
        onClose={() => setForm(null)}
        title={editing ? "Editar empresa" : "Nova empresa"}
        description="O CNPJ é conferido pelos dígitos verificadores."
        footer={
          <Button block disabled={saving} onClick={() => void save()}>
            {saving ? "Salvando…" : "Salvar empresa"}
          </Button>
        }
      >
        {form && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="CNPJ">{(id, hint) => <Input id={id} aria-describedby={hint} value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} inputMode="numeric" />}</Field>
            <Field label="Categoria" hint="Ex.: apostas, mercado, academia">
              {(id, hint) => <Input id={id} aria-describedby={hint} list="behavior-categories" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />}
            </Field>
            <Field label="Razão social" className="sm:col-span-2">{(id) => <Input id={id} value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} />}</Field>
            <Field label="Nome fantasia" className="sm:col-span-2">{(id) => <Input id={id} value={form.tradeName} onChange={(e) => setForm({ ...form, tradeName: e.target.value })} />}</Field>
            <Field label="Outros identificadores" hint="Um por linha: chaves Pix (e-mail, telefone, aleatória) e nomes alternativos." className="sm:col-span-2">
              {(id, hint) => <Textarea id={id} aria-describedby={hint} rows={3} value={form.identifiers} onChange={(e) => setForm({ ...form, identifiers: e.target.value })} />}
            </Field>
            <Field label="Observações" className="sm:col-span-2">{(id) => <Textarea id={id} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />}</Field>
            <Checkbox label="Empresa ativa (conta nas regras)" checked={form.active} onChange={(active) => setForm({ ...form, active })} />
            <datalist id="behavior-categories">
              {meta.categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
        )}
      </Sheet>
    </section>
  );
}
