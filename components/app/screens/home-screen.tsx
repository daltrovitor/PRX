// Hello World
"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import type { PassData } from "@/components/app/use-pass-data";
import { firstName } from "@/components/app/use-pass-data";
import { useAppNav } from "@/components/app/app-nav";
import { useBankAccount, useHiddenBalance, useHomeBanners, useLiveData, usePointsWallet } from "@/components/app/use-prx-stores";
import { TextLink, TransactionRow } from "@/components/app/shared";
import { PaymentCard } from "@/components/app/bank/card-visual";
import { HomeBanners } from "@/components/app/reels/home-banner";
import { FoundersHomePromo } from "@/components/app/founders/founders-community";
import { ResenhaHomeCard } from "@/components/app/live/resenha-card";
import { useResenhas } from "@/components/app/live/use-resenha";
import { PushBanner } from "@/components/app/profile/push-prompts";
import { runReelCta, trackReel } from "@/components/app/reels/reel-cta";
import { WalletTriad } from "@/components/app/points/wallet-triad";
import { PointsSheet } from "@/components/app/points/points-sheet";
import { EmptyState, ProgressBar } from "@/components/app/ui";
import { IconBarcode, IconPaperPlane, IconPixDiamonds } from "@/components/icons/prx-icons";
import { PRX_MODULES } from "@/components/obsidian/obsidian-modules";
import {
  ObsidianBalanceCard,
  ObsidianEventCard,
  ObsidianGreeting,
  ObsidianPillarCard,
  ObsidianSectionHeader,
  type ObsidianAction,
  type PillarId,
} from "@/components/obsidian/obsidian-ui";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { formatEventDate } from "@/lib/live/format";

const reveal = {
  hidden: { opacity: 0, y: 14 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 30, delay: i * 0.06 } }),
};

const SOON: Record<Extract<PillarId, "invest" | "me" | "circle">, string> = {
  invest: "Caixinhas e metas para os seus planos chegam em breve à PRX.",
  me: "Saúde mental pra ir mais longe: o PRX ME chega em breve.",
  circle: "Conexões sem swipe: o PRX CIRCLE chega em breve.",
};

/**
 * Início (Cyber-Luxury Obsidian): saudação e manifesto, saldo PRX Bank com
 * Pix · Pagar · Transferir, os cards de todos os módulos e os próximos eventos.
 * Abaixo, o dia a dia: instalar o app, Coins e nível, atividade, benefícios e missões.
 */
export function HomeScreen({ pass }: { pass: PassData }) {
  const { go, sub } = useAppNav();
  const { showToast } = useConfirmToast();
  const { member, vouchers, missions, benefits } = pass;
  const { account } = useBankAccount(member.id);
  const { data: live } = useLiveData(member.id);
  const { wallet, error: pointsError, checkin } = usePointsWallet(member.id);
  const [hidden, toggleHidden] = useHiddenBalance();
  // #home/pontos (ex.: aviso de compra em parceiro) abre o extrato de pontos.
  const pointsOpen = sub === "pontos";

  const activeVouchers = vouchers.filter((v) => v.status === "valid");
  const inProgress = missions.filter((m) => m.isAccepted && !m.isCompleted).slice(0, 3);
  const suggestedMissions = inProgress.length > 0 ? inProgress : missions.filter((m) => !m.isCompleted).slice(0, 3);

  const [now] = useState(() => Date.now());
  const upcoming = useMemo(
    () =>
      (live?.events ?? [])
        .filter((e) => e.status === "published" && new Date(e.startsAt).getTime() > now)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
        .slice(0, 2),
    [live?.events, now]
  );
  const ticketEvents = new Set((live?.wallet.tickets ?? []).filter((t) => t.status === "valid" || t.status === "pending_payment").map((t) => t.eventId));
  const transactions = account?.transactions ?? [];
  const banners = useHomeBanners(member.id);
  // Banner da Resenha sempre na Home; os detalhes da festa só para quem um Insider convidou.
  const { resenhas } = useResenhas(member.id);

  const balanceActions: ReadonlyArray<ObsidianAction> = [
    { key: "pix", label: "Pix", Icon: IconPixDiamonds, onClick: () => go("bank", "chaves") },
    { key: "pagar", label: "Pagar", Icon: IconBarcode, onClick: () => go("bank", "pagar") },
    { key: "transferir", label: "Transferir", Icon: IconPaperPlane, onClick: () => go("bank", "pix") },
  ];

  // Cada card leva ao lugar do módulo no app; os que ainda não abrem avisam "em breve".
  const openPillar = (id: PillarId) => {
    if (id === "bank" || id === "pass" || id === "live" || id === "founders") return go(id);
    if (id === "level") return go("pass", "missions");
    if (id === "car" || id === "home") return go("pass", id);
    showToast("info", SOON[id], `PRX ${id.toUpperCase()}`);
  };

  return (
    <div className="space-y-12 lg:space-y-16">
      {/* Topo da pirâmide: manifesto, saldo, pilares e eventos. No celular os pilares vêm antes
          dos eventos (como na referência); no desktop saldo e eventos dividem a mesma linha. */}
      <div className="grid gap-7 lg:grid-cols-12 lg:gap-x-8 lg:gap-y-10">
        <motion.header initial="hidden" animate="show" custom={0} variants={reveal} className="order-1 pb-2 pt-3 sm:pt-8 lg:col-span-12 lg:pb-4 lg:pt-12">
          <ObsidianGreeting name={firstName(member)} />
        </motion.header>

        <motion.div initial="hidden" animate="show" custom={1} variants={reveal} className="order-1 min-w-0 lg:col-span-12">
          <PushBanner />
        </motion.div>

        <motion.div initial="hidden" animate="show" custom={1} variants={reveal} className="order-2 min-w-0 lg:col-span-7">
          <ObsidianBalanceCard
            value={account?.balance ?? 0}
            hidden={hidden}
            onToggleHidden={toggleHidden}
            onOpen={() => go("bank")}
            actions={balanceActions}
            note={account?.sandbox ? "Modo Sandbox · Testes" : undefined}
          />
        </motion.div>

        <motion.section
          aria-labelledby="home-events"
          initial="hidden"
          animate="show"
          custom={3}
          variants={reveal}
          className="order-5 min-w-0 space-y-3 lg:order-3 lg:col-span-5 lg:flex lg:flex-col"
        >
          <ObsidianSectionHeader id="home-events" title="Próximos eventos" actionLabel="Ver todos" onAction={() => go("live")} />
          {upcoming.length === 0 ? (
            <div className="glass flex min-h-[112px] flex-1 items-center rounded-[24px] p-5 text-[14px] leading-relaxed text-muted-foreground">
              Novos eventos PRX LIVE aparecem aqui assim que forem anunciados.
            </div>
          ) : (
            <ul className="space-y-3 lg:flex-1">
              {upcoming.map((event, i) => {
                const date = formatEventDate(event.startsAt);
                const hasTicket = ticketEvents.has(event.id);
                return (
                  <li key={event.id} className={i > 0 ? "hidden lg:block" : undefined}>
                    <ObsidianEventCard
                      title={event.title}
                      meta={`${date.day} ${date.month} · ${event.city}`}
                      image={/^https:\/\//.test(event.coverUrl) ? event.coverUrl : null}
                      onOpen={() => go("live", hasTicket ? "ingressos" : null)}
                      trailing={
                        hasTicket || event.soldOut ? (
                          <span className="ob-label hidden rounded-full border border-white/[0.24] bg-black/[0.35] px-3 py-1.5 text-[9.5px] tracking-[0.14em] backdrop-blur-md min-[380px]:inline">
                            {hasTicket ? "Seu ingresso" : "Esgotado"}
                          </span>
                        ) : undefined
                      }
                    />
                  </li>
                );
              })}
            </ul>
          )}
          {/* PRX Founders ao lado do PRX LIVE: só aparece com a imagem oficial enviada e ativada no admin. */}
          <FoundersHomePromo onOpen={() => go("founders")} />
        </motion.section>

        <motion.section
          aria-labelledby="home-modules"
          initial="hidden"
          animate="show"
          custom={2}
          variants={reveal}
          className="order-3 min-w-0 space-y-3 lg:order-4 lg:col-span-12"
        >
          <ObsidianSectionHeader id="home-modules" title="Módulos PRX" />
          {/* Até 1279 px: carrossel com todos os módulos; a partir de 1280 px: duas linhas de cinco. */}
          <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 scrollbar-none touch-pan-x sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 xl:grid xl:grid-cols-5 xl:gap-4 xl:overflow-visible">
            {PRX_MODULES.map((pillar) => (
              <li key={pillar.id} className="w-[38%] min-w-[136px] max-w-[210px] shrink-0 snap-start xl:w-auto xl:max-w-none">
                <ObsidianPillarCard pillar={pillar} onSelect={openPillar} sizes="(min-width: 1280px) 220px, 210px" />
              </li>
            ))}
          </ul>
        </motion.section>

        {/* Resenha logo abaixo dos Módulos PRX (celular e desktop). */}
        <motion.div initial="hidden" animate="show" custom={3} variants={reveal} className="order-4 min-w-0 lg:order-5 lg:col-span-12">
          <ResenhaHomeCard resenhas={resenhas} onOpen={() => go("live", "resenha")} />
        </motion.div>

        {/* Banner de parceiro (Destaque de imagem cadastrado no admin), logo abaixo dos eventos. */}
        {banners.length > 0 && (
          <motion.section aria-label="Destaques dos parceiros" initial="hidden" animate="show" custom={4} variants={reveal} className="order-6 min-w-0 lg:col-span-12">
            <HomeBanners
              banners={banners}
              onOpen={(banner) => {
                trackReel("cta", banner.id);
                runReelCta(banner, go);
              }}
            />
          </motion.section>
        )}
      </div>

      {/* Base da pirâmide: o dia a dia do membro */}
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
        <div className="min-w-0 space-y-10 lg:col-span-7">
          <section aria-label="PRX Coins e nível">
            <WalletTriad
              compact
              balance={account?.balance ?? 0}
              balanceLabel="Saldo PRX Bank"
              coins={wallet?.coins ?? null}
              xp={wallet?.xp ?? member.prxScore ?? 0}
              hidden={hidden}
              onToggleHidden={toggleHidden}
              onOpenPoints={() => go("home", "pontos")}
              onOpenLevel={() => go("pass", "missions")}
            />
          </section>

          <section aria-labelledby="home-activity">
            <ObsidianSectionHeader id="home-activity" title="Atividade" actionLabel="Ver todas" onAction={() => go("bank", "extrato")} />
            {transactions.length === 0 ? (
              <div className="mt-3">
                <EmptyState
                  title="Nenhuma movimentação ainda"
                  body="Pix, compras e cashbacks aparecem aqui."
                />
              </div>
            ) : (
              <ul className="mt-1">
                {transactions.slice(0, 5).map((tx) => (
                  <TransactionRow key={tx.id} tx={tx} hidden={hidden} />
                ))}
              </ul>
            )}
          </section>

          {benefits.length > 0 && (
            <section aria-labelledby="home-pass">
              <ObsidianSectionHeader id="home-pass" title="No PASS agora" actionLabel="Ver todos" onAction={() => go("pass")} />
              <ul className="-mx-4 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 scrollbar-none touch-pan-x sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
                {benefits.slice(0, 8).map((benefit) => (
                  <li key={benefit.id} className="w-[64%] min-[420px]:w-[220px] shrink-0 snap-start">
                    <button
                      type="button"
                      onClick={() => go("pass", `beneficio:${benefit.id}`)}
                      className="flex h-full w-full cursor-pointer flex-col justify-between gap-6 rounded-3xl glass p-5 text-left glass-lift"
                    >
                      <span className="text-2xl font-light leading-none tracking-[-0.02em] text-primary">{benefit.discountLabel}</span>
                      <span>
                        <span className="block truncate text-[15px] font-medium text-ink">{benefit.partnerName}</span>
                        <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{benefit.title}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="min-w-0 space-y-10 lg:col-span-5" aria-label="Resumo">
          <section aria-labelledby="home-vouchers" className="flex items-center justify-between gap-4 rounded-3xl glass p-5">
            <div>
              <h2 id="home-vouchers" className="ob-label text-[11px] text-muted-foreground">
                Vouchers ativos
              </h2>
              <p className="mt-2 text-[32px] font-light leading-none tracking-[-0.02em] text-ink">{activeVouchers.length}</p>
            </div>
            <TextLink onClick={() => go("pass", activeVouchers.length > 0 ? "vouchers" : null)}>
              {activeVouchers.length > 0 ? "Mostrar QR" : "Explorar"}
            </TextLink>
          </section>

          <section aria-labelledby="home-missions">
            <ObsidianSectionHeader id="home-missions" title="Missões" actionLabel="Ver todas" onAction={() => go("pass", "missions")} />
            {suggestedMissions.length === 0 ? (
              <p className="mt-3 rounded-3xl glass p-5 text-sm text-muted-foreground">Nenhuma missão aberta agora. Novas missões aparecem aqui.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {suggestedMissions.map((mission) => (
                  <li key={mission.id}>
                    <button
                      type="button"
                      onClick={() => go("pass", "missions")}
                      className="flex w-full cursor-pointer items-center gap-4 rounded-3xl glass p-4 text-left glass-lift"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-medium text-ink">{mission.title}</p>
                        <div className="mt-2.5 flex items-center gap-3">
                          <div className="flex-1">
                            <ProgressBar value={mission.progress} max={mission.total || 1} label={`Progresso de ${mission.title}`} />
                          </div>
                          <span className="text-[12px] font-medium text-muted-foreground">
                            {mission.progress}/{mission.total}
                          </span>
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full bg-primary/[0.12] px-2.5 py-1 text-[12px] font-semibold text-primary">+{mission.xpReward} XP</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="home-card" className="space-y-3">
            <ObsidianSectionHeader id="home-card" title="Seu cartão" actionLabel="Cartões" onAction={() => go("bank", "cartoes")} />
            <div className="max-w-[360px]">
              <PaymentCard holder={member.name || "Membro PRX"} onClick={() => go("bank", "cartoes")} />
            </div>
          </section>
        </aside>
      </div>

      <PointsSheet open={pointsOpen} onClose={() => go("home")} wallet={wallet} error={pointsError} onCheckin={checkin} />
    </div>
  );
}
