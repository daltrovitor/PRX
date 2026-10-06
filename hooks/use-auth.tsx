// Hello World
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { CONSENT_COOKIE, TERMS_VERSION } from "@/lib/legal-version";
import { forgetKnownAccount, readKnownAccount, saveKnownAccount, unlock, updateKnownAccount } from "@/lib/known-account";
import { authenticatePasskey } from "@/lib/passkeys/client";
import { shouldRelock } from "@/lib/lock";

export interface User {
  id: string;
  email: string;
  name: string;
  role: "user" | "partner" | "staff" | "admin";
  prxScore: number;
  prxLevel: number;
  walletBalance: number;
  avatarUrl: string;
  cpf?: string;
  phone?: string;
}

type AuthResult = { success: boolean; error?: string; code?: string | null };

interface LoginOptions {
  /** false: autentica mas mantém a tela de login aberta (ex.: oferecer a biometria antes de entrar). */
  unlock?: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  /** Aba desbloqueada (senha ou biometria confirmadas desde que o app foi aberto). */
  unlocked: boolean;
  /**
   * Conta PRX BANK aberta e funcionando: a cada entrada no app (nova visita ou volta depois de
   * mais de 1 minuto fora) a tela dedicada pede senha ou biometria. Antes disso o app abre direto.
   */
  requiresUnlock: boolean;
  /** Entrou pela tela dedicada e ainda responde à oferta de biometria: ela continua aberta até a resposta. */
  offering: boolean;
  markUnlocked: () => void;
  login: (email: string, pass: string, rememberMe?: boolean, termsAccepted?: boolean, options?: LoginOptions) => Promise<AuthResult>;
  loginWithPasskey: (userId: string) => Promise<AuthResult & { missing?: boolean }>;
  /** "Entrar com outra conta": encerra a sessão e esquece a conta lembrada neste aparelho. */
  forgetAccount: () => Promise<void>;
  /** Cadastro com CPF e celular obrigatórios: só salva o usuário com dados completos. */
  signup: (fullName: string, email: string, pass: string, confirmPass: string, cpf: string, phone: string, birthDate: string, termsAccepted?: boolean) => Promise<AuthResult>;
  loginWithGoogle: (rememberMe?: boolean, termsAccepted?: boolean) => Promise<AuthResult>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const REMEMBER_KEY = "prx_remember_me";
const TAB_KEY = "prx_tab_active";
const HIDDEN_KEY = "prx_hidden_at";

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/* Acesso protegido ao storage: em aba privada ou com cookies bloqueados, falha em silêncio. */
const storage = {
  remembered: () => safe(() => localStorage.getItem(REMEMBER_KEY) === "true", false),
  tabActive: () => safe(() => sessionStorage.getItem(TAB_KEY) === "true", false),
  mark: (remember: boolean) =>
    safe(() => {
      if (remember) localStorage.setItem(REMEMBER_KEY, "true");
      else localStorage.removeItem(REMEMBER_KEY);
      sessionStorage.setItem(TAB_KEY, "true");
    }, undefined),
  clear: () =>
    safe(() => {
      localStorage.removeItem(REMEMBER_KEY);
      sessionStorage.removeItem(TAB_KEY);
    }, undefined),
};

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** Hora em que o app saiu de vista, guardada na sessão: sobrevive ao sistema descartar a aba para liberar memória. */
const hiddenStamp = {
  set: (at: number) => safe(() => sessionStorage.setItem(HIDDEN_KEY, String(at)), undefined),
  clear: () => safe(() => sessionStorage.removeItem(HIDDEN_KEY), undefined),
  /** Há quanto tempo o app está fora de vista (0 se não saiu). */
  away: () =>
    safe(() => {
      const at = Number(sessionStorage.getItem(HIDDEN_KEY));
      return at > 0 ? Date.now() - at : 0;
    }, 0),
};

interface Session {
  user: User | null;
  requiresUnlock: boolean;
}

const NO_SESSION: Session = { user: null, requiresUnlock: false };

/**
 * Resolve a sessão atual. Contas sem "lembrar de mim" encerram quando a aba
 * é fechada; administradores e parceiros nunca são deslogados automaticamente.
 */
async function resolveSession(): Promise<Session> {
  try {
    const res = await fetch("/api/auth/me", { cache: "no-store" });
    if (!res.ok) return NO_SESSION;
    const data = (await res.json()) as { user?: User | null; rememberMe?: boolean; requiresUnlock?: boolean };
    const user = data.user;
    if (!user) return NO_SESSION;

    if (user.role === "admin" || user.role === "partner") {
      storage.mark(true);
      return { user, requiresUnlock: false };
    }

    const remembered = typeof data.rememberMe === "boolean" ? data.rememberMe : storage.remembered();
    if (!remembered && !storage.tabActive() && !storage.remembered()) {
      await fetch("/api/auth/logout", { method: "POST" });
      storage.clear();
      return NO_SESSION;
    }

    storage.mark(remembered);

    // Conta do banco ativa: o app que o sistema descartou e voltou depois de muito tempo fora pede o desbloqueio de novo.
    const requiresUnlock = data.requiresUnlock === true;
    if (shouldRelock(hiddenStamp.away(), requiresUnlock)) unlock.clear();
    hiddenStamp.clear();

    // Volta da entrada com o Google: a aba fica desbloqueada e, com "lembrar de mim", a conta é lembrada.
    if (unlock.takePending()) {
      unlock.mark();
      if (remembered) saveKnownAccount({ id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl, provider: "google" });
    }
    // Mantém nome e foto da conta lembrada em dia.
    const known = readKnownAccount();
    if (known && known.id === user.id && (known.name !== user.name || known.avatarUrl !== user.avatarUrl)) {
      updateKnownAccount({ name: user.name, avatarUrl: user.avatarUrl });
    }
    return { user, requiresUnlock };
  } catch {
    return NO_SESSION;
  }
}

function rememberAccount(user: User, rememberMe: boolean, provider: "password" | "google") {
  if (rememberMe) saveKnownAccount({ id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl, provider });
  else forgetKnownAccount();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const [requiresUnlock, setRequiresUnlock] = useState(false);
  const [offering, setOffering] = useState(false);

  const markUnlocked = useCallback(() => {
    hiddenStamp.clear();
    unlock.mark();
    setUnlocked(true);
    setOffering(false);
  }, []);

  const applySession = useCallback((session: Session) => {
    setUser(session.user);
    setRequiresUnlock(session.requiresUnlock);
    setUnlocked(unlock.isUnlocked());
    setLoading(false);
  }, []);

  const refreshUser = useCallback(async () => applySession(await resolveSession()), [applySession]);

  // Bloqueio de app de banco: com a conta PRX BANK ativa, sair do PRX por mais de 1 minuto faz a volta pedir senha ou biometria.
  useEffect(() => {
    if (!user || !requiresUnlock) return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") return hiddenStamp.set(Date.now());
      const away = hiddenStamp.away();
      hiddenStamp.clear();
      if (shouldRelock(away, requiresUnlock)) {
        unlock.clear();
        setUnlocked(false);
      }
    };
    const onPageHide = () => hiddenStamp.set(Date.now());
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [user, requiresUnlock]);

  useEffect(() => {
    let active = true;
    resolveSession().then((session) => {
      if (active) applySession(session);
    });
    return () => {
      active = false;
    };
  }, [applySession]);

  const login = useCallback(async (email: string, pass: string, rememberMe = true, termsAccepted = false, options: LoginOptions = {}): Promise<AuthResult> => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: pass, rememberMe, termsAccepted }),
      });
      const data = (await res.json()) as { user?: User; error?: string };
      if (!res.ok || !data.user) return { success: false, error: data.error || "Falha no login" };
      storage.mark(rememberMe);
      rememberAccount(data.user, rememberMe, "password");
      setUser(data.user);
      if (options.unlock !== false) markUnlocked();
      else setOffering(true);
      void refreshUser();
      return { success: true };
    } catch (err) {
      return { success: false, error: errorMessage(err, "Erro de conexão") };
    }
  }, [markUnlocked, refreshUser]);

  const loginWithPasskey = useCallback(
    async (userId: string): Promise<AuthResult & { missing?: boolean }> => {
      const result = await authenticatePasskey<User>(userId);
      if (!result.ok) {
        // Biometria removida no servidor (ou em outro aparelho): a tela volta a pedir só a senha.
        if (result.missing) updateKnownAccount({ passkey: false });
        return { success: false, error: result.error, missing: result.missing };
      }
      storage.mark(true);
      updateKnownAccount({ name: result.user.name, avatarUrl: result.user.avatarUrl, passkey: true });
      setUser(result.user);
      markUnlocked();
      void refreshUser();
      return { success: true };
    },
    [markUnlocked, refreshUser]
  );

  const signup = useCallback(
    async (fullName: string, email: string, pass: string, confirmPass: string, cpf: string, phone: string, birthDate: string, termsAccepted = false): Promise<AuthResult> => {
      try {
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fullName, email, password: pass, confirmPassword: confirmPass, cpf, phone, birthDate, termsAccepted }),
        });
        const data = (await res.json()) as { user?: User; error?: string; code?: string | null };
        if (!res.ok || !data.user) return { success: false, error: data.error || "Falha ao criar conta", code: data.code ?? null };
        storage.mark(true);
        rememberAccount(data.user, true, "password");
        setUser(data.user);
        markUnlocked();
        return { success: true };
      } catch (err) {
        return { success: false, error: errorMessage(err, "Erro de conexão") };
      }
    },
    [markUnlocked]
  );

  const loginWithGoogle = useCallback(async (rememberMe = true, termsAccepted = true): Promise<AuthResult> => {
    try {
      storage.mark(rememberMe);
      if (!rememberMe) forgetKnownAccount();
      unlock.setPending();
      document.cookie = `prx_remember_pending=${rememberMe ? 1 : 0}; path=/; max-age=1800; SameSite=Lax`;
      // O aceite dos Termos/LGPD atravessa o redirecionamento do Google e é gravado no callback.
      if (termsAccepted) document.cookie = `${CONSENT_COOKIE}=${TERMS_VERSION}; path=/; max-age=1800; SameSite=Lax`;

      // Login direto pelo app: o Google mostra o endereço do PRX no lugar do endereço do Supabase.
      // Sem as chaves do Google no servidor, a rota responde { direct: false } e o fluxo segue pelo Supabase.
      const start = await fetch("/api/auth/google/start", { method: "POST" })
        .then((r) => (r.ok ? (r.json() as Promise<{ direct?: boolean; url?: string }>) : null))
        .catch(() => null);
      if (start?.direct && start.url) {
        window.location.href = start.url;
        return { success: true };
      }

      const { supabase, isUsingLiveSupabase } = await import("@/lib/supabase/client");
      if (isUsingLiveSupabase && supabase) {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: `${window.location.origin}/auth/callback`,
            queryParams: { access_type: "offline", prompt: "consent" },
          },
        });
        if (error) return { success: false, error: error.message };
        if (data?.url) window.location.href = data.url;
        return { success: true };
      }

      // Sem Supabase no navegador: fluxo simulado, disponível só em desenvolvimento local.
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rememberMe }),
      });
      const data = (await res.json()) as { user?: User; error?: string; pendingRegistration?: boolean };
      if (data.pendingRegistration) {
        // Cadastro novo: o app abre pedindo CPF, celular e o aceite antes de gravar a conta.
        window.location.replace("/");
        return { success: true };
      }
      if (!res.ok || !data.user) return { success: false, error: data.error || "Falha ao autenticar com o Google" };
      unlock.takePending();
      rememberAccount(data.user, rememberMe, "google");
      setUser(data.user);
      markUnlocked();
      return { success: true };
    } catch (err) {
      return { success: false, error: errorMessage(err, "Erro ao conectar com o Google") };
    }
  }, [markUnlocked]);

  /** Sair mantém a conta lembrada: a próxima entrada é pela tela dedicada (senha ou biometria). */
  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      storage.clear();
      unlock.clear();
      hiddenStamp.clear();
      setUnlocked(false);
      setRequiresUnlock(false);
      setOffering(false);
      setUser(null);
    }
  }, []);

  const forgetAccount = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      storage.clear();
      unlock.clear();
      forgetKnownAccount();
      hiddenStamp.clear();
      setUnlocked(false);
      setRequiresUnlock(false);
      setOffering(false);
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, unlocked, requiresUnlock, offering, markUnlocked, login, loginWithPasskey, forgetAccount, signup, loginWithGoogle, logout, refreshUser }),
    [user, loading, unlocked, requiresUnlock, offering, markUnlocked, login, loginWithPasskey, forgetAccount, signup, loginWithGoogle, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
