// Hello World
"use client";

import { useCallback, useState } from "react";
import { PanelLogin } from "@/components/admin/admin-login";
import { DashboardBackdrop, DashboardHeader } from "@/components/app/dashboard-header";
import { Button, IconButton, Notice, Segmented } from "@/components/app/ui";
import { PrxLogo } from "@/components/brand/prx-logo";
import { CircleLoader } from "@/components/ui/circle-loader";
import { IconLogout } from "@/components/icons/prx-icons";
import { ThemeToggle } from "@/components/theme-toggle";
import { useThemeScope } from "@/components/theme-provider";
import { DoorEvents } from "@/components/validation/door-events";
import { ValidationSheet, ValidatorPanel, useValidation } from "@/components/validation/validator";
import type { StaffActor } from "@/lib/staff/service";

export type StaffAuthResult = { status: "authenticated"; actor: StaffActor } | { status: "unauthenticated" } | { status: "denied"; message: string };

async function fetchStaffAuth(): Promise<StaffAuthResult> {
  try {
    const res = await fetch("/api/staff/me", { cache: "no-store" });
    const data = (await res.json()) as { authenticated?: boolean; isStaff?: boolean; user?: StaffActor; error?: string };
    if (data.isStaff && data.user) return { status: "authenticated", actor: data.user };
    if (data.authenticated) return { status: "denied", message: data.error || "Esta conta não faz parte da Equipe PRX." };
  } catch {
    // tratado como sessão ausente
  }
  return { status: "unauthenticated" };
}

/** Portal da Equipe PRX (staff.prx.app.br): valida ingressos e benefícios conforme as permissões do funcionário. */
export function StaffApp({ initial }: { initial: StaffAuthResult }) {
  useThemeScope("app");
  const [auth, setAuth] = useState<StaffAuthResult>(initial);
  const check = useCallback(() => fetchStaffAuth().then(setAuth), []);

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setAuth({ status: "unauthenticated" });
    }
  }

  if (auth.status === "unauthenticated") {
    return (
      <PanelLogin
        endpoint="/api/staff/login"
        title="Equipe PRX"
        description="Portaria dos eventos PRX LIVE e validação de benefícios PRX PASS."
        sideTitle="Confira o QR, libere a entrada."
        sideBody="Cada ingresso e cada voucher valem uma única vez. A validação aparece na hora para o membro."
        emailPlaceholder="nome@prx.com.br"
        submitLabel="Entrar"
        onSuccess={check}
      />
    );
  }

  if (auth.status === "denied") {
    return (
      <main className="prx-app isolate flex min-h-dvh flex-col items-center justify-center gap-10 bg-background px-5 py-12">
        <div aria-hidden className="prx-ambient" />
        <div className="glass w-full max-w-md space-y-6 rounded-[28px] p-6 sm:p-8">
          <PrxLogo variant="compact" title="PRX" className="h-7 w-auto text-ink" />
          <h1 className="text-3xl font-semibold leading-tight tracking-[-0.03em] text-ink">Acesso só para a Equipe PRX</h1>
          <p className="text-[15px] leading-relaxed text-muted-foreground">{auth.message}</p>
          <Button onClick={() => void logout()}>Trocar de conta</Button>
        </div>
      </main>
    );
  }

  return <StaffDashboard actor={auth.actor} onLogout={() => void logout()} />;
}

type Tab = "validar" | "eventos";

function StaffDashboard({ actor, onLogout }: { actor: StaffActor; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("validar");
  const [isTabChanging, setIsTabChanging] = useState(false);
  const validation = useValidation();
  const scope = [actor.canValidateTickets ? "ingressos de eventos" : null, actor.canValidateBenefits ? "vouchers de benefícios" : null].filter(Boolean).join(" e ");

  const handleTabChange = (newTab: Tab) => {
    if (newTab === tab) return;
    setIsTabChanging(true);
    setTab(newTab);
    setTimeout(() => setIsTabChanging(false), 200);
  };

  return (
    <div className="prx-app relative isolate min-h-dvh overflow-x-clip bg-background text-foreground">
      <div aria-hidden className="prx-ambient" />
      <DashboardBackdrop />
      <DashboardHeader
        name={actor.name}
        subtitle={actor.isAdmin ? "Administrador" : actor.email}
        area="Equipe PRX"
        actions={
          <>
            <ThemeToggle variant="app" />
            <IconButton label="Sair do portal" onClick={onLogout}>
              <IconLogout size={18} />
            </IconButton>
          </>
        }
      />

      <main className="relative z-10 mx-auto max-w-6xl space-y-8 px-4 pb-20 pt-6 sm:px-6 lg:pt-10">
        <h1 className="sr-only">Portal da Equipe PRX</h1>

        {!actor.canValidateTickets && !actor.canValidateBenefits ? (
          <Notice tone="warning">Seu acesso está sem permissões de validação. Peça ao administrador para liberar ingressos ou benefícios.</Notice>
        ) : (
          <>
            {actor.canValidateTickets && (
              <Segmented
                label="Portal da equipe"
                value={tab}
                onChange={handleTabChange}
                options={[
                  { value: "validar", label: "Validar" },
                  { value: "eventos", label: "Eventos" },
                ]}
              />
            )}
            {isTabChanging ? (
              <CircleLoader minHeight={320} label="Carregando janela..." />
            ) : (
              <>
                {tab === "validar" || !actor.canValidateTickets ? (
                  <ValidatorPanel validation={validation} hint={`Leia o QR Code do app do membro ou digite o código. Você valida ${scope}.`} />
                ) : (
                  <DoorEvents
                    endpoint="/api/staff/events"
                    refreshKey={validation.version}
                    onValidate={(code) => void validation.lookup(code)}
                    emptyBody="Eventos com “Equipe PRX valida ingressos” ligado aparecem aqui."
                  />
                )}
                <ValidationSheet validation={validation} />
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
