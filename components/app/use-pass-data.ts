// Hello World
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@/hooks/use-auth";
import type { Benefit, PassMission, ReferralInfo, UserVoucher } from "@/lib/pass-data";
import { reloadPoints } from "@/components/app/use-prx-stores";

interface PassDataResponse {
  success?: boolean;
  benefits?: Benefit[];
  missions?: PassMission[];
  vouchers?: UserVoucher[];
  referralInfo?: ReferralInfo | null;
  currentUser?: { name?: string; prxLevel?: number; prxScore?: number; walletBalance?: number } | null;
  error?: string;
}

export interface PassData {
  member: User;
  benefits: Benefit[];
  missions: PassMission[];
  vouchers: UserVoucher[];
  referralInfo: ReferralInfo;
  loaded: boolean;
  refresh: () => Promise<void>;
  redeem: (benefit: Benefit) => Promise<{ ok: true; voucher: UserVoucher } | { ok: false; error: string }>;
  applyScore: (score: number, level: number) => void;
}

/** Intervalo de atualização enquanto há voucher aguardando validação no balcão. */
const ACTIVE_VOUCHER_POLL_MS = 20_000;

/**
 * Estado do PRX PASS (benefícios, vouchers, missões e indicação) compartilhado
 * pelas telas Início e Pass. A sincronização contínua só acontece quando o
 * usuário tem voucher ativo e a aba está visível — é o único caso em que outra
 * pessoa (o parceiro) muda o estado — e ao voltar o foco para o app.
 */
async function fetchPassData(): Promise<PassDataResponse | null> {
  try {
    const res = await fetch("/api/pass/data", { cache: "no-store" });
    const data = (await res.json()) as PassDataResponse;
    return res.ok && data.success ? data : null;
  } catch {
    // Rede instável: mantém o último estado e tenta de novo no próximo ciclo.
    return null;
  }
}

type MemberOverrides = Partial<Pick<User, "name" | "prxLevel" | "prxScore" | "walletBalance">>;

export function usePassData(user: User): PassData {
  const [overrides, setOverrides] = useState<MemberOverrides>({});
  const [benefits, setBenefits] = useState<Benefit[]>([]);
  const [missions, setMissions] = useState<PassMission[]>([]);
  const [vouchers, setVouchers] = useState<UserVoucher[]>([]);
  const [referralInfo, setReferralInfo] = useState<ReferralInfo | null>(null);
  const [loaded, setLoaded] = useState(false);

  // O usuário da sessão é a base; os dados mais recentes do servidor (XP, nível) sobrepõem.
  const member = useMemo<User>(() => ({ ...user, ...overrides }), [user, overrides]);

  const apply = useCallback((data: PassDataResponse | null) => {
    setLoaded(true);
    if (!data) return;
    if (Array.isArray(data.benefits)) setBenefits(data.benefits);
    if (Array.isArray(data.missions)) setMissions(data.missions);
    if (Array.isArray(data.vouchers)) setVouchers(data.vouchers);
    if (data.referralInfo) setReferralInfo(data.referralInfo);
    const current = data.currentUser;
    if (current) {
      setOverrides((prev) => ({
        ...prev,
        ...(current.name ? { name: current.name } : {}),
        ...(typeof current.prxLevel === "number" ? { prxLevel: current.prxLevel } : {}),
        ...(typeof current.prxScore === "number" ? { prxScore: current.prxScore } : {}),
        ...(typeof current.walletBalance === "number" ? { walletBalance: current.walletBalance } : {}),
      }));
    }
  }, []);

  const refresh = useCallback(async () => {
    apply(await fetchPassData());
  }, [apply]);

  useEffect(() => {
    let active = true;
    fetchPassData().then((data) => {
      if (active) apply(data);
    });
    return () => {
      active = false;
    };
  }, [apply]);

  const hasActiveVoucher = vouchers.some((v) => v.status === "valid");

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    let interval: number | undefined;
    if (hasActiveVoucher) {
      interval = window.setInterval(() => {
        if (document.visibilityState === "visible") void refresh();
      }, ACTIVE_VOUCHER_POLL_MS);
    }
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      if (interval) window.clearInterval(interval);
    };
  }, [hasActiveVoucher, refresh]);

  const redeem = useCallback(async (benefit: Benefit) => {
    try {
      const res = await fetch("/api/pass/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ benefitId: benefit.id }),
      });
      const data = (await res.json()) as { voucher?: UserVoucher; error?: string };
      if (!res.ok || !data.voucher) {
        return { ok: false as const, error: data.error || "Não foi possível gerar o voucher agora. Tente de novo." };
      }
      const voucher = data.voucher;
      setVouchers((prev) => [
        voucher,
        ...prev.filter((v) => v.id !== voucher.id && v.code?.toUpperCase() !== voucher.code?.toUpperCase()),
      ]);
      return { ok: true as const, voucher };
    } catch {
      return { ok: false as const, error: "Sem internet agora. Confira sua conexão e tente de novo." };
    }
  }, []);

  const applyScore = useCallback(
    (score: number, level: number) => {
      setOverrides((prev) => ({ ...prev, prxScore: score, prxLevel: level }));
      // XP de missão/indicação muda o nível mostrado na Carteira Central.
      reloadPoints(user.id);
    },
    [user.id]
  );

  return {
    member,
    benefits,
    missions,
    vouchers,
    referralInfo: referralInfo ?? {
      userId: member.id,
      referralCode: member.id.slice(0, 8).toUpperCase(),
      friendsInvitedCount: 0,
      referredBy: null,
    },
    loaded,
    refresh,
    redeem,
    applyScore,
  };
}

export function firstName(user: Pick<User, "name">): string {
  return (user.name || "Membro").trim().split(/\s+/)[0];
}
