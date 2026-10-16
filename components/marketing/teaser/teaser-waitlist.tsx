// Hello World
"use client";

import { useId, useState, type FormEvent } from "react";
import { cn } from "@/lib/utils";

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "done"; message: string } | { kind: "error"; message: string };

/**
 * Lista de Espera VIP (POST /api/waitlist). O e-mail só entra com o aceite de
 * contato (LGPD); a resposta do servidor é sempre a mesma, exista ou não o
 * e-mail na lista.
 */
export function TeaserWaitlist({ className, source = "hero" }: { className?: string; source?: "hero" | "final" }) {
  const emailId = useId();
  const consentId = useId();
  const statusId = `${emailId}-status`;
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!consent) return setStatus({ kind: "error", message: "Autorize o contato para entrar na lista." });
    setStatus({ kind: "sending" });
    try {
      const res = await fetch("/api/waitlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, consent }) });
      const json = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!res.ok) return setStatus({ kind: "error", message: json.error || "Não foi possível entrar na lista agora." });
      setStatus({ kind: "done", message: json.message || "Você está na Lista VIP." });
      setEmail("");
    } catch {
      setStatus({ kind: "error", message: "Sem internet agora. Confira sua conexão e tente de novo." });
    }
  }

  return (
    <form onSubmit={submit} noValidate aria-label={source === "hero" ? "Lista de Espera VIP" : "Lista de Espera VIP (fim da página)"} className={cn("w-full", className)}>
      <label htmlFor={emailId} className="font-mono text-[12px] uppercase tracking-[0.18em] text-white/70">
        Lista de Espera VIP
      </label>
      <div className="mt-3 flex flex-col border border-white/15 bg-white/[0.03] transition-colors focus-within:border-[#9468fa] min-[460px]:flex-row">
        <input
          id={emailId}
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="seu@email.com"
          suppressHydrationWarning
          aria-invalid={status.kind === "error"}
          aria-describedby={statusId}
          className="h-14 w-full min-w-0 bg-transparent px-4 text-[16px] text-white placeholder:text-white/55 focus:outline-none min-[460px]:flex-1"
        />
        <button
          type="submit"
          disabled={status.kind === "sending" || !consent}
          className="group/cta relative h-14 cursor-pointer overflow-hidden whitespace-nowrap bg-[#7c3aed] px-6 text-[15px] font-semibold text-white transition-colors hover:bg-[#6d28d9] disabled:cursor-not-allowed disabled:bg-[#7c3aed]/45 disabled:text-white/80"
        >
          <span className="relative inline-flex items-center gap-2">
            {status.kind === "sending" ? "Enviando…" : "Quero ser avisado"}
            <span aria-hidden className="transition-transform duration-300 group-hover/cta:translate-x-1 group-disabled/cta:translate-x-0">
              →
            </span>
          </span>
        </button>
      </div>
      <div className="mt-3 flex items-start gap-1">
        <label className="-ml-3.5 -mt-3 flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center">
          <input
            id={consentId}
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            suppressHydrationWarning
            className="h-5 w-5 shrink-0 cursor-pointer accent-[#7c3aed]"
          />
        </label>
        <label htmlFor={consentId} className="cursor-pointer text-[13px] leading-relaxed text-white/70">
          Autorizo a PRX a me avisar do lançamento por e-mail, conforme a{" "}
          <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="cursor-pointer font-medium text-[#c4b1fd] underline underline-offset-2 hover:text-white">
            Política de Privacidade
          </a>
          .
        </label>
      </div>
      <p id={statusId} role="status" aria-live="polite" className={cn("min-h-5 text-[13px]", status.kind === "error" ? "text-[#f87171]" : "text-[#34d399]")}>
        {status.kind === "done" || status.kind === "error" ? status.message : ""}
      </p>
    </form>
  );
}
