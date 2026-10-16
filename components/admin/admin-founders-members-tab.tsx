// Hello World
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Checkbox, EmptyState, Field, Input, Notice, Select, Sheet, Tag, Textarea } from "@/components/app/ui";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { Pager, formatDateTimeBr, useDebounced } from "@/components/admin/pager";
import { AdminMemberSearch } from "@/components/admin/admin-member-search";
import { AdminBrandAssetCard } from "@/components/admin/admin-brand-asset-card";
import { adminGet, adminPost, errorText } from "@/components/admin/admin-api";
import { founderIsCurrent, type FounderMember } from "@/lib/founders/member-types";

type Row = FounderMember & { email: string; accountName: string };
type Form = { userId: string; account: string; displayName: string; headline: string; bio: string; benefits: string; eligibility: string; status: "active" | "inactive"; showPublicly: boolean; startsAt: string; endsAt: string };

const local = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : "");
const EMPTY: Form = { userId: "", account: "", displayName: "", headline: "", bio: "", benefits: "", eligibility: "", status: "active", showPublicly: true, startsAt: "", endsAt: "" };

/**
 * Founders da PRX: quem tem o status, ligado à conta real, com nome de
 * exibição, benefícios, elegibilidade e vigência. Junto, a imagem oficial do
 * PRX Founders (pendente até o material chegar).
 */
export function AdminFoundersMembersTab() {
  const { confirmDelete, showToast } = useConfirmToast();
  const [query, setQuery] = useState("");
  const q = useDebounced(query);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: Row[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; form: Form } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await adminGet(`/api/admin/founders/members?q=${encodeURIComponent(q)}&page=${page}&pageSize=25`));
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, [q, page]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (alive) await load();
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  const edit = (f: Row) =>
    setEditing({
      id: f.id,
      form: { userId: f.userId, account: `${f.accountName} · ${f.email}`, displayName: f.displayName, headline: f.headline, bio: f.bio, benefits: f.benefits.join("\n"), eligibility: f.eligibility, status: f.status, showPublicly: f.showPublicly, startsAt: local(f.startsAt), endsAt: local(f.endsAt) },
    });

  async function save() {
    if (!editing) return;
    const f = editing.form;
    setSaving(true);
    try {
      await adminPost("/api/admin/founders/members", {
        action: "save",
        id: editing.id ?? undefined,
        data: {
          userId: f.userId,
          displayName: f.displayName,
          headline: f.headline,
          bio: f.bio,
          benefits: f.benefits.split("\n").map((b) => b.trim()).filter(Boolean),
          eligibility: f.eligibility,
          status: f.status,
          showPublicly: f.showPublicly,
          startsAt: f.startsAt ? new Date(f.startsAt).toISOString() : null,
          endsAt: f.endsAt ? new Date(f.endsAt).toISOString() : null,
        },
      });
      showToast("success", editing.id ? "Founder atualizado." : "Founder criado.");
      setEditing(null);
      await load();
    } catch (err) {
      showToast("error", errorText(err));
    } finally {
      setSaving(false);
    }
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setEditing((e) => (e ? { ...e, form: { ...e.form, [k]: v } } : e));

  return (
    <section aria-labelledby="founders-members-title" className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 id="founders-members-title" className="text-lg font-semibold tracking-[-0.02em] text-ink sm:text-xl">
            Founders da PRX {data ? <span className="text-muted-foreground">· {data.total}</span> : null}
          </h2>
          <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">Cada Founder é ligado à conta real da pessoa. Ativos e na vigência aparecem na aba Founders do app (só nome e chamada, se você permitir).</p>
        </div>
        <Button onClick={() => setEditing({ id: null, form: EMPTY })}>Novo Founder</Button>
      </div>

      <AdminBrandAssetCard />

      {error && <Notice tone="error">{error}</Notice>}
      <Input type="search" value={query} onChange={(e) => (setQuery(e.target.value), setPage(1))} placeholder="Buscar Founder pelo nome" aria-label="Buscar Founder pelo nome" className="max-w-sm" />

      {data === null ? (
        <div role="status" aria-label="Carregando" className="h-32 rounded-3xl bg-surface" />
      ) : data.items.length === 0 ? (
        <EmptyState title="Nenhum Founder" body="Crie o primeiro: busque a conta da pessoa e defina o que ela recebe." />
      ) : (
        <ul className="space-y-2">
          {data.items.map((f) => (
            <li key={f.id} className="glass-soft flex flex-col gap-3 rounded-2xl px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-medium text-ink">
                  {f.displayName} {f.headline && <span className="text-muted-foreground">· {f.headline}</span>}
                </p>
                <p className="truncate text-[13px] text-muted-foreground">
                  Conta: {f.accountName} · {f.email} · {f.benefits.length} benefício(s){f.endsAt ? ` · até ${formatDateTimeBr(f.endsAt)}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Tag tone={founderIsCurrent(f) ? "success" : "neutral"}>{founderIsCurrent(f) ? "Ativo" : f.status === "active" ? "Fora da vigência" : "Inativo"}</Tag>
                <Button size="sm" variant="secondary" onClick={() => edit(f)}>
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={async () => {
                    if (!(await confirmDelete({ title: "Excluir Founder", message: `Excluir o cadastro de ${f.displayName}? Para pausar, prefira marcar como inativo.`, confirmText: "Excluir", type: "danger" }))) return;
                    try {
                      await adminPost("/api/admin/founders/members", { action: "delete", id: f.id });
                      showToast("success", "Founder excluído.");
                      await load();
                    } catch (err) {
                      showToast("error", errorText(err));
                    }
                  }}
                >
                  Excluir
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {data && data.total > 25 && <Pager page={page} pageSize={25} total={data.total} onPage={setPage} />}

      {editing && (
        <Sheet
          open
          onClose={() => setEditing(null)}
          title={editing.id ? "Editar Founder" : "Novo Founder"}
          size="lg"
          footer={
            <Button block disabled={saving || !editing.form.userId} onClick={() => void save()}>
              {saving ? "Salvando…" : "Salvar Founder"}
            </Button>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <p className="text-[13px] font-medium text-ink">Conta</p>
              {editing.form.userId ? (
                <p className="text-[14px] text-ink">
                  {editing.form.account}{" "}
                  {!editing.id && (
                    <Button variant="ghost" size="sm" onClick={() => (set("userId", ""), set("account", ""))}>
                      Trocar
                    </Button>
                  )}
                </p>
              ) : (
                <AdminMemberSearch label="Buscar a conta do Founder" onPick={(m) => setEditing((e) => (e ? { ...e, form: { ...e.form, userId: m.id, account: `${m.name} · ${m.email}`, displayName: e.form.displayName || m.name } } : e))} />
              )}
            </div>
            <Field label="Nome de exibição">{(id) => <Input id={id} value={editing.form.displayName} onChange={(e) => set("displayName", e.target.value)} />}</Field>
            <Field label="Chamada (opcional)" hint="Ex.: Founder da turma 2026">{(id, hint) => <Input id={id} aria-describedby={hint} value={editing.form.headline} onChange={(e) => set("headline", e.target.value)} />}</Field>
            <Field label="Apresentação (opcional)" className="sm:col-span-2">{(id) => <Textarea id={id} rows={3} value={editing.form.bio} onChange={(e) => set("bio", e.target.value)} />}</Field>
            <Field label="Benefícios (um por linha; a pessoa vê)" className="sm:col-span-2">{(id) => <Textarea id={id} rows={4} value={editing.form.benefits} onChange={(e) => set("benefits", e.target.value)} />}</Field>
            <Field label="Elegibilidade (critério que justificou o status)" className="sm:col-span-2">{(id) => <Textarea id={id} rows={2} value={editing.form.eligibility} onChange={(e) => set("eligibility", e.target.value)} />}</Field>
            <Field label="Vale a partir de (opcional)">{(id) => <Input id={id} type="datetime-local" value={editing.form.startsAt} onChange={(e) => set("startsAt", e.target.value)} />}</Field>
            <Field label="Vale até (opcional)">{(id) => <Input id={id} type="datetime-local" value={editing.form.endsAt} onChange={(e) => set("endsAt", e.target.value)} />}</Field>
            <Field label="Situação">
              {(id) => (
                <Select id={id} value={editing.form.status} onChange={(e) => set("status", e.target.value as Form["status"])}>
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                </Select>
              )}
            </Field>
            <Checkbox label="Aparece na lista de Founders do app" checked={editing.form.showPublicly} onChange={(v) => set("showPublicly", v)} />
          </div>
        </Sheet>
      )}
    </section>
  );
}
