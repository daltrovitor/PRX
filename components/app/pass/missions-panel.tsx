// Hello World
"use client";

import { useState } from "react";
import confetti from "canvas-confetti";
import type { PassMission } from "@/lib/pass-data";
import { Button, EmptyState, Notice, ProgressBar, Segmented, Tag } from "@/components/app/ui";
import { CopyButton } from "@/components/app/pass/voucher-sheet";
import { cn } from "@/lib/utils";

type MissionFilter = "all" | "in_progress" | "available" | "completed";

interface MissionsPanelProps {
  missions: PassMission[];
  userId: string;
  referralCode: string;
  onChanged: () => Promise<void>;
  onScoreChange: (score: number, level: number) => void;
}

interface ApiResult {
  success?: boolean;
  completed?: boolean;
  message?: string;
  error?: string;
  currentUser?: { prxScore: number; prxLevel: number };
}

function celebrate() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  confetti({ particleCount: 70, spread: 60, origin: { y: 0.7 }, colors: ["#6c0cf0", "#0b0b10", "#0bd9fd"] });
}

export function MissionsPanel({ missions, userId, referralCode, onChanged, onScoreChange }: MissionsPanelProps) {
  const [filter, setFilter] = useState<MissionFilter>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ id: string; text: string; ok: boolean } | null>(null);

  const counts = {
    all: missions.length,
    in_progress: missions.filter((m) => m.isAccepted && !m.isCompleted).length,
    available: missions.filter((m) => !m.isAccepted && !m.isCompleted).length,
    completed: missions.filter((m) => m.isCompleted).length,
  };

  const visible = missions.filter((m) => {
    if (filter === "in_progress") return m.isAccepted && !m.isCompleted;
    if (filter === "available") return !m.isAccepted && !m.isCompleted;
    if (filter === "completed") return m.isCompleted;
    return true;
  });

  async function call(missionId: string, action: "accept" | "verify") {
    setBusy(missionId);
    setNotice(null);
    try {
      const res = await fetch(`/api/pass/missions/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ missionId }),
      });
      const data = (await res.json()) as ApiResult;
      if (!res.ok || !data.success) {
        setNotice({ id: missionId, ok: false, text: data.error || "Ainda faltam etapas para concluir esta missão." });
        return;
      }
      if (action === "accept") {
        setNotice({ id: missionId, ok: true, text: "Missão aceita. Conclua as etapas e volte para verificar." });
      } else {
        setNotice({ id: missionId, ok: Boolean(data.completed), text: data.message || "Missão verificada." });
        if (data.completed) {
          celebrate();
          if (data.currentUser) onScoreChange(data.currentUser.prxScore, data.currentUser.prxLevel);
        }
      }
      await onChanged();
    } catch {
      setNotice({ id: missionId, ok: false, text: "Sem internet agora. Confira sua conexão e tente de novo." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <Segmented
        label="Filtrar missões"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "Todas", count: counts.all },
          { value: "in_progress", label: "Em andamento", count: counts.in_progress },
          { value: "available", label: "Disponíveis", count: counts.available },
          { value: "completed", label: "Concluídas", count: counts.completed },
        ]}
      />

      {visible.length === 0 ? (
        <EmptyState
          title={filter === "completed" ? "Nenhuma missão concluída ainda" : "Nada por aqui"}
          body={
            filter === "in_progress"
              ? "Aceite uma missão disponível para começar a somar XP."
              : "Novas missões aparecem aqui assim que forem publicadas."
          }
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {visible.map((mission) => {
            const isReferral = mission.verificationType === "referral";
            const current = notice?.id === mission.id ? notice : null;
            return (
              <li key={mission.id} className="flex flex-col justify-between gap-5 rounded-3xl glass-soft p-5 sm:gap-6 sm:p-6">
                <div className="space-y-2.5 sm:space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <Tag className="bg-card">{mission.category || (isReferral ? "Comunidade" : "PRX")}</Tag>
                    <span className="rounded-full bg-primary/[0.09] px-2.5 py-0.5 text-[12px] font-semibold text-primary">+{mission.xpReward} XP</span>
                  </div>
                  <h2 className="text-base sm:text-[17px] font-semibold leading-snug tracking-[-0.01em] text-ink">{mission.title}</h2>
                  <p className="text-xs sm:text-sm leading-relaxed text-muted-foreground">{mission.description}</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="mb-2 flex justify-between text-[13px]">
                      <span className={cn(mission.isCompleted ? "text-success" : "text-muted-foreground")}>
                        {mission.isCompleted ? "Concluída" : mission.isAccepted ? "Em andamento" : "Não iniciada"}
                      </span>
                      <span className="font-medium text-ink">
                        {mission.isCompleted ? mission.total : mission.progress}/{mission.total}
                      </span>
                    </div>
                    <ProgressBar
                      value={mission.isCompleted ? mission.total : mission.progress}
                      max={mission.total || 1}
                      label={`Progresso de ${mission.title}`}
                      tone={mission.isCompleted ? "success" : "accent"}
                    />
                  </div>

                  {current && <Notice tone={current.ok ? "success" : "warning"}>{current.text}</Notice>}

                  {!mission.isAccepted && !mission.isCompleted && (
                    <Button block onClick={() => call(mission.id, "accept")} disabled={busy === mission.id}>
                      {busy === mission.id ? "Aceitando…" : "Aceitar missão"}
                    </Button>
                  )}
                  {mission.isAccepted && !mission.isCompleted && (
                    <div className="flex flex-wrap gap-2">
                      {isReferral && userId && <CopyButton value={referralCode} label="Copiar meu código" />}
                      <Button className="flex-1" variant="ink" onClick={() => call(mission.id, "verify")} disabled={busy === mission.id}>
                        {busy === mission.id ? "Verificando…" : "Verificar missão"}
                      </Button>
                    </div>
                  )}
                  {mission.isCompleted && (
                    <p className="text-[13px] text-success">+{mission.xpReward} XP creditados no seu PRX Score.</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
