// Hello World
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { motion } from "motion/react";
import { PrxLogo } from "@/components/brand/prx-logo";
import { Avatar, Button, Field, Input, Notice } from "@/components/app/ui";
import { TermsConsent } from "@/components/auth/terms-consent";
import { CRYSTAL_HERO, ObsidianCrystal } from "@/components/obsidian/obsidian-ui";
import { useThemeScope } from "@/components/theme-provider";
import { useAuth } from "@/hooks/use-auth";
import { maskCpfInput } from "@/lib/cpf-mask";
import { isValidCpf } from "@/lib/partners/documents";

/*
 * Entrada com o Google sem cadastro completo: o app abre (cabeçalho, cristal e
 * saudação do dashboard) e pede CPF, celular, nascimento (mínimo de 12 anos) e o aceite dos Termos. Só a
 * conclusão grava a conta; "Cancelar" descarta tudo, sem usuário fantasma.
 */

export interface PendingPerson {
  name: string;
  email: string;
  avatarUrl?: string;
}

const maskPhone = (raw: string) => {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
};

/**
 * Cadastro Google aguardando conclusão (cookie httpOnly; a tela só sabe nome, e-mail e foto).
 * undefined enquanto confere, null quando não há cadastro pendente.
 */
export function usePendingGoogle(enabled: boolean): PendingPerson | null | undefined {
  const [person, setPerson] = useState<PendingPerson | null | undefined>(undefined);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/auth/google/pending", { cache: "no-store" });
        const json = (await res.json().catch(() => ({}))) as { pending?: boolean; user?: { fullName: string; email: string; avatarUrl?: string } | null };
        if (alive) setPerson(json.pending && json.user ? { name: json.user.fullName, email: json.user.email, avatarUrl: json.user.avatarUrl } : null);
      } catch {
        if (alive) setPerson(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [enabled]);
  return enabled ? person : null;
}

export function CompleteRegistration({ person, mode }: { person: PendingPerson; mode: "pending" | "session" }) {
  useThemeScope("app");
  const { refreshUser, markUnlocked, logout } = useAuth();
  const [cpf, setCpf] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState<"save" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const first = (person.name || "").trim().split(/\s+/)[0] || "tudo bem";

  async function submit(event: FormEvent) {
    event.preventDefault();
    const cleanCpf = cpf.replace(/\D/g, "");
    const cleanPhone = phone.replace(/\D/g, "");
    if (!isValidCpf(cleanCpf)) return setError("CPF inválido. Confira os 11 números.");
    if (cleanPhone.length !== 10 && cleanPhone.length !== 11) return setError("Informe o celular com DDD.");
    // A idade mínima (12 anos) é conferida no servidor, que devolve a mensagem.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return setError("Informe a sua data de nascimento.");
    if (!terms) return setError("Aceite os Termos e a Política de Privacidade para concluir.");
    setBusy("save");
    setError(null);
    try {
      const res = await fetch("/api/auth/google/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpf: cleanCpf, phone: cleanPhone, birthDate, termsAccepted: true }),
      });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) throw new Error(json.error || "Não foi possível concluir o cadastro.");
      markUnlocked();
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sem conexão. Tente de novo.");
      setBusy(null);
    }
  }

  async function cancel() {
    setBusy("cancel");
    if (mode === "session") return void logout();
    await fetch("/api/auth/google/pending", { method: "DELETE" }).catch(() => undefined);
    window.location.replace("/");
  }

  return (
    <div className="prx-app relative isolate flex min-h-dvh flex-col overflow-x-clip bg-background text-foreground selection:bg-[#6c0cf0] selection:text-white">
      <div aria-hidden className="prx-ambient" />
      <ObsidianCrystal priority sizes="(min-width: 1024px) 34vw, 60vw" className={CRYSTAL_HERO} />

      <header className="relative z-10 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-4 lg:pt-3">
        <div className="glass-bar mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 rounded-[22px] pl-4 pr-2 sm:pl-5">
          <PrxLogo variant="compact" title="PRX" className="h-6 w-auto text-ink" />
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="hidden truncate text-[14px] font-medium text-ink min-[400px]:block">{person.name}</span>
            <Avatar name={person.name || person.email} src={person.avatarUrl} size={40} />
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 pb-12 pt-8 sm:px-6 lg:pt-14">
        <p className="ob-label text-[12px] text-muted-foreground">Olá, {first}</p>
        <motion.section
          aria-labelledby="completar-title"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
          className="glass mt-6 w-full max-w-md self-center rounded-[28px] p-5 sm:p-7 lg:mt-10"
        >
          <h1 id="completar-title" className="text-[24px] font-semibold leading-tight tracking-[-0.03em] text-ink sm:text-[28px]">
            Falta pouco para entrar
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
            Confirme seu CPF, celular e data de nascimento para liberar sua conta. Nada é salvo antes disso.
          </p>
          <p className="mt-3 truncate text-[13px] text-muted-foreground">
            Google: <span className="font-medium text-ink">{person.email}</span>
          </p>

          <form onSubmit={(e) => void submit(e)} className="mt-6 space-y-4" noValidate>
            <Field label="CPF" hint="Um CPF para uma única conta PRX.">
              {(id, hint) => (
                <Input id={id} aria-describedby={hint} inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" value={cpf} onChange={(e) => setCpf(maskCpfInput(e.target.value))} required />
              )}
            </Field>
            <Field label="Celular com DDD">
              {(id) => <Input id={id} type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(11) 98888-7777" value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} required />}
            </Field>
            <Field label="Data de nascimento" hint="O PRX é para quem tem 12 anos ou mais. Menores de 18 precisam do responsável para abrir o PRX Bank.">
              {(id, hint) => <Input id={id} aria-describedby={hint} type="date" autoComplete="bday" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} required className="cursor-pointer" />}
            </Field>
            <TermsConsent checked={terms} onChange={setTerms} />
            {error && <Notice tone="error">{error}</Notice>}
            <Button type="submit" block disabled={busy !== null}>
              {busy === "save" ? "Concluindo…" : "Concluir cadastro e entrar"}
            </Button>
            <Button type="button" variant="ghost" block onClick={() => void cancel()} disabled={busy !== null}>
              {busy === "cancel" ? "Cancelando…" : "Cancelar"}
            </Button>
          </form>
        </motion.section>
      </main>
    </div>
  );
}
