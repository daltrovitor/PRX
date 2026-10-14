// Hello World
"use client";

import { useState, type FormEvent } from "react";
import { MISSION_VERIFICATION_DEFINITIONS, PDF_MISSION_TEMPLATES, type MissionVerificationType, type PassMission } from "@/lib/pass-data";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { Button, EmptyState, Field, Input, Notice, Select, Sheet, Tag, Textarea } from "@/components/app/ui";
import { IconPlus } from "@/components/icons/prx-icons";

interface AdminMissionsTabProps {
  missions: PassMission[];
  onRefresh: () => Promise<void>;
}

interface MissionForm {
  title: string;
  description: string;
  xpReward: number;
  total: number;
  progress: number;
  verificationType: MissionVerificationType;
  category: string;
}

const EMPTY_FORM: MissionForm = {
  title: "",
  description: "",
  xpReward: 150,
  total: 1,
  progress: 0,
  verificationType: "referral",
  category: "Comunidade",
};

const CATEGORIES = ["Comunidade", "PRX PASS", "PRX BANK", "PRX LIVE", "PRX FOUNDERS", "PRX CIRCLE", "PRX LEVEL", "Geral"];

interface ApiResult {
  success?: boolean;
  error?: string;
}

export function AdminMissionsTab({ missions, onRefresh }: AdminMissionsTabProps) {
  const { confirmDelete, showToast } = useConfirmToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PassMission | null>(null);
  const [form, setForm] = useState<MissionForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openWith(mission: PassMission | null, template?: Omit<PassMission, "id">) {
    setEditing(mission);
    const source = mission ?? template;
    setForm(
      source
        ? {
            title: source.title,
            description: source.description,
            xpReward: source.xpReward,
            total: source.total,
            progress: mission ? mission.progress : 0,
            verificationType: source.verificationType || "manual",
            category: source.category || "Geral",
          }
        : EMPTY_FORM
    );
    setError(null);
    setOpen(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const payload = { ...form, isCompleted: form.progress >= form.total };
    try {
      const res = await fetch("/api/admin/missions", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { id: editing.id, ...payload } : payload),
      });
      const data = (await res.json()) as ApiResult;
      if (!res.ok || !data.success) {
        setError(data.error || "Não foi possível salvar a missão.");
        return;
      }
      showToast("success", editing ? "Missão atualizada." : "Missão publicada.");
      setOpen(false);
      await onRefresh();
    } catch {
      setError("Sem internet agora. Confira sua conexão e tente de novo.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(mission: PassMission) {
    const confirmed = await confirmDelete({
      title: "Excluir missão",
      message: `"${mission.title}" some para todos os membros. Esta ação não pode ser desfeita.`,
      confirmText: "Excluir",
      cancelText: "Cancelar",
      type: "danger",
    });
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/admin/missions?id=${encodeURIComponent(mission.id)}`, { method: "DELETE" });
      const data = (await res.json()) as ApiResult;
      if (res.ok && data.success) {
        showToast("success", "Missão removida.");
        await onRefresh();
      } else {
        showToast("error", data.error || "Não foi possível excluir.");
      }
    } catch {
      showToast("error", "Sem internet agora. Confira sua conexão e tente de novo.");
    }
  }

  return (
    <section aria-labelledby="missions-title" className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="missions-title" className="font-display text-2xl font-semibold tracking-[-0.03em] text-ink">
            Missões
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Tarefas que rendem XP e fazem o membro subir de nível.</p>
        </div>
        <Button onClick={() => openWith(null)}>
          <IconPlus size={18} />
          Nova missão
        </Button>
      </div>

      <div>
        <h3 className="text-[13px] font-semibold text-muted-foreground">Modelos da proposta</h3>
        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:flex-wrap sm:px-0">
          {PDF_MISSION_TEMPLATES.map((template) => (
            <button
              key={template.title}
              type="button"
              onClick={() => openWith(null, template)}
              className="flex min-h-12 shrink-0 cursor-pointer items-center gap-2 rounded-full bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-line"
            >
              {template.title}
              <span className="font-mono text-[12px] text-primary">+{template.xpReward}</span>
            </button>
          ))}
        </div>
      </div>

      {missions.length === 0 ? (
        <EmptyState title="Nenhuma missão publicada" body="Use um modelo acima ou crie do zero." />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {missions.map((mission) => (
            <li key={mission.id} className="flex flex-col justify-between gap-5 rounded-3xl glass-soft p-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Tag>{mission.category || "Geral"}</Tag>
                  <span className="font-mono text-[13px] text-primary">+{mission.xpReward} XP</span>
                </div>
                <h3 className="text-[17px] font-semibold text-ink">{mission.title}</h3>
                <p className="line-clamp-3 text-sm text-muted-foreground">{mission.description}</p>
                <p className="text-[13px] text-muted-foreground">
                  Verificação: {MISSION_VERIFICATION_DEFINITIONS[mission.verificationType || "manual"]?.shortLabel ?? mission.verificationType} · meta{" "}
                  {mission.total}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => openWith(mission)}>
                  Editar
                </Button>
                <Button variant="danger" size="sm" onClick={() => remove(mission)}>
                  Excluir
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Editar missão" : "Nova missão"}
        description="Objetivo, recompensa e como a conclusão é verificada."
        footer={
          <Button block type="submit" form="mission-form" disabled={saving}>
            {saving ? "Salvando…" : editing ? "Salvar alterações" : "Publicar missão"}
          </Button>
        }
      >
        <form id="mission-form" onSubmit={submit} className="grid gap-5 sm:grid-cols-2">
          <Field label="Título" className="sm:col-span-2">
            {(id) => <Input id={id} required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />}
          </Field>
          <Field label="Descrição" className="sm:col-span-2">
            {(id) => <Textarea id={id} required rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />}
          </Field>
          <Field label="Categoria">
            {(id) => (
              <Select id={id} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Verificação">
            {(id) => (
              <Select id={id} value={form.verificationType} onChange={(e) => setForm({ ...form, verificationType: e.target.value as MissionVerificationType })}>
                {Object.values(MISSION_VERIFICATION_DEFINITIONS).map((def) => (
                  <option key={def.type} value={def.type}>
                    {def.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Recompensa (XP)">
            {(id) => <Input id={id} type="number" min={0} step={50} value={form.xpReward} onChange={(e) => setForm({ ...form, xpReward: Number(e.target.value) })} />}
          </Field>
          <Field label="Meta (passos)">
            {(id) => <Input id={id} type="number" min={1} value={form.total} onChange={(e) => setForm({ ...form, total: Number(e.target.value) })} />}
          </Field>
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
