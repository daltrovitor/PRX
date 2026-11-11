// Hello World
"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { motion } from "motion/react";
import { PrxLogo } from "@/components/brand/prx-logo";
import styles from "./quick-login.module.css";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { Avatar, Button, Input, Notice } from "@/components/app/ui";
import { useThemeScope } from "@/components/theme-provider";
import { useAuth } from "@/hooks/use-auth";
import type { KnownAccount } from "@/lib/known-account";
import { canUseBiometrics, registerPasskey } from "@/lib/passkeys/client";

/** E-mail parcialmente oculto: quem pega o aparelho vê de quem é a conta, não o endereço inteiro. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"•".repeat(Math.max(3, Math.min(6, local.length - visible.length)))}@${domain}`;
}

function FaceIdIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M4 8V6a2 2 0 0 1 2-2h2" />
      <path d="M16 4h2a2 2 0 0 1 2 2v2" />
      <path d="M20 16v2a2 2 0 0 1-2 2h-2" />
      <path d="M8 20H6a2 2 0 0 1-2-2v-2" />
      <path d="M9 9.5v1" />
      <path d="M15 9.5v1" />
      <path d="M12 9.5v3.5h-1" />
      <path d="M9.5 16a3.5 3.5 0 0 0 5 0" />
    </svg>
  );
}

type Step = "auth" | "offer";

/**
 * Tela de login dedicada da conta lembrada ("Lembrar de mim"), no padrão dos
 * apps de banco: foto e nome do membro, e só a senha ou a biometria/rosto.
 * Com a conta PRX BANK ativa e a sessão ainda aberta, funciona como bloqueio de
 * cada entrada no app (lib/lock.ts). Com a biometria ativada neste aparelho, o
 * pedido do rosto/digital abre sozinho.
 */
export function QuickLogin({ account, remember = true }: { account: KnownAccount; remember?: boolean }) {
  useThemeScope("app");
  const { login, loginWithPasskey, loginWithGoogle, markUnlocked, forgetAccount } = useAuth();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState<"password" | "passkey" | "google" | "register" | "switch" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [biometrics, setBiometrics] = useState(false);
  const [step, setStep] = useState<Step>("auth");
  const autoTried = useRef(false);
  const first = (account.name || "").trim().split(/\s+/)[0] || "de volta";
  const quick = account.passkey && biometrics;

  useEffect(() => {
    let alive = true;
    void canUseBiometrics().then((ok) => {
      if (alive) setBiometrics(ok);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    if (!password) return;
    setBusy("password");
    setError(null);
    // Com biometria disponível e ainda não ativada, oferece antes de entrar.
    const offer = remember && biometrics && !account.passkey;
    const result = await login(account.email, password, remember, false, { unlock: !offer });
    setBusy(null);
    if (!result.success) {
      setPassword("");
      return setError(result.error || "Senha incorreta.");
    }
    if (offer) setStep("offer");
  }

  /** `auto`: pedido aberto sozinho; se a pessoa cancelar, não mostra erro (o botão continua ali). */
  const signInWithPasskey = useCallback(
    async (auto = false) => {
      setBusy("passkey");
      setError(null);
      const result = await loginWithPasskey(account.id);
      setBusy(null);
      if (!result.success && !(auto && /cancelada/i.test(result.error || ""))) setError(result.error || "Biometria não confirmada.");
    },
    [account.id, loginWithPasskey]
  );

  // Abre a biometria assim que a tela aparece (e de novo quando o app volta ao primeiro plano).
  useEffect(() => {
    if (!quick || step !== "auth") return;
    const tryNow = () => {
      if (document.visibilityState !== "visible" || autoTried.current) return;
      autoTried.current = true;
      void signInWithPasskey(true);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") autoTried.current = false;
      tryNow();
    };
    tryNow();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [quick, step, signInWithPasskey]);

  async function enableBiometrics() {
    setBusy("register");
    setError(null);
    const result = await registerPasskey();
    setBusy(null);
    if (!result.ok) return setError(result.error);
    markUnlocked();
  }

  return (
    <div className={`${styles.screen} prx-app relative isolate flex min-h-dvh flex-col overflow-x-clip selection:bg-[#6c0cf0] selection:text-white`}>
      <div aria-hidden className={styles.orbitTop} />
      <div aria-hidden className={styles.orbitBottom} />
      <header className="relative z-10 flex h-16 items-center justify-center px-4 sm:h-20">
        <span className={styles.address}>prx.app.br</span>
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-5 pb-16 pt-8 sm:pt-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
          className="flex w-full max-w-sm flex-col items-center text-center"
        >
          <div className={styles.brand}>
            <PrxLogo variant="symbol" title="" className="mx-auto h-20 w-24 text-white" />
            <PrxLogo variant="wordmark" title="PRX" className="mt-4 h-11 w-full text-white" />
            <p className="mt-4 text-[11px] tracking-[0.55em] text-white/90">NEXT IS YOURS</p>
          </div>
          {/* Foto cadastrada no perfil da conta lembrada neste aparelho. */}
          <span className={styles.avatarRing}>
            <span className="block rounded-full bg-[#080212] p-[3px]">
              <Avatar name={account.name || account.email} src={account.avatarUrl} size={96} className="bg-[#10051e] text-white" />
            </span>
          </span>
          <h1 className="mt-5 text-[28px] font-semibold leading-tight tracking-[-0.03em] text-white sm:text-[32px]">
            {step === "offer" ? "Entre mais rápido" : `Olá, ${first}`}
          </h1>
          <p className="mt-2 text-[14px] text-[#bdb4ce]">
            {step === "offer" ? "Use o rosto ou a digital deste aparelho na próxima vez." : maskEmail(account.email)}
          </p>

          <div className={`${styles.card} mt-8 w-full space-y-4 rounded-[28px] p-5 text-left sm:p-6`}>
            {step === "offer" ? (
              <>
                <p className="text-[14px] leading-relaxed text-muted-foreground">
                  A biometria fica só no seu aparelho; a PRX guarda apenas uma chave pública para confirmar que é você.
                </p>
                <Button block onClick={() => void enableBiometrics()} disabled={busy !== null}>
                  <FaceIdIcon className="h-5 w-5" />
                  {busy === "register" ? "Ativando…" : "Ativar biometria"}
                </Button>
                <Button block variant="ghost" onClick={markUnlocked} disabled={busy !== null}>
                  Agora não
                </Button>
              </>
            ) : (
              <>
                {quick && (
                  <>
                    <Button block onClick={() => void signInWithPasskey()} disabled={busy !== null}>
                      <FaceIdIcon className="h-5 w-5" />
                      {busy === "passkey" ? "Confirmando…" : "Entrar com biometria"}
                    </Button>
                    <div className="flex items-center gap-3 text-[12px] text-muted-foreground" aria-hidden>
                      <span className="h-px flex-1 bg-line" />
                      ou
                      <span className="h-px flex-1 bg-line" />
                    </div>
                  </>
                )}
                {account.provider === "password" ? (
                  <form onSubmit={(e) => void submitPassword(e)} className="space-y-3">
                    <label htmlFor="quick-password" className="block text-[14px] font-medium text-white">
                      Senha
                    </label>
                    {/* O e-mail vai junto (oculto) para o gerenciador de senhas do navegador reconhecer a conta. */}
                    <input type="email" name="email" autoComplete="username" value={account.email} readOnly hidden />
                    <div className="relative">
                      <Input
                        id="quick-password"
                        type={showPassword ? "text" : "password"}
                        className={styles.password}
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Digite sua senha"
                      />
                      <button type="button" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} aria-pressed={showPassword} onClick={() => setShowPassword((shown) => !shown)} className="absolute inset-y-0 right-3 flex w-10 cursor-pointer items-center justify-center text-[#c1b4d4]">
                        {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                      </button>
                    </div>
                    <Button type="submit" block variant={quick ? "secondary" : "primary"} disabled={busy !== null || password.length === 0}>
                      {busy === "password" ? "Entrando…" : quick ? "Entrar com a senha" : "Entrar"}
                      <ArrowRight size={18} aria-hidden />
                    </Button>
                  </form>
                ) : (
                  <Button
                    block
                    variant="ink"
                    disabled={busy !== null}
                    onClick={() => {
                      setBusy("google");
                      void loginWithGoogle(remember, false).then((r) => {
                        setBusy(null);
                        if (!r.success) setError(r.error || "Não foi possível entrar com o Google.");
                      });
                    }}
                  >
                    {busy === "google" ? "Abrindo o Google…" : "Continuar com Google"}
                  </Button>
                )}

              </>
            )}
            {error && <Notice tone="error">{error}</Notice>}
          </div>

          <button
            type="button"
            disabled={busy !== null}
            onClick={() => {
              setBusy("switch");
              void forgetAccount();
            }}
            className={styles.switchAccount}
          >
            Entrar com outra conta
          </button>
        </motion.div>
      </main>
    </div>
  );
}
