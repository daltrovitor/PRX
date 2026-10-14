// Hello World
"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button, Checkbox, EmptyState, Field, Input, Notice, RadioCards, Sheet, Tag } from "@/components/app/ui";
import { CopyButton } from "@/components/app/pass/voucher-sheet";
import { TemporaryCredential } from "@/components/admin/admin-partner-form";
import { IconExternal, IconPlus, IconRefresh } from "@/components/icons/prx-icons";
import type { StaffMember } from "@/lib/staff/repository";
import { useStaffPortalUrl } from "@/lib/site";
import { formatDateTime } from "@/lib/live/format";

interface ApiResult {
  success?: boolean;
  error?: string;
  staff?: StaffMember | StaffMember[];
  temporaryPassword?: string;
}

async function call(method: "GET" | "POST" | "PUT", body?: unknown): Promise<{ ok: boolean; data: ApiResult }> {
  try {
    const res = await fetch("/api/admin/staff", {
      method,
      cache: "no-store",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json().catch(() => ({}))) as ApiResult;
    return { ok: res.ok && data.success !== false, data };
  } catch {
    return { ok: false, data: { error: "Sem internet agora. Confira sua conexão e tente de novo." } };
  }
}

/** Equipe PRX: funcionários que validam ingressos e benefícios no portal staff.prx.app.br. */
export function AdminStaffTab() {
  const portalUrl = useStaffPortalUrl();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { ok, data } = await call("GET");
    setLoading(false);
    if (!ok) return setFeedback({ ok: false, text: data.error || "Não foi possível carregar a equipe." });
    setStaff(Array.isArray(data.staff) ? data.staff : []);
  }, []);

  useEffect(() => {
    let active = true;
    call("GET").then(({ ok, data }) => {
      if (!active) return;
      setLoading(false);
      if (!ok) return setFeedback({ ok: false, text: data.error || "Não foi possível carregar a equipe." });
      setStaff(Array.isArray(data.staff) ? data.staff : []);
    });
    return () => {
      active = false;
    };
  }, []);

  async function update(member: StaffMember, patch: Partial<Pick<StaffMember, "canValidateTickets" | "canValidateBenefits" | "active">>, text: string) {
    setBusyId(member.id);
    setFeedback(null);
    const { ok, data } = await call("PUT", { id: member.id, ...patch });
    setBusyId(null);
    if (!ok) return setFeedback({ ok: false, text: data.error || "Não foi possível atualizar." });
    setFeedback({ ok: true, text });
    await load();
  }

  return (
    <section aria-labelledby="staff-title" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="staff-title" className="font-display text-2xl font-semibold tracking-[-0.03em] text-ink">
            Equipe PRX
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Funcionários da PRX que validam ingressos de eventos e vouchers de benefícios.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading} aria-label="Atualizar equipe">
            <IconRefresh size={16} />
          </Button>
          <Button onClick={() => setCreating(true)}>
            <IconPlus size={18} />
            Novo funcionário
          </Button>
        </div>
      </div>

      {portalUrl && (
        <div className="flex flex-col gap-3 rounded-3xl glass p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[13px] text-muted-foreground">Portal da equipe (envie aos funcionários)</p>
            <p className="mt-1 break-all font-mono text-[15px] text-ink">{portalUrl}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <CopyButton value={portalUrl} label="Copiar link" />
            <a
              href={portalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-12 cursor-pointer items-center gap-1.5 rounded-full bg-card px-4 text-sm font-medium text-ink transition-colors hover:bg-background"
            >
              Abrir <IconExternal size={14} />
            </a>
          </div>
        </div>
      )}

      {feedback && <Notice tone={feedback.ok ? "success" : "error"}>{feedback.text}</Notice>}

      {!loading && staff.length === 0 ? (
        <EmptyState title="Nenhum funcionário cadastrado" body="Crie o login de quem vai trabalhar na portaria dos eventos ou validar benefícios." action={<Button onClick={() => setCreating(true)}>Cadastrar funcionário</Button>} />
      ) : (
        <ul className="space-y-3">
          {staff.map((member) => (
            <li key={member.id} className="grid gap-4 rounded-3xl glass-soft p-5 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[17px] font-semibold text-ink">{member.name}</p>
                  <Tag tone={member.active ? "success" : "neutral"}>{member.active ? "Ativo" : "Desativado"}</Tag>
                </div>
                <p className="break-all text-sm text-muted-foreground">{member.email}</p>
                <p className="text-[13px] text-muted-foreground">Desde {formatDateTime(member.createdAt)}</p>
              </div>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-6">
                <Checkbox
                  label="Ingressos"
                  checked={member.canValidateTickets}
                  disabled={busyId === member.id || !member.active}
                  onChange={(value) => void update(member, { canValidateTickets: value }, value ? `${member.name} agora valida ingressos.` : `${member.name} não valida mais ingressos.`)}
                />
                <Checkbox
                  label="Benefícios"
                  checked={member.canValidateBenefits}
                  disabled={busyId === member.id || !member.active}
                  onChange={(value) => void update(member, { canValidateBenefits: value }, value ? `${member.name} agora valida benefícios.` : `${member.name} não valida mais benefícios.`)}
                />
                <Button
                  variant={member.active ? "ghost" : "secondary"}
                  size="sm"
                  disabled={busyId === member.id}
                  onClick={() => void update(member, { active: !member.active }, member.active ? `Acesso de ${member.name} desativado.` : `Acesso de ${member.name} reativado.`)}
                >
                  {member.active ? "Desativar" : "Reativar"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={creating} onClose={() => setCreating(false)} title="Novo funcionário" description="Crie um login novo ou vincule uma conta PRX que já existe.">
        {creating && <StaffForm portalUrl={portalUrl} onCreated={load} />}
      </Sheet>
    </section>
  );
}

function StaffForm({ portalUrl, onCreated }: { portalUrl: string; onCreated: () => Promise<void> }) {
  const [mode, setMode] = useState<"create" | "link">("create");
  const [form, setForm] = useState({ name: "", email: "", canValidateTickets: true, canValidateBenefits: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; password?: string } | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { ok, data } = await call("POST", { mode, ...form });
    setBusy(false);
    if (!ok) return setError(data.error || "Não foi possível cadastrar.");
    setCreated({ email: form.email.trim().toLowerCase(), password: data.temporaryPassword });
    await onCreated();
  }

  if (created) {
    return (
      <div className="space-y-5">
        {created.password ? (
          <TemporaryCredential
            email={created.email}
            password={created.password}
            note="Esta senha não será mostrada de novo. Envie ao funcionário por um canal seguro junto com o link do portal."
          />
        ) : (
          <Notice tone="success">Conta {created.email} vinculada à equipe. O funcionário entra com a senha que já usa no app.</Notice>
        )}
        {portalUrl && (
          <p className="text-sm text-muted-foreground">
            Portal para validar: <span className="break-all font-mono text-ink">{portalUrl}</span>
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-5">
      <RadioCards
        label="Acesso"
        value={mode}
        onChange={setMode}
        options={[
          { value: "create", title: "Criar login", body: "Gera uma senha temporária para você repassar." },
          { value: "link", title: "Vincular conta existente", body: "A pessoa já tem conta no app PRX." },
        ]}
      />
      <Field label="Nome">{(id) => <Input id={id} value={form.name} maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} required />}</Field>
      <Field label="E-mail">{(id) => <Input id={id} type="email" autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />}</Field>
      <fieldset>
        <legend className="text-[13px] font-medium text-ink">Pode validar</legend>
        <Checkbox label="Ingressos de eventos" hint="Só em eventos com “Equipe PRX valida ingressos” ligado." checked={form.canValidateTickets} onChange={(v) => setForm({ ...form, canValidateTickets: v })} />
        <Checkbox label="Vouchers de benefícios" hint="De qualquer parceiro, no balcão ou em ativações." checked={form.canValidateBenefits} onChange={(v) => setForm({ ...form, canValidateBenefits: v })} />
      </fieldset>
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" block disabled={busy || (!form.canValidateTickets && !form.canValidateBenefits)}>
        {busy ? "Cadastrando…" : mode === "create" ? "Criar login" : "Vincular à equipe"}
      </Button>
    </form>
  );
}
