// Hello World
"use client";

import { useEffect, useState } from "react";
import { Button, EmptyState, Input, Notice, Select, Tag, formatBRL } from "@/components/app/ui";
import { IconSearch } from "@/components/icons/prx-icons";
import type { SystemVoucher } from "@/lib/pass-store";
import type { DirectoryMember, MemberPage } from "@/lib/admin/members";
import { Pager, formatDateTimeBr, useDebounced } from "@/components/admin/pager";
import { EditMemberSheet, MemberHistorySheet } from "@/components/admin/admin-member-sheets";

export type MemberRole = "user" | "partner" | "staff" | "admin";

/** Formato antigo (lista completa), ainda usado pela aba de parceiros. */
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

const ROLE_LABEL: Record<MemberRole, string> = { user: "Membro", partner: "Parceiro", staff: "Equipe", admin: "Admin" };
const BANK_LABEL: Record<string, string> = { active: "Conta ativa", pending_activation: "Em ativação", blocked: "Bloqueada", none: "Sem conta" };

interface Filters {
  q: string;
  role: string;
  bank: string;
  sort: string;
}

/**
 * Membros com busca, filtros, ordenação e paginação no servidor: a tela nunca
 * carrega a base inteira. Perfil mostra o histórico de vouchers e ingressos.
 */
export function AdminMembersTab() {
  const [filters, setFilters] = useState<Filters>({ q: "", role: "", bank: "", sort: "recent" });
  const q = useDebounced(filters.q);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<MemberPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState<DirectoryMember | null>(null);
  const [inspecting, setInspecting] = useState<DirectoryMember | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ page: String(page), pageSize: "25", sort: filters.sort });
    if (q.trim()) params.set("q", q.trim());
    if (filters.role) params.set("role", filters.role);
    if (filters.bank) params.set("bank", filters.bank);
    fetch(`/api/admin/members?${params}`, { cache: "no-store" })
      .then(async (res) => {
        const json = (await res.json().catch(() => ({}))) as Partial<MemberPage> & { error?: string };
        if (!active) return;
        if (!res.ok || !json.members) throw new Error(json.error || "Não foi possível carregar os membros.");
        setData(json as MemberPage);
        setError(null);
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : "Sem internet agora. Confira sua conexão e tente de novo.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, q, filters.role, filters.bank, filters.sort, reload]);

  const setFilter = (key: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
    setLoading(true);
  };

  return (
    <section aria-labelledby="members-title" className="space-y-6">
      <div>
        <h2 id="members-title" className="font-display text-2xl font-semibold tracking-[-0.03em] text-ink">
          Membros
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Busca, filtros e páginas vêm do servidor. Abra um membro para ver vouchers e ingressos.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <IconSearch size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <label htmlFor="member-search" className="sr-only">
            Buscar membro
          </label>
          <Input id="member-search" type="search" value={filters.q} onChange={(e) => setFilter("q", e.target.value)} placeholder="Nome ou e-mail" className="pl-11" />
        </div>
        <label className="sr-only" htmlFor="member-role">
          Papel
        </label>
        <Select id="member-role" value={filters.role} onChange={(e) => setFilter("role", e.target.value)}>
          <option value="">Todos os papéis</option>
          {(Object.keys(ROLE_LABEL) as MemberRole[]).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </Select>
        <label className="sr-only" htmlFor="member-bank">
          Conta PRX Bank
        </label>
        <Select id="member-bank" value={filters.bank} onChange={(e) => setFilter("bank", e.target.value)}>
          <option value="">Qualquer situação bancária</option>
          {Object.entries(BANK_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <label className="sr-only" htmlFor="member-sort">
          Ordenação
        </label>
        <Select id="member-sort" value={filters.sort} onChange={(e) => setFilter("sort", e.target.value)}>
          <option value="recent">Mais recentes</option>
          <option value="oldest">Mais antigos</option>
          <option value="name">Nome (A–Z)</option>
          <option value="score">Mais XP</option>
        </Select>
      </div>

      {data?.source === "profiles" && <Notice tone="warning">Filtro por conta bancária disponível após aplicar a migração 20261011_prx_launch.sql.</Notice>}
      {feedback && <Notice tone={feedback.ok ? "success" : "error"}>{feedback.text}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      {!data ? (
        <div role="status" aria-label="Carregando membros" className="h-48 rounded-3xl bg-surface" />
      ) : data.members.length === 0 ? (
        <EmptyState title="Nenhum membro encontrado" body={filters.q || filters.role || filters.bank ? "Ajuste a busca ou os filtros." : "Os cadastros aparecem aqui."} />
      ) : (
        <div className={`glass overflow-x-auto rounded-3xl transition-opacity ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-surface text-[13px] text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">Membro</th>
                <th scope="col" className="px-4 py-3 font-medium">Papel</th>
                <th scope="col" className="px-4 py-3 font-medium">Nível</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">XP</th>
                <th scope="col" className="px-4 py-3 font-medium">PRX Bank</th>
                <th scope="col" className="px-4 py-3 font-medium">Desde</th>
                <th scope="col" className="px-4 py-3">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.members.map((m) => (
                <tr key={m.id} className="transition-colors hover:bg-surface/60">
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{m.name}</p>
                    <p className="text-[13px] text-muted-foreground">{m.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Tag tone={m.role === "admin" ? "ink" : m.role === "partner" ? "accent" : "neutral"}>{ROLE_LABEL[m.role]}</Tag>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-ink">{m.prxLevel}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink">{m.prxScore.toLocaleString("pt-BR")}</td>
                  <td className="px-4 py-3 text-[13px] text-ink">
                    {BANK_LABEL[m.bankStatus] ?? m.bankStatus}
                    {m.bankStatus === "active" ? ` · ${formatBRL(m.bankBalance)}` : ""}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-muted-foreground">{formatDateTimeBr(m.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setInspecting(m)}>
                        Histórico
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setEditing(m)}>
                        Editar
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > data.pageSize && (
        <Pager
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          busy={loading}
          onPage={(p) => {
            setPage(p);
            setLoading(true);
          }}
        />
      )}

      {editing && (
        <EditMemberSheet
          member={editing}
          onClose={() => setEditing(null)}
          onSaved={(text) => {
            setFeedback({ ok: true, text });
            setEditing(null);
            setReload((r) => r + 1);
          }}
        />
      )}
      {inspecting && <MemberHistorySheet member={inspecting} onClose={() => setInspecting(null)} />}
    </section>
  );
}
