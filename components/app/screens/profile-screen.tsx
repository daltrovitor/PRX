// Hello World
"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { PassData } from "@/components/app/use-pass-data";
import { useAppNav } from "@/components/app/app-nav";
import { PrxLogo } from "@/components/brand/prx-logo";
import { Avatar, Button, Notice, ProgressBar } from "@/components/app/ui";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { canUseBiometrics, registerPasskey } from "@/lib/passkeys/client";
import { readKnownAccount, updateKnownAccount } from "@/lib/known-account";
import { IconBell, IconCard, IconChevronRight, IconExternal, IconPix, IconTicket, IconUsers } from "@/components/icons/prx-icons";
import { ThemeToggle } from "@/components/theme-toggle";
import { levelProgress } from "@/lib/pass-data";
import { usePointsWallet } from "@/components/app/use-prx-stores";
import { PwaInstallGuide } from "@/components/app/pwa-install-guide";
import { promptInstall, usePwaInstall } from "@/lib/pwa-install";
import { SubscriptionsSheet } from "@/components/app/subscriptions/subscriptions-sheet";

interface ProfileScreenProps {
  pass: PassData;
  initials: string;
  onLogout: () => void;
  onViewShowcase: () => void;
  /** Avisos do app (saíram do cabeçalho e ficam aqui no Perfil). */
  noticeCount: number;
  onOpenNotices: () => void;
}

const ROLE_LABEL: Record<string, string> = {
  user: "Membro",
  partner: "Parceiro",
  staff: "Equipe",
  admin: "Administrador",
};

export function ProfileScreen({ pass, onLogout, onViewShowcase, noticeCount, onOpenNotices }: ProfileScreenProps) {
  const { go } = useAppNav();
  const { member, referralInfo } = pass;
  const { wallet } = usePointsWallet(member.id);
  const xp = wallet?.xp ?? member.prxScore ?? 0;
  const progress = levelProgress(xp);
  const [sheet, setSheet] = useState<"subscriptions" | null>(null);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header className="flex flex-col items-center gap-4 pt-2 text-center">
        <Avatar name={member.name || "Membro PRX"} src={member.avatarUrl} size={88} />
        <div className="min-w-0">
          <h1 className="ob-display truncate text-2xl text-ink sm:text-3xl">{member.name || "Membro PRX"}</h1>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {member.email} · {ROLE_LABEL[member.role] ?? "Membro"}
          </p>
        </div>
      </header>

      <section aria-label="Resumo do membro" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Nível" value={progress.level.toLocaleString("pt-BR")} />
        <Metric label="XP" value={xp.toLocaleString("pt-BR")} />
        <Metric label="PRX Coins" value={wallet ? wallet.coins.toLocaleString("pt-BR") : "—"} />
        <Metric label="Amigos" value={String(referralInfo.friendsInvitedCount)} />
      </section>

      <section aria-labelledby="profile-progress" className="space-y-3 rounded-3xl glass p-5">
        <h2 id="profile-progress" className="text-lg font-semibold tracking-[-0.02em] text-ink">
          Progresso
        </h2>
        <ProgressBar value={progress.pct} label="Progresso até o próximo nível" />
        <p className="text-sm text-muted-foreground">
          {`Mais ${progress.remaining.toLocaleString("pt-BR")} XP e você sobe para o nível ${progress.level + 1}. A régua não tem teto: hábitos, compras em parceiros e benefícios usados contam.`}
        </p>
      </section>

      <section aria-labelledby="profile-shortcuts">
        <h2 id="profile-shortcuts" className="text-lg font-semibold tracking-[-0.02em] text-ink">
          Atalhos
        </h2>
        <ul className="mt-3 space-y-2">
          <Row icon={<IconBell size={18} />} onClick={onOpenNotices} badge={noticeCount}>
            Notificações
          </Row>
          <Row icon={<IconUsers size={18} />} onClick={() => go("pass", "convidar")}>
            Convidar amigos
          </Row>
          <Row icon={<IconPix size={18} />} onClick={() => go("bank", "chaves")}>
            Minhas chaves Pix
          </Row>
          <Row icon={<IconCard size={18} />} onClick={() => go("bank", "cartoes")}>
            Cartões
          </Row>
          <Row icon={<IconTicket size={18} />} onClick={() => go("live", "ingressos")}>
            Ingressos
          </Row>
          <Row icon={<IconCard size={18} />} onClick={() => setSheet("subscriptions")}>
            Assinaturas
          </Row>
          <Row icon={<IconExternal size={18} />} onClick={onViewShowcase}>
            Conhecer o PRX
          </Row>
        </ul>
      </section>

      <SubscriptionsSheet open={sheet === "subscriptions"} onClose={() => setSheet(null)} />

      <BiometricsCard />

      <InstallAppCard />

      <section aria-labelledby="profile-appearance" className="flex items-center justify-between gap-4 rounded-3xl glass p-4 pl-5">
        <h2 id="profile-appearance" className="text-[15px] font-medium text-ink">
          Aparência
        </h2>
        <ThemeToggle variant="app" showLabel />
      </section>

      <div className="flex flex-col items-center gap-6 pt-2">
        <Button variant="danger" onClick={onLogout} className="w-full sm:w-auto">
          Sair da conta
        </Button>
        <PrxLogo variant="full" title="PRX — the next pays" className="h-8 w-auto text-ink opacity-80" />
      </div>
    </div>
  );
}

interface PasskeySummary {
  id: string;
  deviceName: string;
  createdAt: string;
  lastUsedAt: string | null;
}

const since = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "short", year: "numeric" });

/** Entrar com biometria/rosto: ativa neste aparelho e lista (ou remove) os aparelhos cadastrados. */
function BiometricsCard() {
  const { showToast } = useConfirmToast();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [passkeys, setPasskeys] = useState<PasskeySummary[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/passkeys", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { passkeys?: PasskeySummary[]; error?: string };
      if (!res.ok || !json.passkeys) throw new Error(json.error || "Não foi possível carregar.");
      setPasskeys(json.passkeys);
      if (json.passkeys.length === 0 && readKnownAccount()?.passkey) updateKnownAccount({ passkey: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sem internet agora. Confira sua conexão e tente de novo.");
      setPasskeys([]);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void canUseBiometrics().then((ok) => {
      if (alive) setSupported(ok);
    });
    void (async () => {
      if (alive) await load();
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  async function enable() {
    setBusy("enable");
    setError(null);
    const result = await registerPasskey();
    setBusy(null);
    if (!result.ok) return setError(result.error);
    if (typeof window !== "undefined") {
      localStorage.setItem("prx_bank_biometrics_accepted", "true");
    }
    showToast("success", "Biometria ativada. Na próxima visita, entre com o rosto ou a digital.");
    await load();
  }

  async function remove(id: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/auth/passkeys?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Não foi possível remover.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sem internet agora. Confira sua conexão e tente de novo.");
    } finally {
      setBusy(null);
    }
  }

  const isAccepted =
    (passkeys !== null && passkeys.length > 0) ||
    readKnownAccount()?.passkey === true ||
    (typeof window !== "undefined" && localStorage.getItem("prx_bank_biometrics_accepted") === "true");

  if (isAccepted) {
    return null;
  }

  return (
    <section aria-labelledby="profile-biometrics" className="space-y-4 rounded-3xl glass p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="profile-biometrics" className="text-lg font-semibold tracking-[-0.02em] text-ink">
            Entrar com biometria
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Rosto ou digital deste aparelho na tela de login. A biometria nunca sai do aparelho.</p>
        </div>
        {supported && (
          <Button size="sm" className="min-h-12" onClick={() => void enable()} disabled={busy !== null}>
            {busy === "enable" ? "Ativando…" : "Ativar neste aparelho"}
          </Button>
        )}
      </div>
      {supported === false && <Notice>Este navegador não oferece biometria. No celular, abra o PRX pelo navegador padrão ou pelo app instalado.</Notice>}
      {passkeys && passkeys.length > 0 && (
        <ul className="divide-y divide-line rounded-2xl bg-surface px-4">
          {passkeys.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-medium text-ink">{p.deviceName || "Aparelho"}</p>
                <p className="text-[13px] text-muted-foreground">Desde {since.format(new Date(p.createdAt)).replace(".", "")}</p>
              </div>
              <Button size="sm" variant="danger" onClick={() => void remove(p.id)} disabled={busy !== null}>
                {busy === p.id ? "Removendo…" : "Remover"}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl glass p-4 sm:p-5">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <p className="mt-1.5 font-[family-name:var(--font-light),var(--font-sans)] text-2xl font-light tracking-[-0.03em] text-ink tabular-nums">{value}</p>
    </div>
  );
}

function Row({ children, icon, onClick, badge = 0 }: { children: ReactNode; icon: ReactNode; onClick: () => void; badge?: number }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-14 w-full cursor-pointer items-center gap-3.5 rounded-3xl glass px-4 text-left text-[15px] text-ink glass-lift"
      >
        <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card text-ink">
          {icon}
        </span>
        <span className="flex-1">{children}</span>
        {badge > 0 && (
          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-[12px] font-semibold text-white" aria-label={`${badge} ${badge === 1 ? "aviso" : "avisos"}`}>
            {badge > 9 ? "9+" : badge}
          </span>
        )}
        <IconChevronRight size={18} className="text-muted-foreground" />
      </button>
    </li>
  );
}

/** Instalar o PRX na tela inicial: botão nativo quando existe; senão, o passo a passo do aparelho. */
function InstallAppCard() {
  const { installed, canPrompt, platform, browser } = usePwaInstall();
  const [guide, setGuide] = useState(false);
  if (installed) return null;
  return (
    <section aria-labelledby="profile-install" className="flex items-center justify-between gap-4 rounded-3xl glass p-4 pl-5">
      <div>
        <h2 id="profile-install" className="text-[15px] font-medium text-ink">
          App na tela inicial
        </h2>
        <p className="text-[13px] text-muted-foreground">Abra o PRX como um app, sem a barra do navegador.</p>
      </div>
      <Button
        size="sm"
        variant="secondary"
        className="min-h-12 shrink-0"
        onClick={async () => {
          if (!canPrompt || (await promptInstall()) === "unavailable") setGuide(true);
        }}
      >
        Instalar
      </Button>
      <PwaInstallGuide open={guide} onClose={() => setGuide(false)} platform={platform} browser={browser} />
    </section>
  );
}
