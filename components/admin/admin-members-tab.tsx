// Hello World
"use client";

import { calculatePrxLevel, levelGateOptions, xpForLevel } from "@/lib/pass-data";
import { useCallback, useMemo, useState, type FormEvent } from "react";
import { Button, EmptyState, Field, Input, Notice, Select, Sheet, Tag } from "@/components/app/ui";
import { IconSearch } from "@/components/icons/prx-icons";
import type { SystemVoucher } from "@/lib/pass-store";

export type MemberRole = "user" | "partner" | "staff" | "admin";

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: MemberRole;
  prxScore: number;
  prxLevel: number;
  walletBalance: number;
  bankBalance?: number;
  bankStatus?: string;
  createdAt: string;
  vouchersCount: number;
  vouchers: SystemVoucher[];
}

interface AdminMembersTabProps {
  users: AdminUser[];
  onRefresh: () => Promise<void>;
}

const ROLE_LABEL: Record<MemberRole, string> = { user: "Membro", partner: "Parceiro", staff: "Equipe", admin: "Admin" };

interface ApiResult {
  success?: boolean;
  error?: string;
}

export function AdminMembersTab({ users, onRefresh }: AdminMembersTabProps) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [inspecting, setInspecting] = useState<AdminUser | null>(null);
  const [form, setForm] = useState({ level: 1, score: 0, role: "user" as MemberRole });
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const closeEdit = useCallback(() => setEditing(null), []);
  const closeInspect = useCallback(() => setInspecting(null), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));
  }, [users, query]);

  function openEdit(user: AdminUser) {
    setEditing(user);
    setForm({
      level: calculatePrxLevel(user.prxScore),
      score: user.prxScore,
      role: user.role,
    });
    setFeedback(null);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // Papel "staff" é gerenciado na aba Equipe: aqui ele só é preservado.
        body: JSON.stringify({
          id: editing.id,
          prxScore: form.score,
          ...(form.role === "staff" ? {} : { role: form.role }),
        }),
      });
      const data = (await res.json()) as ApiResult;
      if (!res.ok || !data.success) {
        setFeedback({ ok: false, text: data.error || "Não foi possível atualizar o membro." });
        return;
      }
      setFeedback({
        ok: true,
        text: `${editing.name} atualizado: nível ${form.level}, ${form.score.toLocaleString("pt-BR")} XP.`,
      });
      setEditing(null);
      await onRefresh();
    } catch {
      setFeedback({ ok: false, text: "Sem conexão com o servidor." });
    } finally {
      setSaving(false);
    }
  }

  async function toggleVoucher(voucher: SystemVoucher) {
    const status = voucher.status === "valid" ? "used" : "valid";
    const res = await fetch("/api/admin/vouchers", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: voucher.id, status }),
    });
    if (!res.ok) return;
    setInspecting((prev) => (prev ? { ...prev, vouchers: prev.vouchers.map((v) => (v.id === voucher.id ? { ...v, status } : v)) } : prev));
    await onRefresh();
  }

  return (
    <section aria-labelledby="members-title" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="members-title" className="font-display text-2xl font-semibold tracking-[-0.03em] text-ink">
            Membros
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Níveis, XP, papel de acesso e vouchers de cada conta.</p>
        </div>
        <div className="relative w-full sm:w-72">
          <IconSearch size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <label htmlFor="member-search" className="sr-only">
            Buscar membro
          </label>
          <Input id="member-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nome ou e-mail" className="pl-11" />
        </div>
      </div>

      {feedback && <Notice tone={feedback.ok ? "success" : "error"}>{feedback.text}</Notice>}

      {filtered.length === 0 ? (
        <EmptyState title="Nenhum membro encontrado" body={query ? "Tente outro nome ou e-mail." : "Os cadastros aparecem aqui."} />
      ) : (
        <div className="glass overflow-x-auto rounded-3xl">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-surface text-[13px] text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">Membro</th>
                <th scope="col" className="px-4 py-3 font-medium">Papel</th>
                <th scope="col" className="px-4 py-3 font-medium">Nível</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">XP</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Saldo PRX Bank</th>
                <th scope="col" className="px-4 py-3 font-medium">Vouchers</th>
                <th scope="col" className="px-4 py-3">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((user) => (
                <tr key={user.id} className="transition-colors hover:bg-surface/60">
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{user.name}</p>
                    <p className="text-[13px] text-muted-foreground">{user.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Tag tone={user.role === "admin" ? "ink" : user.role === "partner" ? "accent" : "neutral"}>{ROLE_LABEL[user.role] ?? user.role}</Tag>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-ink">{user.prxLevel}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink">{user.prxScore.toLocaleString("pt-BR")}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <span className="font-semibold text-ink">
                      {(user.bankBalance ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Button variant="ghost" size="sm" className="-ml-3" onClick={() => setInspecting(user)}>
                      {(() => {
                        const count = user.vouchersCount || user.vouchers?.length || 0;
                        return `${count} ${count === 1 ? "resgate" : "resgates"}`;
                      })()}
                    </Button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="secondary" size="sm" onClick={() => openEdit(user)}>
                      Editar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Sheet
        open={Boolean(editing)}
        onClose={closeEdit}
        title="Editar membro"
        description={editing ? `${editing.name} · ${editing.email}` : undefined}
        footer={
          <Button block type="submit" form="member-form" disabled={saving}>
            {saving ? "Salvando…" : "Salvar alterações"}
          </Button>
        }
      >
        <form id="member-form" onSubmit={save} className="grid gap-5 sm:grid-cols-2">
          <Field label="Nível" hint="Régua infinita: escolher o nível leva o XP ao piso dele.">
            {(id, describedBy) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                value={form.level}
                onChange={(e) => {
                  const level = Number(e.target.value);
                  setForm((prev) => ({ ...prev, level, score: xpForLevel(level) }));
                }}
              >
                {levelGateOptions(form.level).map((lvl) => (
                  <option key={lvl} value={lvl}>
                    Nível {lvl}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="XP (PRX Score)">
            {(id) => (
              <Input
                id={id}
                type="number"
                min={0}
                step={50}
                value={form.score}
                onFocus={(e) => {
                  if (e.target.value === "0") {
                    e.target.select();
                  }
                }}
                onChange={(e) => {
                  const score = Math.max(0, Math.floor(Number(e.target.value) || 0));
                  setForm((prev) => ({ ...prev, score, level: calculatePrxLevel(score) }));
                }}
              />
            )}
          </Field>
          <Field label="Papel de acesso" className="sm:col-span-2" hint={form.role === "staff" ? "Contas da Equipe PRX são gerenciadas na aba Equipe." : undefined}>
            {(id, describedBy) => (
              <Select id={id} aria-describedby={describedBy} value={form.role} disabled={form.role === "staff"} onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value as MemberRole }))}>
                <option value="user">Membro</option>
                <option value="partner">Parceiro credenciado</option>
                <option value="admin">Administrador</option>
                <option value="staff" disabled>
                  Equipe PRX
                </option>
              </Select>
            )}
          </Field>

          <p className="sm:col-span-2 text-[13px] text-muted-foreground">
            O saldo do PRX BANK vem do banco parceiro e não pode ser alterado pelo painel.
          </p>
        </form>
      </Sheet>

      <Sheet open={Boolean(inspecting)} onClose={closeInspect} title={inspecting ? `Vouchers de ${inspecting.name}` : "Vouchers"} description={inspecting?.email}>
        {inspecting && (!inspecting.vouchers || inspecting.vouchers.length === 0) ? (
          <EmptyState title="Nenhum resgate" body="Este membro ainda não gerou vouchers." />
        ) : (
          <ul className="space-y-2">
            {inspecting?.vouchers.map((voucher) => (
              <li key={voucher.id} className="flex items-center justify-between gap-4 rounded-3xl bg-surface px-4 py-3">
                <div className="min-w-0">
                  <p className="font-mono text-sm text-ink">{voucher.code}</p>
                  <p className="truncate text-[13px] text-muted-foreground">
                    {voucher.partnerName} · {voucher.benefitTitle || voucher.discountLabel} · {voucher.redeemedAt}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Tag tone={voucher.status === "valid" ? "success" : "neutral"}>{voucher.status === "valid" ? "Válido" : "Usado"}</Tag>
                  <Button variant="secondary" size="sm" onClick={() => toggleVoucher(voucher)}>
                    {voucher.status === "valid" ? "Marcar usado" : "Reativar"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </section>
  );
}
