// Hello World
"use client";

import { useState, type ReactNode } from "react";
import { RevolutLanding } from "@/components/marketing/revolut-landing";
import { AppShell } from "@/components/app/app-shell";
import { QuickLogin } from "@/components/auth/quick-login";
import { CompleteRegistration, usePendingGoogle } from "@/components/auth/complete-registration";
import { ParentShell } from "@/components/family/parent-shell";
import { useFamilyState } from "@/components/family/family-client";
import { familyNotice } from "@/components/family/family-notice";
import { useKnownAccount, type KnownAccount } from "@/lib/known-account";
import { needsQuickLogin } from "@/lib/lock";
import { PrxLoader } from "@/components/brand/prx-loader";
import { useAuth } from "@/hooks/use-auth";

export default function HomePage() {
  const { user, loading, logout, unlocked, requiresUnlock, offering } = useAuth();
  const known = useKnownAccount();
  // Conta que a tela dedicada mostra: a lembrada neste aparelho ou, se o bloqueio vem de uma sessão sem conta lembrada, a da própria sessão.
  const lockAccount: KnownAccount | null =
    known && (!user || known.id === user.id)
      ? known
      : user
        ? { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl, provider: "password", passkey: false }
        : null;
  // Contas de equipe (admin, parceiro, staff) não passam pelas regras de família.
  const member = user && user.role === "user" ? user : null;
  const { state: family, unavailable: familyUnavailable } = useFamilyState(member?.id ?? null);
  // Volta do Google sem cadastro completo: nada foi gravado ainda.
  const pendingGoogle = usePendingGoogle(!loading && !user);
  const checking = !loading && !user && pendingGoogle === undefined;
  const [viewMode, setViewMode] = useState<"app" | "showcase">("app");
  const [introDone, setIntroDone] = useState(false);

  let content: ReactNode = null;

  if (checking) {
    content = null;
  } else if (!loading && !user && pendingGoogle) {
    content = <CompleteRegistration person={pendingGoogle} mode="pending" />;
  } else if (!loading && lockAccount && needsQuickLogin({ hasKnownAccount: Boolean(known), hasSession: Boolean(user), requiresUnlock, unlocked, offering })) {
    // Conta lembrada sem sessão, ou conta PRX BANK ativa a cada entrada no app: a tela de login dedicada (senha ou biometria).
    content = <QuickLogin account={lockAccount} remember={lockAccount === known} />;
  } else if (!loading && member && !family && !familyUnavailable) {
    // Carregando a situação da conta na família (tipo e pendências).
    content = null;
  } else if (!loading && member && !family?.identity && (!member.cpf || !member.phone)) {
    // Conta antiga sem CPF/celular (fora das contas de família, que guardam o CPF na identidade).
    content = <CompleteRegistration person={{ name: member.name, email: member.email, avatarUrl: member.avatarUrl }} mode="session" />;
  } else if (!loading && member && family?.identity?.accountType === "parent") {
    content = <ParentShell user={member} onLogout={() => void logout()} />;
  } else if (!loading && user && viewMode === "app") {
    content = <AppShell user={user} onLogout={() => void logout()} onViewShowcase={() => setViewMode("showcase")} notice={familyNotice(family)} />;
  } else if (!loading && user) {
    // Membro logado revendo a apresentação (landing) do PRX.
    content = <RevolutLanding onBackToApp={() => setViewMode("app")} />;
  } else if (!loading) {
    // Visitante: a landing Obsidian, com Entrar e Criar conta na própria página (#entrar / #criar-conta).
    content = <RevolutLanding onEnterApp={() => setViewMode("app")} />;
  }

  return (
    <>
      {!introDone && <PrxLoader ready={!loading && !checking} onComplete={() => setIntroDone(true)} />}
      {content}
    </>
  );
}
