// Hello World
"use client";

import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, CalendarDays, CreditCard, Eye, EyeOff, Loader2, Lock, Mail, Smartphone, User } from "lucide-react";
import { TermsConsent } from "@/components/auth/terms-consent";
import { PasswordChecklist } from "@/components/auth/password-checklist";
import { PASSWORD_MISMATCH, passwordProblem } from "@/lib/password-policy";
import { useAuth } from "@/hooks/use-auth";
import { CONSENT_REQUIRED_MESSAGE } from "@/lib/legal-version";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { maskCpfInput } from "@/lib/cpf-mask";
import { isValidCpf } from "@/lib/partners/documents";
import { LIQUID, Reveal, SectionHeading, Specular } from "./landing-kit";

const maskPhone = (raw: string) => {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
};

/*
 * Acesso à plataforma dentro da própria landing (rota principal "/"): Entrar e
 * Criar conta no mesmo cartão de vidro, com o aceite dos Termos (LGPD) liberando
 * os botões, "Lembrar de mim" e o atalho do Google. Os links #entrar e
 * #criar-conta (cabeçalho, planos, chamada final) escolhem a aba e rolam até aqui.
 */

type AuthMode = "login" | "signup";
type Feedback = { kind: "error" | "success"; text: string } | null;

const MODES: ReadonlyArray<{ id: AuthMode; label: string }> = [
  { id: "login", label: "Entrar" },
  { id: "signup", label: "Criar conta" },
];

const FIELD =
  "h-12 w-full rounded-[14px] border border-[var(--rv-line)] bg-[var(--rv-soft)] pl-11 pr-4 text-[16px] text-[var(--rv-ink)] placeholder:text-[var(--rv-muted)] transition-colors focus:border-[#7c3aed] focus:outline-none focus:ring-4 focus:ring-[#7c3aed]/15";

function Field({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="relative">
      <span aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--rv-muted)]">
        {icon}
      </span>
      {children}
    </div>
  );
}

/** Lê #entrar / #criar-conta: no carregamento e em cada clique de link que aponte para eles. */
function useModeFromLinks(setMode: (mode: AuthMode) => void) {
  useEffect(() => {
    const modeOf = (hash: string): AuthMode | null => (hash === "#criar-conta" ? "signup" : hash === "#entrar" ? "login" : null);
    const initial = modeOf(window.location.hash);
    let timer = 0;
    if (initial) {
      setMode(initial);
      // Espera a página montar (palco fixo, imagens) antes de rolar até o cartão.
      timer = window.setTimeout(() => document.getElementById(initial === "signup" ? "criar-conta" : "entrar")?.scrollIntoView({ block: "start" }), 350);
    }
    const onClick = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement)) return;
      const mode = modeOf(new URL(link.href).hash);
      if (mode) setMode(mode);
    };
    document.addEventListener("click", onClick, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("click", onClick, true);
    };
  }, [setMode]);
}

export function AuthSection({ onAuthenticated }: { onAuthenticated?: () => void }) {
  const { login, signup, loginWithGoogle, user, logout } = useAuth();
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [signupStep, setSignupStep] = useState<1 | 2>(1);
  const [cpf, setCpf] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const ids = { name: useId(), email: useId(), password: useId(), confirm: useId(), cpf: useId(), phone: useId(), birth: useId(), birthHint: useId(), status: useId() };

  useModeFromLinks(setMode);

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setSignupStep(1);
    setFeedback(null);
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!termsAccepted) return setFeedback({ kind: "error", text: CONSENT_REQUIRED_MESSAGE });

    if (mode === "signup" && signupStep === 1) {
      if (name.trim().split(/\s+/).length < 2) {
        return setFeedback({ kind: "error", text: "Informe seu nome completo, com sobrenome." });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return setFeedback({ kind: "error", text: "Informe um e-mail válido." });
      }
      const weak = passwordProblem(password);
      if (weak) return setFeedback({ kind: "error", text: weak });
      if (password !== confirmPassword) return setFeedback({ kind: "error", text: PASSWORD_MISMATCH });
      setFeedback(null);
      setSignupStep(2);
      return;
    }

    if (mode === "signup" && signupStep === 2) {
      const cleanCpf = cpf.replace(/\D/g, "");
      const cleanPhone = phone.replace(/\D/g, "");
      if (!isValidCpf(cleanCpf)) {
        return setFeedback({ kind: "error", text: "CPF inválido. Confira os 11 números digitados." });
      }
      if (cleanPhone.length !== 10 && cleanPhone.length !== 11) {
        return setFeedback({ kind: "error", text: "Celular inválido. Informe o número com DDD." });
      }
      // A idade mínima (12 anos) é conferida no servidor, que devolve a mensagem.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
        return setFeedback({ kind: "error", text: "Informe a sua data de nascimento." });
      }
    }

    setFeedback(null);
    setLoading(true);
    try {
      const cleanCpf = cpf.replace(/\D/g, "");
      const cleanPhone = phone.replace(/\D/g, "");
      const res =
        mode === "login"
          ? await login(email, password, rememberMe, termsAccepted)
          : await signup(name, email, password, confirmPassword, cleanCpf, cleanPhone, birthDate, termsAccepted);
      if (res.success) {
        setFeedback({ kind: "success", text: mode === "login" ? "Login realizado. Bem-vindo de volta!" : "Conta criada. Bem-vindo ao PRX!" });
        window.setTimeout(() => onAuthenticated?.(), 400);
      } else {
        setFeedback({ kind: "error", text: res.error || (mode === "login" ? "Credenciais incorretas. Verifique seu e-mail e senha." : "Não foi possível criar a conta.") });
      }
    } catch (err) {
      setFeedback({ kind: "error", text: errorMessage(err) || "Erro ao conectar com o servidor." });
    } finally {
      setLoading(false);
    }
  }

  async function google() {
    setFeedback(null);
    setGoogleLoading(true);
    try {
      const res = await loginWithGoogle(rememberMe, true);
      // Com sucesso, o navegador vai para a tela de contas do Google: o carregando fica ativo.
      if (!res.success) {
        setFeedback({ kind: "error", text: res.error || "Falha ao autenticar com o Google." });
        setGoogleLoading(false);
      }
    } catch (err) {
      setFeedback({ kind: "error", text: errorMessage(err) || "Erro de conexão com o Google." });
      setGoogleLoading(false);
    }
  }

  return (
    <section id="acesso" aria-labelledby="acesso-title" className="relative scroll-mt-24 overflow-hidden bg-[var(--rv-bg)] px-5 py-20 sm:px-8 sm:py-28">
      {/* Âncoras de rolagem das duas abas (o cabeçalho aponta para elas). */}
      <span id="entrar" aria-hidden className="absolute top-0 block scroll-mt-24" />
      <span id="criar-conta" aria-hidden className="absolute top-0 block scroll-mt-24" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(44rem_30rem_at_78%_45%,var(--rv-haze),transparent_70%)]" />

      <div className="relative mx-auto grid max-w-[1200px] items-center gap-12 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-6">
          <SectionHeading
            id="acesso-title"
            align="left"
            title="Entre no PRX."
            accent="Ou crie sua conta agora."
            lead="Acesse sua carteira de benefícios, seu saldo e seus ingressos. Ainda não tem conta? Bastam nome, e-mail e senha; documentos só quando você ativar o PRX Bank."
          />
          <ul className="mt-8 space-y-3 text-[15px] text-[var(--rv-body)]">
            {["Pix 24/7 sem tarifa e cartão sem anuidade", "PRX Coins desde a primeira compra em parceiro", "Entrada com biometria no próximo acesso"].map((item, i) => (
              <li key={item}>
                <Reveal index={i} className="flex items-center gap-3">
                  <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#7c3aed] dark:bg-[#9468fa]" />
                  {item}
                </Reveal>
              </li>
            ))}
          </ul>
        </div>

        <Reveal className="lg:col-span-6" amount={0.2}>
          <div className={cn("relative mx-auto w-full max-w-[480px] overflow-hidden rounded-[30px] p-6 sm:p-8", LIQUID.surface)}>
            <Specular />

            {user ? (
              <div className="relative space-y-4 text-center">
                <p className="text-[15px] text-[var(--rv-body)]">
                  Sessão ativa como <strong className="text-[var(--rv-ink)]">{user.name}</strong>
                </p>
                <button
                  type="button"
                  onClick={() => onAuthenticated?.()}
                  className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-[#7c3aed] px-6 text-[15px] font-semibold text-white transition-colors hover:bg-[#6d28d9]"
                >
                  Ir para o app <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-full text-[14px] font-medium text-[var(--rv-muted)] transition-colors hover:text-[var(--rv-ink)]"
                >
                  Sair da conta
                </button>
              </div>
            ) : (
              <div className="relative">
                {/* Seletor Entrar / Criar conta: a pílula desliza entre as abas (layoutId). */}
                <div role="tablist" aria-label="Acesso" className="grid grid-cols-2 gap-1 rounded-full border border-[var(--rv-line)] bg-[var(--rv-soft)] p-1">
                  {MODES.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      role="tab"
                      aria-selected={mode === m.id}
                      onClick={() => switchMode(m.id)}
                      className={cn(
                        "relative min-h-12 cursor-pointer rounded-full text-[14px] font-semibold transition-colors",
                        mode === m.id ? "text-white" : "text-[var(--rv-body)] hover:text-[var(--rv-ink)]",
                      )}
                    >
                      {mode === m.id && (
                        <motion.span layoutId="auth-mode-pill" className="absolute inset-0 rounded-full bg-[#7c3aed]" transition={{ type: "spring", stiffness: 300, damping: 28 }} />
                      )}
                      <span className="relative">{m.label}</span>
                    </button>
                  ))}
                </div>

                <form onSubmit={submit} className="mt-6 space-y-3" noValidate>
                  {mode === "signup" && signupStep === 2 ? (
                    <div className="space-y-3">
                      <div className="pb-1">
                        <p className="text-[14px] font-semibold text-[var(--rv-ink)]">Finalizar cadastro</p>
                        <p className="text-[12px] text-[var(--rv-muted)]">Informe seu CPF e celular para ativar sua conta.</p>
                      </div>

                      <label htmlFor={ids.cpf} className="sr-only">
                        CPF
                      </label>
                      <Field icon={<CreditCard className="h-4 w-4" />}>
                        <input
                          id={ids.cpf}
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          required
                          value={cpf}
                          onChange={(e) => setCpf(maskCpfInput(e.target.value))}
                          placeholder="000.000.000-00 (CPF)"
                          suppressHydrationWarning
                          className={FIELD}
                        />
                      </Field>

                      <label htmlFor={ids.phone} className="sr-only">
                        Celular com DDD
                      </label>
                      <Field icon={<Smartphone className="h-4 w-4" />}>
                        <input
                          id={ids.phone}
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          required
                          value={phone}
                          onChange={(e) => setPhone(maskPhone(e.target.value))}
                          placeholder="(11) 98888-7777 (Celular)"
                          suppressHydrationWarning
                          className={FIELD}
                        />
                      </Field>

                      <label htmlFor={ids.birth} className="sr-only">
                        Data de nascimento
                      </label>
                      <Field icon={<CalendarDays className="h-4 w-4" />}>
                        <input
                          id={ids.birth}
                          type="date"
                          autoComplete="bday"
                          required
                          value={birthDate}
                          onChange={(e) => setBirthDate(e.target.value)}
                          aria-describedby={ids.birthHint}
                          suppressHydrationWarning
                          className={FIELD}
                        />
                      </Field>
                      <p id={ids.birthHint} className="px-1 text-[12px] leading-relaxed text-[var(--rv-muted)]">
                        Data de nascimento. O PRX é para quem tem 12 anos ou mais; quem tem menos de 18 precisa do responsável para abrir o PRX Bank.
                      </p>

                      <p
                        id={ids.status}
                        role="status"
                        aria-live="polite"
                        className={cn("min-h-5 text-[13px]", feedback?.kind === "error" ? "text-[#dc2626] dark:text-[#f87171]" : "text-[#047857] dark:text-[#34d399]")}
                      >
                        {feedback?.text}
                      </p>

                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setSignupStep(1)}
                          disabled={loading}
                          className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-[var(--rv-line)] bg-[var(--rv-soft)] px-5 text-[14px] font-medium text-[var(--rv-ink)] transition-colors hover:bg-[var(--rv-line)]/50 disabled:opacity-50"
                        >
                          <ArrowLeft className="h-4 w-4" /> Voltar
                        </button>
                        <button
                          type="submit"
                          disabled={loading}
                          className="group/lux relative inline-flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-full bg-[#7c3aed] px-6 text-[15px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_10px_28px_-10px_rgba(124,58,237,0.8)] transition-[background-color,transform] hover:bg-[#6d28d9] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
                        >
                          {loading ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" /> Concluindo…
                            </>
                          ) : (
                            <>
                              Concluir cadastro PRX
                              <ArrowRight className="h-4 w-4 transition-transform group-hover/lux:translate-x-0.5" />
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <AnimatePresence initial={false}>
                        {mode === "signup" && (
                          <motion.div
                            key="name"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ type: "spring", stiffness: 300, damping: 34 }}
                            className="overflow-hidden"
                          >
                            <label htmlFor={ids.name} className="sr-only">
                              Nome completo
                            </label>
                            <Field icon={<User className="h-4 w-4" />}>
                              <input
                                id={ids.name}
                                type="text"
                                autoComplete="name"
                                required
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Nome completo"
                                suppressHydrationWarning
                                className={FIELD}
                              />
                            </Field>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <label htmlFor={ids.email} className="sr-only">
                        E-mail
                      </label>
                      <Field icon={<Mail className="h-4 w-4" />}>
                        <input
                          id={ids.email}
                          type="email"
                          inputMode="email"
                          autoComplete="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="Seu e-mail"
                          suppressHydrationWarning
                          className={FIELD}
                        />
                      </Field>

                      <label htmlFor={ids.password} className="sr-only">
                        Senha
                      </label>
                      <Field icon={<Lock className="h-4 w-4" />}>
                        <input
                          id={ids.password}
                          type={showPassword ? "text" : "password"}
                          autoComplete={mode === "login" ? "current-password" : "new-password"}
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Senha"
                          suppressHydrationWarning
                          className={cn(FIELD, "pr-12")}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                          className="absolute right-0 top-1/2 inline-flex h-12 w-12 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-[var(--rv-muted)] transition-colors hover:text-[var(--rv-ink)]"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </Field>

                      {mode === "signup" && (
                        <>
                          <label htmlFor={ids.confirm} className="sr-only">
                            Confirmar senha
                          </label>
                          <Field icon={<Lock className="h-4 w-4" />}>
                            <input
                              id={ids.confirm}
                              type={showPassword ? "text" : "password"}
                              autoComplete="new-password"
                              required
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              placeholder="Confirmar senha"
                              suppressHydrationWarning
                              className={FIELD}
                            />
                          </Field>
                          <PasswordChecklist password={password} confirm={confirmPassword} className="px-1 text-[var(--rv-body)]" />
                        </>
                      )}

                      <div className="flex items-center justify-between gap-3 pt-1">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={rememberMe}
                          onClick={() => setRememberMe((v) => !v)}
                          className="inline-flex min-h-12 cursor-pointer items-center gap-2.5 text-[13px] text-[var(--rv-body)]"
                        >
                          <span aria-hidden className={cn("flex h-5 w-9 items-center rounded-full p-0.5 transition-colors", rememberMe ? "bg-[#7c3aed]" : "bg-[var(--rv-line)]")}>
                            <motion.span layout transition={{ type: "spring", stiffness: 300, damping: 28 }} className={cn("h-4 w-4 rounded-full bg-white shadow-sm", rememberMe && "ml-auto")} />
                          </span>
                          Lembrar de mim
                        </button>
                        {mode === "login" && (
                          <button
                            type="button"
                            onClick={() => setForgotOpen((v) => !v)}
                            aria-expanded={forgotOpen}
                            className="inline-flex min-h-12 cursor-pointer items-center text-[13px] text-[var(--rv-muted)] transition-colors hover:text-[#7c3aed] dark:hover:text-[#b69cfb]"
                          >
                            Esqueceu a senha?
                          </button>
                        )}
                      </div>
                      {forgotOpen && mode === "login" && (
                        <p className="rounded-[14px] bg-[var(--rv-soft)] px-4 py-3 text-[13px] leading-relaxed text-[var(--rv-body)]">
                          A redefinição de senha é feita pelo suporte PRX. Se o aparelho já tem biometria cadastrada, entre com ela na próxima tela de acesso.
                        </p>
                      )}

                      <TermsConsent
                        checked={termsAccepted}
                        onChange={(value) => {
                          setTermsAccepted(value);
                          if (value) setFeedback(null);
                        }}
                      />

                      <p
                        id={ids.status}
                        role="status"
                        aria-live="polite"
                        className={cn("min-h-5 text-[13px]", feedback?.kind === "error" ? "text-[#dc2626] dark:text-[#f87171]" : "text-[#047857] dark:text-[#34d399]")}
                      >
                        {feedback?.text}
                      </p>

                      <button
                        type="submit"
                        disabled={loading || !termsAccepted}
                        className="group/lux relative inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-full bg-[#7c3aed] px-6 text-[15px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_10px_28px_-10px_rgba(124,58,237,0.8)] transition-[background-color,transform] hover:bg-[#6d28d9] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
                      >
                        {loading ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" /> Processando…
                          </>
                        ) : (
                          <>
                            {mode === "login" ? "Entrar no PRX" : "Continuar"}
                            <ArrowRight className="h-4 w-4 transition-transform group-hover/lux:translate-x-0.5" />
                          </>
                        )}
                      </button>
                    </>
                  )}
                </form>

                {signupStep === 1 && (
                  <>
                    <div className="my-5 flex items-center gap-3 text-[12px] text-[var(--rv-muted)]">
                      <span className="h-px flex-1 bg-[var(--rv-line)]" />
                      ou continue com
                      <span className="h-px flex-1 bg-[var(--rv-line)]" />
                    </div>

                    <button
                      type="button"
                      onClick={() => void google()}
                      disabled={loading || googleLoading}
                      className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2.5 rounded-full border border-[var(--rv-line)] bg-[var(--rv-soft)] px-6 text-[14px] font-semibold text-[var(--rv-ink)] transition-colors hover:border-[#7c3aed]/40 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {googleLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <svg aria-hidden className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                          <path d="M12.24 10.285V13.4h6.887C18.2 16.14 15.645 18 12.24 18c-3.315 0-6-2.685-6-6s2.685-6 6-6c1.455 0 2.785.525 3.82 1.39l2.405-2.405C16.92 3.55 14.73 2.6 12.24 2.6 7.07 2.6 2.88 6.79 2.88 12s4.19 9.4 9.36 9.4c5.4 0 8.98-3.79 8.98-9.14 0-.61-.06-1.22-.17-1.975H12.24z" />
                        </svg>
                      )}
                      {googleLoading ? "Redirecionando para o Google…" : mode === "login" ? "Continuar com o Google" : "Cadastrar com o Google"}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
