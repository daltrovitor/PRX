// Hello World
"use client";

import type { ReactNode } from "react";
import { PrxLogo } from "@/components/brand/prx-logo";
import { useThemeScope } from "@/components/theme-provider";

/** Moldura das páginas públicas da Resenha (link do Insider e página do convidado): celular primeiro, identidade Obsidian. */
export function ResenhaShell({ children }: { children: ReactNode }) {
  useThemeScope("app");
  return (
    <main className="prx-app relative isolate flex min-h-dvh flex-col items-center justify-center overflow-x-clip bg-background px-4 py-10 text-foreground sm:px-6">
      <div aria-hidden className="prx-ambient" />
      <div className="relative z-10 w-full max-w-md space-y-6">
        <PrxLogo variant="compact" title="PRX" className="h-6 w-auto text-ink" />
        {children}
      </div>
    </main>
  );
}
