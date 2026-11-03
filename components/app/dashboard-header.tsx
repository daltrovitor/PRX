// Hello World
"use client";

import type { ReactNode } from "react";
import { PrxLogo } from "@/components/brand/prx-logo";
import { Avatar } from "@/components/app/ui";
import { CRYSTAL_CORNER, ObsidianCrystal } from "@/components/obsidian/obsidian-ui";
import { cn } from "@/lib/utils";

/**
 * Cabeçalho dos painéis (admin, parceiro, equipe e Conta Pai) na identidade
 * Cyber-Luxury Obsidian: marca e área à esquerda; saudação "OI, NOME",
 * avatar com borda sutil e ações em botões redondos à direita.
 */
export function DashboardHeader({
  name,
  subtitle,
  area,
  actions,
  avatarUrl,
}: {
  name: string;
  subtitle?: string | null;
  /** Nome da área ao lado da marca ("Admin", nome do parceiro, "Conta Pai"). */
  area: string;
  actions: ReactNode;
  /** Foto da pessoa (sem ela, as iniciais). */
  avatarUrl?: string | null;
}) {
  const first = (name || "").trim().split(/\s+/)[0] || "equipe";
  return (
    <header className="sticky top-0 z-30 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-4 lg:pt-3">
      <div className="glass-bar mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 rounded-[22px] pl-3.5 pr-1.5 sm:gap-3 sm:pl-5 lg:h-[72px] lg:rounded-[26px]">
        <div className="flex min-w-0 items-center gap-3">
          <PrxLogo variant="compact" title="PRX" className="h-6 w-auto shrink-0 text-ink lg:h-7" />
          <span aria-hidden className="hidden h-6 w-px bg-line sm:block" />
          <span className="ob-label hidden truncate text-[11px] text-muted-foreground sm:block">{area}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <div className="mr-1 hidden min-w-0 text-right md:block">
            <p className="ob-label truncate text-[11px] text-ink">Oi, {first}</p>
            {subtitle && <p className="mt-0.5 max-w-[240px] truncate text-[12px] text-muted-foreground">{subtitle}</p>}
          </div>
          <Avatar name={name} src={avatarUrl} size={40} className="hidden ring-1 ring-black/10 dark:ring-white/[0.18] min-[380px]:inline-flex" />
          {actions}
        </div>
      </div>
    </header>
  );
}

/** Escultura de cristal obsidiana no canto superior direito dos painéis (no breu, maior e mais suave). */
export function DashboardBackdrop() {
  return (
    <ObsidianCrystal
      sizes="(min-width: 1024px) 40vw, 80vw"
      className={cn(CRYSTAL_CORNER, "dark:h-[360px] dark:w-[82vw] dark:opacity-60 dark:sm:h-[460px] dark:sm:w-[56vw] dark:lg:w-[40vw]")}
    />
  );
}

/** Link com aparência de botão redondo (ex.: abrir o app em outra aba). */
export const roundLinkClass =
  "glass-chip inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-ink cursor-pointer";
