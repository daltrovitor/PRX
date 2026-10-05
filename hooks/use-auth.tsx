// Hello World
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { CONSENT_COOKIE, TERMS_VERSION } from "@/lib/legal-version";
import { forgetKnownAccount, readKnownAccount, saveKnownAccount, unlock, updateKnownAccount } from "@/lib/known-account";
import { authenticatePasskey } from "@/lib/passkeys/client";

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
  /**
   * Aba desbloqueada. Com uma conta lembrada neste aparelho, cada nova visita
   * abre a tela de login dedicada até a senha ou a biometria serem confirmadas.
   */
  unlocked: boolean;
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
/** Fora do app por mais que isso, com biometria ativa neste aparelho: volta pedindo o rosto/digital. */
const LOCK_AFTER_MS = 60_000;

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

/**
 * Resolve a sessão atual. Contas sem "lembrar de mim" encerram quando a aba
 * é fechada; administradores e parceiros nunca são deslogados automaticamente.
 */
async function resolveSession(): Promise<User | null> {
  try {
    const res = await fetch("/api/auth/me", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { user?: User | null; rememberMe?: boolean };
    const user = data.user;
    if (!user) return null;

    if (user.role === "admin" || user.role === "partner") {
      storage.mark(true);
      return user;
    }

    const remembered = typeof data.rememberMe === "boolean" ? data.rememberMe : storage.remembered();
    if (!remembered && !storage.tabActive() && !storage.remembered()) {
      await fetch("/api/auth/logout", { method: "POST" });
      storage.clear();
      return null;
    }

    storage.mark(remembered);

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
    return user;
  } catch {
    return null;
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

  const markUnlocked = useCallback(() => {
    unlock.mark();
    setUnlocked(true);
  }, []);

  const refreshUser = useCallback(async () => {
    setUser(await resolveSession());
    setUnlocked(unlock.isUnlocked());
    setLoading(false);
  }, []);

  // Bloqueio de app de banco: saiu do PRX por mais de 1 minuto e tem biometria aqui → a volta pede a biometria.
  useEffect(() => {
    if (!user) return;
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      const away = hiddenAt ? Date.now() - hiddenAt : 0;
      hiddenAt = 0;
      const known = readKnownAccount();
      if (away >= LOCK_AFTER_MS && known?.passkey && known.id === user.id) {
        unlock.clear();
        setUnlocked(false);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [user]);

  useEffect(() => {
    let active = true;
    resolveSession().then((sessionUser) => {
      if (!active) return;
      setUser(sessionUser);
      setUnlocked(unlock.isUnlocked());
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

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
      return { success: true };
    } catch (err) {
      return { success: false, error: errorMessage(err, "Erro de conexão") };
    }
  }, [markUnlocked]);

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
      return { success: true };
    },
    [markUnlocked]
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
      setUnlocked(false);
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
      setUnlocked(false);
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, unlocked, markUnlocked, login, loginWithPasskey, forgetAccount, signup, loginWithGoogle, logout, refreshUser }),
    [user, loading, unlocked, markUnlocked, login, loginWithPasskey, forgetAccount, signup, loginWithGoogle, logout, refreshUser]
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
