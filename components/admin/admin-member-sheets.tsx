// Hello World
"use client";

import { calculatePrxLevel, levelGateOptions, xpForLevel } from "@/lib/pass-data";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button, Field, Input, Notice, Select, Sheet, Tag, formatBRL } from "@/components/app/ui";
import type { DirectoryMember } from "@/lib/admin/members";
import type { ActivityTicket, ActivityVoucher } from "@/lib/admin/member-activity";
import { formatDateTimeBr } from "@/components/admin/pager";
import type { MemberRole } from "@/components/admin/admin-members-tab";

/** Folhas do membro no admin: edição de nível/papel e histórico de ingressos e vouchers. */

export function EditMemberSheet({ member, onClose, onSaved }: { member: DirectoryMember; onClose: () => void; onSaved: (text: string) => void }) {
  const [form, setForm] = useState({ level: calculatePrxLevel(member.prxScore), score: member.prxScore, role: member.role as MemberRole });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // Papel "staff" é gerenciado na aba Equipe: aqui ele só é preservado.
        body: JSON.stringify({ id: member.id, prxScore: form.score, ...(form.role === "staff" ? {} : { role: form.role }) }),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) return setError(data.error || "Não foi possível atualizar o membro.");
      onSaved(`${member.name} atualizado: nível ${form.level}, ${form.score.toLocaleString("pt-BR")} XP.`);
    } catch {
      setError("Sem conexão com o servidor.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Editar membro"
      description={`${member.name} · ${member.email}`}
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
              onChange={(e) => {
                const score = Math.max(0, Math.floor(Number(e.target.value) || 0));
                setForm((prev) => ({ ...prev, score, level: calculatePrxLevel(score) }));
              }}
            />
          )}
        </Field>
        <Field label="Papel de acesso" className="sm:col-span-2" hint={form.role === "staff" ? "Contas da Equipe PRX são gerenciadas na aba Equipe." : "Mudanças de papel ficam no registro de auditoria."}>
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
        <p className="text-[13px] text-muted-foreground sm:col-span-2">O saldo do PRX BANK vem do banco parceiro e não pode ser alterado pelo painel.</p>
        {error && (
          <Notice tone="error" className="sm:col-span-2">
            {error}
          </Notice>
        )}
      </form>
    </Sheet>
  );
}

export function MemberHistorySheet({ member, onClose }: { member: DirectoryMember; onClose: () => void }) {
  const [activity, setActivity] = useState<{ vouchers: ActivityVoucher[]; tickets: ActivityTicket[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    fetch(`/api/admin/members?id=${encodeURIComponent(member.id)}`, { cache: "no-store" })
      .then((res) => res.json() as Promise<{ vouchers?: ActivityVoucher[]; tickets?: ActivityTicket[]; error?: string }>)
      .then((json) => {
        if (!active) return;
        if (json.vouchers && json.tickets) setActivity({ vouchers: json.vouchers, tickets: json.tickets });
        else setError(json.error || "Não foi possível carregar o histórico.");
      })
      .catch(() => {
        if (active) setError("Sem conexão com o servidor.");
      });
    return () => {
      active = false;
    };
  }, [member.id, version]);

  const toggleVoucher = useCallback(async (voucher: ActivityVoucher) => {
    const status = voucher.status === "valid" ? "used" : "valid";
    const res = await fetch("/api/admin/vouchers", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: voucher.id, status }) });
    if (res.ok) setVersion((v) => v + 1);
  }, []);

  return (
    <Sheet open onClose={onClose} title={`Histórico de ${member.name}`} description={member.email}>
      {error && <Notice tone="error">{error}</Notice>}
      {!activity && !error && <div role="status" aria-label="Carregando histórico" className="h-40 rounded-3xl bg-surface" />}
      {activity && (
        <div className="space-y-8">
          <section aria-labelledby="hist-tickets" className="space-y-3">
            <h3 id="hist-tickets" className="text-[15px] font-semibold text-ink">
              Ingressos PRX LIVE ({activity.tickets.length})
            </h3>
            {activity.tickets.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum ingresso.</p>
            ) : (
              <ul className="space-y-2">
                {activity.tickets.map((t) => (
                  <li key={t.id} className="flex items-start justify-between gap-3 rounded-3xl bg-surface px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{t.eventTitle}</p>
                      <p className="font-mono text-[12px] text-muted-foreground">
                        {t.code} · {t.purchaseCode}
                      </p>
                      <p className="text-[12px] text-muted-foreground">
                        {t.batchName} · {t.price === 0 ? "grátis" : formatBRL(t.price)}
                        {t.discount > 0 ? ` (desconto ${formatBRL(t.discount)})` : ""} · {formatDateTimeBr(t.createdAt)}
                      </p>
                    </div>
                    <Tag tone={t.status === "valid" ? "success" : t.status === "pending_payment" ? "warning" : "neutral"}>{t.statusLabel}</Tag>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="hist-vouchers" className="space-y-3">
            <h3 id="hist-vouchers" className="text-[15px] font-semibold text-ink">
              Vouchers PRX PASS ({activity.vouchers.length})
            </h3>
            {activity.vouchers.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum resgate.</p>
            ) : (
              <ul className="space-y-2">
                {activity.vouchers.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-3 rounded-3xl bg-surface px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-mono text-sm text-ink">{v.code}</p>
                      <p className="truncate text-[12px] text-muted-foreground">
                        {v.partnerName} · {v.benefitTitle} · {formatDateTimeBr(v.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Tag tone={v.status === "valid" ? "success" : "neutral"}>{v.status === "valid" ? "Válido" : "Usado"}</Tag>
                      <Button variant="secondary" size="sm" onClick={() => void toggleVoucher(v)}>
                        {v.status === "valid" ? "Marcar usado" : "Reativar"}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Sheet>
  );
}
