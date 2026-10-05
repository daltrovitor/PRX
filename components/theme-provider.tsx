// Hello World
"use client";

import React, { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { PORTAL_LABELS } from "@/lib/domains";

type Theme = "dark" | "light";

/**
 * Dois escopos de tema com preferências independentes:
 *   landing → apresentação pública, abre no escuro;
 *   app     → dashboards (membro, admin, parceiro, equipe e Conta Pai), abrem no
 *             escuro Cyber-Luxury Obsidian. A chave mudou no redesign Obsidian
 *             (28/09/2026) para todos abrirem uma vez no tema novo.
 * O botão de tema altera só o escopo ativo. Os dashboards ativam o escopo "app"
 * ao montar (useThemeScope) e devolvem para "landing" ao desmontar.
 */
export type ThemeScope = "landing" | "app";

const KEYS: Record<ThemeScope, string> = { landing: "prx-theme", app: "prx-app-theme-obsidian" };
const DEFAULTS: Record<ThemeScope, Theme> = { landing: "dark", app: "dark" };

/** Rótulos de host dos dashboards (admin, parceiro, equipe e insider, inclusive os antigos): abrem no escopo "app". A apresentação (show.) segue "landing". */
const DASHBOARD_HOST_LABELS = [...PORTAL_LABELS.admin, ...PORTAL_LABELS.partner, ...PORTAL_LABELS.staff, ...PORTAL_LABELS.insider].join("|");

interface ThemeContextType {
  theme: Theme;
  scope: ThemeScope;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setScope: (scope: ThemeScope) => void;
  mounted: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function readTheme(scope: ThemeScope): Theme {
  try {
    const stored = localStorage.getItem(KEYS[scope]);
    if (stored === "dark" || stored === "light") return stored;
  } catch {}
  return DEFAULTS[scope];
}

function applyTheme(newTheme: Theme, scope: ThemeScope) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  root.classList.add(newTheme);
  root.setAttribute("data-theme", newTheme);
  root.setAttribute("data-theme-scope", scope);
  root.style.colorScheme = newTheme;
}

const emptySubscribe = () => () => {};

/**
 * Roda antes da hidratação. Adivinha o escopo pela URL (subdomínios de painel)
 * e pela sessão lembrada (membro logado cai direto no app), evitando piscar.
 */
export function ThemeScript() {
  const scriptContent = `
    (function() {
      var root = document.documentElement;
      try {
        var host = location.hostname, path = location.pathname;
        var app = /^(${DASHBOARD_HOST_LABELS})\\./.test(host) || /^\\/(admin|partner|staff|insider|termos|privacidade|em-breve|sou-pai|teste|showcase)(\\/|$)/.test(path)
          || /^(www\\.)?prx\\.app\\.br$/.test(host)
          || localStorage.getItem('prx_remember_me') === 'true' || sessionStorage.getItem('prx_tab_active') === 'true';
        // ?tema=obsidian (atalhos do /teste): liga o tema Obsidian dos dashboards nesta origem.
        if (/[?&]tema=obsidian(&|$)/.test(location.search)) localStorage.setItem('${KEYS.app}', 'dark');
        var stored = localStorage.getItem(app ? '${KEYS.app}' : '${KEYS.landing}');
        var theme = stored === 'dark' || stored === 'light' ? stored : (app ? '${DEFAULTS.app}' : '${DEFAULTS.landing}');
        root.classList.remove('dark', 'light');
        root.classList.add(theme);
        root.setAttribute('data-theme', theme);
        root.setAttribute('data-theme-scope', app ? 'app' : 'landing');
        root.style.colorScheme = theme;
      } catch (e) {
        root.classList.add('${DEFAULTS.landing}');
      }
    })();
  `;

  // nosemgrep: prx-dangerous-html — script estático montado só com constantes do código (chaves, temas padrão e rótulos de host), sem dado do usuário.
  return <script dangerouslySetInnerHTML={{ __html: scriptContent }} />;
}

function initialScope(): ThemeScope {
  if (typeof document === "undefined") return "landing";
  return document.documentElement.getAttribute("data-theme-scope") === "app" ? "app" : "landing";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const [scope, setScopeState] = useState<ThemeScope>(initialScope);
  const [theme, setThemeState] = useState<Theme>(() => (typeof window === "undefined" ? DEFAULTS.landing : readTheme(initialScope())));

  useEffect(() => {
    applyTheme(theme, scope);
  }, [theme, scope]);

  const setScope = useCallback((next: ThemeScope) => {
    setScopeState(next);
    setThemeState(readTheme(next));
  }, []);

  const setTheme = useCallback(
    (newTheme: Theme) => {
      setThemeState(newTheme);
      applyTheme(newTheme, scope);
      try {
        localStorage.setItem(KEYS[scope], newTheme);
      } catch {}
    },
    [scope]
  );

  const toggleTheme = useCallback(() => setTheme(theme === "dark" ? "light" : "dark"), [setTheme, theme]);

  return (
    <ThemeContext.Provider value={{ theme, scope, setTheme, toggleTheme, setScope, mounted }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    return {
      theme: DEFAULTS.landing,
      scope: "landing" as ThemeScope,
      setTheme: () => {},
      toggleTheme: () => {},
      setScope: () => {},
      mounted: false,
    };
  }
  return context;
}

/** Grava o tema dos dashboards antes de navegar até eles (ex.: botões do /teste). */
export function rememberAppTheme(theme: Theme) {
  try {
    localStorage.setItem(KEYS.app, theme);
  } catch {}
}

/** Dashboards chamam no topo: ativa o tema do app enquanto estiverem montados. */
export function useThemeScope(scope: ThemeScope) {
  const { setScope } = useTheme();
  useEffect(() => {
    setScope(scope);
    return () => setScope("landing");
  }, [scope, setScope]);
}
