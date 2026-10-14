// Hello World
"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import confetti from "canvas-confetti";
import type { ReferralInfo } from "@/lib/pass-data";
import { Button, Field, Input, Notice } from "@/components/app/ui";
import { CopyButton } from "@/components/app/pass/voucher-sheet";

const noopSubscribe = () => () => undefined;

interface ReferralPanelProps {
  referralInfo: ReferralInfo;
  onReferralSuccess: (score: number, level: number) => void;
}

interface ReferralResult {
  success?: boolean;
  message?: string;
  error?: string;
  referrer?: { id: string; name: string };
  currentUser?: { prxScore: number; prxLevel: number };
}

export function ReferralPanel({ referralInfo, onReferralSuccess }: ReferralPanelProps) {
  const code = referralInfo.referralCode || referralInfo.userId.slice(0, 8).toUpperCase();
  const origin = useSyncExternalStore(noopSubscribe, () => window.location.origin, () => "");
  const shareUrl = origin ? `${origin}/?ref=${code}` : "";
  // Este painel só é montado no cliente (após a checagem de sessão), então ler a URL aqui é seguro.
  const [input, setInput] = useState(() =>
    typeof window === "undefined" ? "" : (new URLSearchParams(window.location.search).get("ref") ?? "").trim().toUpperCase()
  );
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [redeemedReferrer, setRedeemedReferrer] = useState<{ id: string; name: string } | null>(null);
  const referredBy = redeemedReferrer ?? referralInfo.referredBy ?? null;
  const [editing, setEditing] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!input.trim()) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/pass/referral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referrerId: input.trim() }),
      });
      const data = (await res.json()) as ReferralResult;
      if (!res.ok || !data.success) {
        setFeedback({ ok: false, text: data.error || "Não foi possível validar este código." });
        return;
      }
      setFeedback({ ok: true, text: data.message || "Convite validado. Bônus creditado." });
      if (data.referrer) setRedeemedReferrer(data.referrer);
      setEditing(false);
      setInput("");
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        confetti({ particleCount: 70, spread: 60, origin: { y: 0.7 }, colors: ["#6c0cf0", "#0b0b10", "#0bd9fd"] });
      }
      if (data.currentUser) onReferralSuccess(data.currentUser.prxScore, data.currentUser.prxLevel);
    } catch {
      setFeedback({ ok: false, text: "Sem internet agora. Confira sua conexão e tente de novo." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section aria-labelledby="ref-share" className="space-y-6 rounded-3xl glass p-5 sm:p-7">
        <div>
          <h2 id="ref-share" className="text-xl font-semibold tracking-[-0.02em] text-ink sm:text-2xl">
            Convide e suba de nível
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Cada amigo que validar o seu código rende <strong className="font-semibold text-ink">+250 XP</strong> para você e{" "}
            <strong className="font-semibold text-ink">+100 XP</strong> de boas-vindas para ele.
          </p>
        </div>

        <div className="flex items-end justify-between gap-4 rounded-2xl bg-card p-4 sm:p-5">
          <div>
            <p className="text-xs sm:text-[13px] text-muted-foreground">Seu código</p>
            <p className="mt-1 font-mono text-2xl sm:text-3xl tracking-[0.1em] text-ink">{code}</p>
          </div>
          <p className="text-right">
            <span className="block text-2xl font-semibold leading-none text-ink sm:text-3xl">{referralInfo.friendsInvitedCount}</span>
            <span className="text-xs sm:text-[13px] text-muted-foreground">amigos</span>
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <CopyButton value={code} label="Copiar código" />
          {shareUrl && <CopyButton value={shareUrl} label="Copiar link" />}
        </div>
      </section>

      <section aria-labelledby="ref-redeem" className="space-y-5 rounded-3xl glass p-5 sm:p-7">
        <h2 id="ref-redeem" className="text-xl font-semibold tracking-[-0.02em] text-ink sm:text-2xl">
          Recebeu um convite?
        </h2>
        {referredBy && !editing ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Você entrou pelo convite de <strong className="font-semibold text-ink">{referredBy.name}</strong>. Bônus de +100 XP ativo.
            </p>
            <Button variant="ghost" size="sm" className="-ml-3" onClick={() => setEditing(true)}>
              Usar outro código
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Field label="Código do amigo" hint="8 caracteres, como 2662CD6C.">
              {(id, describedBy) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  value={input}
                  onChange={(e) => setInput(e.target.value.toUpperCase())}
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono tracking-[0.12em]"
                />
              )}
            </Field>
            <div className="flex gap-2">
              {editing && (
                <Button variant="secondary" onClick={() => setEditing(false)}>
                  Cancelar
                </Button>
              )}
              <Button type="submit" className="flex-1" disabled={submitting || !input.trim()}>
                {submitting ? "Validando…" : "Validar convite"}
              </Button>
            </div>
          </form>
        )}
        {feedback && <Notice tone={feedback.ok ? "success" : "error"}>{feedback.text}</Notice>}
      </section>
    </div>
  );
}
