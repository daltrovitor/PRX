// Hello World
"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { cn } from "@/lib/utils";

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "done"; message: string } | { kind: "error"; message: string };

/** Máscara progressiva do celular: (11) 91234-5678. */
export function maskPhoneInput(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

const LABEL = "font-mono text-[12px] uppercase tracking-[0.18em] text-white/70";
const FIELD =
  "mt-2 h-14 w-full min-w-0 border border-white/15 bg-white/[0.03] px-4 text-[16px] text-white transition-colors placeholder:text-white/55 focus:border-[#9468fa] focus:outline-none";

/**
 * Pop-up de pré-cadastro da Lista de Espera VIP (POST /api/waitlist). Usa o
 * <dialog> nativo: foco preso, Esc fecha e o foco volta ao botão que abriu. O
 * formulário só existe enquanto o pop-up está aberto, então cada abertura começa
 * limpa e não há campos duplicados na página.
 */
export function TeaserPreregDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Trava a rolagem da página enquanto o pop-up está aberto.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="prereg-title"
      data-lenis-prevent
      className="m-auto max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-[480px] overscroll-contain border border-white/15 bg-[#0b0b12] p-0 text-white backdrop:bg-black/75"
    >
      {open && <PreregForm onClose={onClose} />}
    </dialog>
  );
}

function PreregForm({ onClose }: { onClose: () => void }) {
  const uid = useId();
  const id = (field: string) => `${uid}-${field}`;
  const statusId = id("status");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [age, setAge] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!consent) return setStatus({ kind: "error", message: "Autorize o contato para entrar na lista." });
    setStatus({ kind: "sending" });
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone, age: age ? Number(age) : null, consent }),
      });
      const json = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!res.ok) return setStatus({ kind: "error", message: json.error || "Não foi possível fazer o pré-cadastro agora." });
      setStatus({ kind: "done", message: json.message || "Você está na Lista VIP." });
    } catch {
      setStatus({ kind: "error", message: "Sem internet agora. Confira sua conexão e tente de novo." });
    }
  }

  return (
    <div className="relative p-6 sm:p-8">
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar pré-cadastro"
        className="absolute right-2 top-2 flex h-12 w-12 cursor-pointer items-center justify-center text-[28px] leading-none text-white/70 transition-colors hover:text-white"
      >
        <span aria-hidden>×</span>
      </button>

      <h2 id="prereg-title" className="ob-display pr-10 text-[clamp(28px,6vw,36px)] leading-[0.95] tracking-[0.03em] text-white">
        {status.kind === "done" ? "Pré-cadastro feito." : "Pré-cadastro."}
      </h2>

      {status.kind === "done" ? (
        <div role="status" className="mt-5">
          <p className="text-pretty text-[16px] leading-relaxed text-white/80">{status.message}</p>
          <button
            type="button"
            onClick={onClose}
            className="mt-8 h-14 w-full cursor-pointer bg-[#7c3aed] px-6 text-[15px] font-semibold text-white transition-colors hover:bg-[#6d28d9]"
          >
            Fechar
          </button>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="mt-5">
          <p className="text-pretty text-[15px] leading-relaxed text-white/75">Preencha para entrar na Lista de Espera VIP e receber o convite antes de todo mundo.</p>

          <div className="mt-6 space-y-4">
            <div>
              <label htmlFor={id("name")} className={LABEL}>
                Nome
              </label>
              <input id={id("name")} type="text" autoComplete="name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" suppressHydrationWarning className={FIELD} />
            </div>
            <div>
              <label htmlFor={id("email")} className={LABEL}>
                E-mail
              </label>
              <input
                id={id("email")}
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                maxLength={120}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                suppressHydrationWarning
                className={FIELD}
              />
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-3">
              <div>
                <label htmlFor={id("phone")} className={LABEL}>
                  Celular
                </label>
                <input
                  id={id("phone")}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  required
                  value={phone}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setPhone(maskPhoneInput(e.target.value))}
                  placeholder="(11) 91234-5678"
                  suppressHydrationWarning
                  className={FIELD}
                />
              </div>
              <div>
                <label htmlFor={id("age")} className={LABEL}>
                  Idade
                </label>
                <input
                  id={id("age")}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  required
                  maxLength={3}
                  value={age}
                  onChange={(e) => setAge(e.target.value.replace(/\D/g, ""))}
                  placeholder="18"
                  suppressHydrationWarning
                  className={FIELD}
                />
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-1">
            <label className="-ml-3.5 -mt-3 flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center">
              <input id={id("consent")} type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} suppressHydrationWarning className="h-5 w-5 shrink-0 cursor-pointer accent-[#7c3aed]" />
            </label>
            <label htmlFor={id("consent")} className="cursor-pointer text-[13px] leading-relaxed text-white/70">
              Autorizo a PRX a me avisar do lançamento por e-mail e celular, conforme a{" "}
              <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="cursor-pointer font-medium text-[#c4b1fd] underline underline-offset-2 hover:text-white">
                Política de Privacidade
              </a>
              .
            </label>
          </div>

          <p id={statusId} role="status" aria-live="polite" className={cn("min-h-5 pt-1 text-[13px]", status.kind === "error" ? "text-[#f87171]" : "text-white/70")}>
            {status.kind === "error" ? status.message : ""}
          </p>

          <button
            type="submit"
            disabled={status.kind === "sending"}
            className="group/cta mt-3 h-14 w-full cursor-pointer bg-[#7c3aed] px-6 text-[15px] font-semibold text-white transition-colors hover:bg-[#6d28d9] disabled:cursor-not-allowed disabled:bg-[#7c3aed]/45"
          >
            <span className="inline-flex items-center gap-2">
              {status.kind === "sending" ? "Enviando…" : "Fazer pré-cadastro"}
              <span aria-hidden className="transition-transform duration-300 group-hover/cta:translate-x-1">
                →
              </span>
            </span>
          </button>
        </form>
      )}
    </div>
  );
}
