// Hello World
"use client";

import { isValidElement, lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import { AppShell } from "@/components/app/app-shell";
import { QuickLogin } from "@/components/auth/quick-login";
import { CompleteRegistration, usePendingGoogle } from "@/components/auth/complete-registration";
import { useFamilyState } from "@/components/family/family-client";
import { familyNotice } from "@/components/family/family-notice";
import { useKnownAccount, type KnownAccount } from "@/lib/known-account";
import { needsQuickLogin } from "@/lib/lock";
import { BootBoundary } from "@/components/brand/boot-boundary";
import { PrxLoader } from "@/components/brand/prx-loader";
import { useAuth } from "@/hooks/use-auth";
import { captureLiveLink } from "@/components/app/live/live-link";

const RevolutLanding = lazy(() => import("@/components/marketing/revolut-landing").then((m) => ({ default: m.RevolutLanding })));
const ParentShell = lazy(() => import("@/components/family/parent-shell").then((m) => ({ default: m.ParentShell })));

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
  const [boot, setBoot] = useState({ percent: 0, ready: false, error: undefined as string | undefined });
  const onBootProgress = useCallback((percent: number, ready: boolean, error?: string) => setBoot({ percent, ready, error }), []);
  // Link de divulgação do PRX LIVE: guarda o evento/cupom antes do login (inclusive pelo Google).
  useEffect(() => {
    captureLiveLink();
  }, []);

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
    // Membro logado revendo a apresentação (landing) da PRX.
    content = <RevolutLanding onBackToApp={() => setViewMode("app")} />;
  } else if (!loading) {
    // Visitante: a landing Obsidian, com Entrar e Criar conta na própria página (#entrar / #criar-conta).
    content = <RevolutLanding onEnterApp={() => setViewMode("app")} />;
  }

  const destination = isValidElement(content)
    ? content.type === AppShell ? "app" : content.type === QuickLogin ? "login" : content.type === CompleteRegistration ? "registration" : content.type === ParentShell ? "parent" : "landing"
    : "waiting";

  return (
    <>
      {!introDone && <PrxLoader ready={!loading && !checking && content !== null && boot.ready} percent={loading ? 5 : checking || content === null ? 15 : 25 + Math.floor(boot.percent * 0.75)} error={boot.error} onComplete={() => setIntroDone(true)} />}
      <div inert={!introDone} aria-hidden={!introDone} style={{ opacity: introDone ? 1 : 0, pointerEvents: introDone ? undefined : "none" }}>
        <Suspense fallback={null}>
          {content !== null && <BootBoundary key={`${user?.id ?? "guest"}:${destination}`} onProgress={onBootProgress}>{content}</BootBoundary>}
        </Suspense>
      </div>
    </>
  );
}
