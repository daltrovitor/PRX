// Hello World
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { captureLiveLink, peekLiveLink } from "@/components/app/live/live-link";

export type AppTab = "home" | "pass" | "reels" | "bank" | "live" | "founders" | "profile";

const TABS: ReadonlyArray<AppTab> = ["home", "pass", "reels", "bank", "live", "founders", "profile"];

interface AppNavState {
  tab: AppTab;
  /** Sub-seção da aba (ex.: "pix" em #bank/pix). */
  sub: string | null;
  go: (tab: AppTab, sub?: string | null) => void;
}

const AppNavContext = createContext<AppNavState | null>(null);

function parseHash(hash: string): { tab: AppTab; sub: string | null } {
  const [rawTab, rawSub] = hash.replace(/^#/, "").split("/");
  const tab = (TABS as ReadonlyArray<string>).includes(rawTab) ? (rawTab as AppTab) : "home";
  // O Founders saiu do PRX LIVE e virou aba própria: links antigos (#live/founders) continuam valendo.
  if (tab === "live" && rawSub === "founders") return { tab: "founders", sub: null };
  return { tab, sub: rawSub ? decodeURIComponent(rawSub) : null };
}

/**
 * Navegação do app com rotas ocultas: todo o roteamento é mantido em estado
 * interno do cliente e o navegador permanece na raiz ("/") sem exibir parâmetros,
 * subpastas ou hash na barra de endereços.
 */
export function AppNavProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ tab: AppTab; sub: string | null }>({ tab: "home", sub: null });

  useEffect(() => {
    const sync = (opening: boolean) => {
      // Link de divulgação de evento (?evento=…&cupom=…): só ao abrir o app (ou ao chegar pela URL) leva ao PRX LIVE.
      const captured = captureLiveLink();
      if ((opening || captured) && peekLiveLink()) {
        setState({ tab: "live", sub: null });
        return;
      }
      if (window.location.hash) {
        setState(parseHash(window.location.hash));
        try {
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
        } catch {}
      }
    };
    sync(true);
    const onHash = () => sync(false);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = useCallback((tab: AppTab, sub: string | null = null) => {
    setState(tab === "live" && sub === "founders" ? { tab: "founders", sub: null } : { tab, sub });
    if (window.location.hash) {
      try {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      } catch {}
    }
  }, []);

  const value = useMemo(() => ({ ...state, go }), [state, go]);
  return <AppNavContext.Provider value={value}>{children}</AppNavContext.Provider>;
}

export function useAppNav(): AppNavState {
  const ctx = useContext(AppNavContext);
  if (!ctx) throw new Error("useAppNav precisa estar dentro de <AppNavProvider>");
  return ctx;
}
