// Hello World
"use client";

import { useCallback, useState } from "react";
import { PanelLogin } from "@/components/admin/admin-login";
import { DashboardBackdrop, DashboardHeader } from "@/components/app/dashboard-header";
import { Button, IconButton } from "@/components/app/ui";
import { InsiderProfileCard } from "@/components/insider/insider-profile";
import { InsiderSignupForm } from "@/components/insider/insider-signup";
import { InsiderDashboard } from "@/components/insider/insider-dashboard";
import { PrxLogo } from "@/components/brand/prx-logo";
import { IconLogout } from "@/components/icons/prx-icons";
import { ThemeToggle } from "@/components/theme-toggle";
import { useThemeScope } from "@/components/theme-provider";
import type { InsiderAuthResult } from "@/lib/resenha/session";

async function fetchAuth(): Promise<InsiderAuthResult> {
  try {
    const res = await fetch("/api/insider/me", { cache: "no-store" });
    return (await res.json()) as InsiderAuthResult;
  } catch {
    return { status: "unauthenticated" };
  }
}

/** Portal dos Insiders (insider.<domínio>): cada um libera ou recusa só quem chegou pelo próprio link. */
export function InsiderApp({ initial }: { initial: InsiderAuthResult }) {
  useThemeScope("app");
  const [auth, setAuth] = useState<InsiderAuthResult>(initial);
  const [signingUp, setSigningUp] = useState(false);
  const refresh = useCallback(() => fetchAuth().then(setAuth), []);

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setAuth({ status: "unauthenticated" });
    }
  }

  if (auth.status === "unauthenticated" && signingUp) {
    return (
      <PanelLogin
        endpoint="/api/insider/login"
        title="Seja Insider"
        description="Mande seus dados: a equipe PRX aprova e o acesso ao portal abre."
        sideTitle="Sua conta vale nos dois lados."
        sideBody="O mesmo e-mail e a mesma senha entram no app como membro e no portal como Insider. A sua foto já vai para o seu perfil."
        emailPlaceholder="voce@email.com"
        submitLabel="Entrar"
        onSuccess={() => void refresh()}
      >
        <InsiderSignupForm onBack={() => setSigningUp(false)} />
      </PanelLogin>
    );
  }

  if (auth.status === "unauthenticated") {
    return (
      <PanelLogin
        endpoint="/api/insider/login"
        title="Insider"
        description="Seu link, seus PASSes e os pedidos que chegaram por ele."
        sideTitle="A lista é sua."
        sideBody="Quem chega pelo seu link espera a sua resposta. Libere quem você quer na festa, até acabarem os seus PASSes."
        emailPlaceholder="voce@email.com"
        submitLabel="Entrar"
        onSuccess={() => void refresh()}
        footer={
          <button type="button" onClick={() => setSigningUp(true)} className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-xl bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-line">
            Quero ser Insider: cadastrar
          </button>
        }
      />
    );
  }

  if (auth.status === "denied") {
    return (
      <main className="prx-app isolate flex min-h-dvh flex-col items-center justify-center gap-10 bg-background px-5 py-12">
        <div aria-hidden className="prx-ambient" />
        <div className="glass w-full max-w-md space-y-6 rounded-[28px] p-6 sm:p-8">
          <PrxLogo variant="compact" title="PRX" className="h-7 w-auto text-ink" />
          <h1 className="text-3xl font-semibold leading-tight tracking-[-0.03em] text-ink">Acesso só para Insiders</h1>
          <p className="text-[15px] leading-relaxed text-muted-foreground">{auth.message}</p>
          <Button onClick={() => void logout()}>Trocar de conta</Button>
        </div>
      </main>
    );
  }

  return (
    <div className="prx-app relative isolate min-h-dvh overflow-x-clip bg-background text-foreground">
      <div aria-hidden className="prx-ambient" />
      <DashboardBackdrop />
      <DashboardHeader
        name={auth.insider.name}
        subtitle={auth.insider.handle ? `@${auth.insider.handle}` : auth.insider.email}
        area="Insider"
        avatarUrl={auth.insider.avatarUrl}
        actions={
          <>
            <ThemeToggle variant="app" />
            <IconButton label="Sair do portal" onClick={() => void logout()}>
              <IconLogout size={18} />
            </IconButton>
          </>
        }
      />
      <main className="relative z-10 mx-auto max-w-3xl space-y-6 px-4 pb-20 pt-6 sm:px-6 lg:pt-10">
        <h1 className="sr-only">Portal do Insider</h1>
        <InsiderProfileCard insider={auth.insider} onSaved={refresh} />
        <InsiderDashboard editions={auth.editions} onChanged={refresh} />
      </main>
    </div>
  );
}
