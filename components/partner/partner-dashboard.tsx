// Hello World
"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardBackdrop, DashboardHeader } from "@/components/app/dashboard-header";
import { CircleLoader } from "@/components/ui/circle-loader";
import { EmptyState, IconButton, Notice, Segmented } from "@/components/app/ui";
import { IconLogout } from "@/components/icons/prx-icons";
import { ThemeToggle } from "@/components/theme-toggle";
import { ValidationSheet, ValidatorPanel, useValidation } from "@/components/validation/validator";
import { DoorEvents } from "@/components/validation/door-events";
import { PartnerContracts } from "@/components/partner/partner-contracts";
import { PartnerCompany, type PartnerProfile } from "@/components/partner/partner-company";
import { MetricsPanel } from "@/components/partners/metrics-panel";
import type { PartnerCampaignView } from "@/lib/partners/service";

export interface PartnerUser {
  id: string;
  email: string;
  name: string;
  role: string;
  avatarUrl?: string;
}

type Tab = "validar" | "eventos" | "contratos" | "metricas" | "empresa";

interface ProfileState {
  partner: PartnerProfile | null;
  missing: string[];
  error: string | null;
}

async function fetchProfile(): Promise<ProfileState> {
  try {
    const res = await fetch("/api/partner/profile", { cache: "no-store" });
    const data = (await res.json()) as { partner?: PartnerProfile; missing?: string[]; error?: string };
    if (!res.ok || !data.partner) return { partner: null, missing: [], error: data.error || "Não foi possível carregar o cadastro." };
    return { partner: data.partner, missing: data.missing ?? [], error: null };
  } catch {
    return { partner: null, missing: [], error: "Sem internet agora. Confira sua conexão e tente de novo." };
  }
}

async function fetchCampaigns(): Promise<PartnerCampaignView[]> {
  try {
    const res = await fetch("/api/partner/campaigns", { cache: "no-store" });
    const data = (await res.json()) as { campaigns?: PartnerCampaignView[] };
    return res.ok && Array.isArray(data.campaigns) ? data.campaigns : [];
  } catch {
    return [];
  }
}

export function PartnerDashboard({ user, onLogout }: { user: PartnerUser; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("validar");
  const [isTabChanging, setIsTabChanging] = useState(false);
  const [profile, setProfile] = useState<ProfileState | null>(null);
  const [campaigns, setCampaigns] = useState<PartnerCampaignView[] | null>(null);
  const validation = useValidation();

  const handleTabChange = useCallback((newTab: Tab) => {
    if (newTab === tab) return;
    setIsTabChanging(true);
    setTab(newTab);
    const timer = setTimeout(() => setIsTabChanging(false), 200);
    return () => clearTimeout(timer);
  }, [tab]);

  const refreshCampaigns = useCallback(async () => setCampaigns(await fetchCampaigns()), []);

  useEffect(() => {
    let active = true;
    Promise.all([fetchProfile(), fetchCampaigns()]).then(([p, c]) => {
      if (!active) return;
      setProfile(p);
      setCampaigns(c);
      // Contrato esperando aceite abre direto na aba de contratos.
      if (c.some((campaign) => campaign.status === "sent")) setTab("contratos");
    });
    return () => {
      active = false;
    };
  }, []);

  const pending = campaigns?.filter((c) => c.status === "sent").length ?? 0;
  const partner = profile?.partner ?? null;

  return (
    <div className="prx-app relative isolate min-h-dvh overflow-x-clip bg-background text-foreground">
      <div aria-hidden className="prx-ambient" />
      <DashboardBackdrop />
      <DashboardHeader
        name={user.name}
        subtitle={partner?.tradeName ?? user.email}
        area={partner?.tradeName ?? "Parceiros"}
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
        <h1 className="sr-only">Área do Parceiro PRX</h1>

        {profile?.error && !partner ? (
          <EmptyState title="Conta ainda sem parceiro vinculado" body={profile.error} />
        ) : (
          <>
            {partner && (partner.status === "SUSPENSO" || partner.status === "BLOQUEADO") && (
              <Notice tone="warning">A parceria está suspensa: o validador e os benefícios ficam pausados. Fale com a equipe PRX.</Notice>
            )}
            <Segmented
              label="Área do parceiro"
              value={tab}
              onChange={handleTabChange}
              options={[
                { value: "validar", label: "Validar" },
                { value: "eventos", label: "Eventos" },
                { value: "contratos", label: "Contratos", count: pending > 0 ? pending : undefined },
                { value: "metricas", label: "Métricas" },
                { value: "empresa", label: "Empresa" },
              ]}
            />

            {isTabChanging ? (
              <CircleLoader minHeight={360} label="Carregando janela..." />
            ) : (
              <>
                {tab === "validar" && (
                  <ValidatorPanel validation={validation} hint="Leia o QR Code do app do cliente ou digite o código. Vale para vouchers dos seus benefícios e ingressos dos eventos ligados a você." />
                )}
                {tab === "eventos" && (
                  <DoorEvents
                    endpoint="/api/partner/events"
                    refreshKey={validation.version}
                    onValidate={(code) => void validation.lookup(code)}
                    emptyBody="Quando a PRX ligar um evento ao seu estabelecimento, a portaria dele aparece aqui."
                  />
                )}
                <ValidationSheet validation={validation} />
                {tab === "contratos" && <PartnerContracts campaigns={campaigns} onChanged={refreshCampaigns} onCompleteProfile={() => handleTabChange("empresa")} />}
                {tab === "metricas" && <MetricsPanel endpoint="/api/partner/metrics" />}
                {tab === "empresa" &&
                  (partner ? (
                    <PartnerCompany
                      profile={partner}
                      missing={profile?.missing ?? []}
                      onSaved={(data) => {
                        setProfile({ partner: data.partner, missing: data.missing, error: null });
                        void refreshCampaigns();
                      }}
                    />
                  ) : (
                    <div className="h-32 bg-surface" aria-hidden />
                  ))}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
