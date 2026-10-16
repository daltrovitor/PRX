// Hello World
"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { PrxImage } from "@/components/ui/prx-image";
import type { PassData } from "@/components/app/use-pass-data";
import { useAppNav } from "@/components/app/app-nav";
import { BenefitCard } from "@/components/app/pass/benefit-card";
import { VoucherSheet } from "@/components/app/pass/voucher-sheet";
import { MissionsPanel } from "@/components/app/pass/missions-panel";
import { ReferralPanel } from "@/components/app/pass/referral-panel";
import { useBenefitEvents } from "@/components/app/pass/use-benefit-events";
import { reloadPoints, usePointsWallet } from "@/components/app/use-prx-stores";
import { WalletTriad } from "@/components/app/points/wallet-triad";
import { Button, EmptyState, Input, Notice, Segmented, Sheet, Tag } from "@/components/app/ui";
import { IconQr, IconSearch } from "@/components/icons/prx-icons";
import { PRX_CATEGORIES, levelProgress, type Benefit, type UserVoucher } from "@/lib/pass-data";
import { cn } from "@/lib/utils";
import { RafflesPanel } from "@/components/app/raffles/raffles-panel";
import { CarHomePanel } from "@/components/app/pass/car-home-panel";

type PassSection = "catalogo" | "car-home" | "vouchers" | "missions" | "sorteios" | "convidar";
const SECTIONS: ReadonlyArray<PassSection> = ["catalogo", "car-home", "vouchers", "missions", "sorteios", "convidar"];

export function PassScreen({ pass }: { pass: PassData }) {
  const { sub, go } = useAppNav();
  const { member, benefits, vouchers, missions, referralInfo, loaded } = pass;

  const benefitFromLink = sub?.startsWith("beneficio:") ? sub.slice("beneficio:".length) : null;
  const section: PassSection = SECTIONS.includes(sub as PassSection) ? (sub as PassSection) : "catalogo";

  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [pickedBenefit, setSelected] = useState<Benefit | null>(null);
  const [openVoucher, setOpenVoucher] = useState<UserVoucher | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const events = useBenefitEvents();
  const { wallet } = usePointsWallet(member.id);
  const coins = wallet?.coins ?? null;

  function selectBenefit(benefit: Benefit) {
    events.click(benefit.id);
    setSelected(benefit);
  }

  // Benefício aberto por link (#pass/beneficio:<id>) vale até o usuário fechar ou escolher outro.
  const linkedBenefit = benefitFromLink ? benefits.find((b) => b.id === benefitFromLink) ?? null : null;
  const selected = pickedBenefit ?? linkedBenefit;

  const activeByBenefit = useMemo(() => {
    const map = new Map<string, UserVoucher>();
    vouchers.filter((v) => v.status === "valid").forEach((v) => map.set(v.benefitId, v));
    return map;
  }, [vouchers]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return benefits.filter((b) => {
      if (category !== "all" && b.categoryId !== category) return false;
      if (!q) return true;
      return [b.title, b.partnerName, b.description, b.partnerLocation].some((field) => field?.toLowerCase().includes(q));
    });
  }, [benefits, category, query]);

  const xp = wallet?.xp ?? member.prxScore ?? 0;
  const progress = levelProgress(xp);
  const memberLevel = progress.level;
  const activeVouchers = vouchers.filter((v) => v.status === "valid");
  const usedVouchers = vouchers.filter((v) => v.status !== "valid");

  function closeBenefit() {
    setSelected(null);
    setRedeemError(null);
    if (benefitFromLink) go("pass");
  }

  async function redeem(benefit: Benefit) {
    setRedeeming(true);
    setRedeemError(null);
    const result = await pass.redeem(benefit);
    setRedeeming(false);
    if (!result.ok) {
      setRedeemError(result.error);
      return;
    }
    setSelected(null);
    setOpenVoucher(result.voucher);
    reloadPoints(member.id);
    go("pass", "vouchers");
  }

  const selectedVoucher = selected ? activeByBenefit.get(selected.id) : undefined;
  const selectedLocked = selected ? (selected.minPrxLevel || 1) > memberLevel : false;
  const selectedCost = selected?.pointsCost ?? 0;
  const missingCoins = coins !== null && selectedCost > coins ? selectedCost - coins : 0;
  const selectedSrc = selected?.partnerBanner?.trim() || selected?.partnerLogo?.trim() || "";

  return (
    <div className="space-y-8">
      <header className="grid gap-5 lg:grid-cols-12 lg:items-end">
        <div className="lg:col-span-7">
          <h1 className="ob-display text-[28px] text-ink sm:text-[40px]">PRX PASS</h1>
          <p className="mt-1.5 max-w-md text-sm text-muted-foreground sm:text-[15px]">Descontos reais em marcas parceiras. Resgate, mostre o QR no balcão e pronto.</p>
        </div>
        {/* As PRX Coins são a moeda dos resgates: ficam à vista aqui, ao lado do nível. */}
        <WalletTriad
          compact
          className="lg:col-span-5"
          balance={0}
          balanceLabel=""
          coins={coins}
          xp={xp}
          hidden={false}
          onToggleHidden={() => undefined}
          onOpenPoints={() => go("home", "pontos")}
          onOpenLevel={() => go("pass", "missions")}
        />
      </header>

      <Segmented
        label="Seções do PRX PASS"
        value={section}
        onChange={(value) => go("pass", value === "catalogo" ? null : value)}
        options={[
          { value: "catalogo", label: "Catálogo", count: benefits.length },
          { value: "car-home", label: "Car & Home" },
          { value: "vouchers", label: "Meus vouchers", count: activeVouchers.length },
          { value: "missions", label: "Missões", count: missions.filter((m) => !m.isCompleted).length },
          { value: "sorteios", label: "Sorteios" },
          { value: "convidar", label: "Convidar" },
        ]}
      />

      {section === "catalogo" && (
        <section aria-label="Catálogo de benefícios" className="space-y-6">
          <div className="space-y-4">
            <div className="relative">
              <IconSearch size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <label htmlFor="pass-search" className="sr-only">
                Buscar benefício ou parceiro
              </label>
              <Input
                id="pass-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar marca ou benefício"
                className="pl-11"
              />
            </div>
            <div role="group" aria-label="Categorias" className="-mx-4 flex gap-2 overflow-x-auto px-4 scrollbar-none touch-pan-x overscroll-x-contain sm:mx-0 sm:flex-wrap sm:px-0">
              {PRX_CATEGORIES.map((cat) => {
                const active = cat.id === category;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setCategory(cat.id)}
                    className={cn(
                      "min-h-12 shrink-0 cursor-pointer whitespace-nowrap rounded-full px-4 text-sm font-medium transition-colors",
                      active ? "bg-ink text-background" : "bg-surface text-muted-foreground hover:bg-line hover:text-ink"
                    )}
                  >
                    {cat.name}
                  </button>
                );
              })}
            </div>
          </div>

          {!loaded ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
              {[0, 1, 2].map((i) => (
                <div key={i} className="aspect-[4/5] rounded-3xl bg-surface" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              title={benefits.length === 0 ? "Catálogo em montagem" : "Nada encontrado"}
              body={
                benefits.length === 0
                  ? "Os primeiros parceiros entram em breve. Você recebe o aviso aqui."
                  : "Tente outra categoria ou limpe a busca."
              }
              action={
                benefits.length > 0 ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setCategory("all");
                      setQuery("");
                    }}
                  >
                    Limpar filtros
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((benefit) => (
                <li key={benefit.id} ref={events.track(benefit.id)}>
                  <BenefitCard
                    benefit={benefit}
                    redeemed={activeByBenefit.has(benefit.id)}
                    locked={(benefit.minPrxLevel || 1) > memberLevel}
                    onSelect={selectBenefit}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {section === "vouchers" && (
        <section aria-label="Meus vouchers" className="space-y-8">
          {vouchers.length === 0 ? (
            <EmptyState
              title="Nenhum voucher ainda"
              body="Escolha um benefício no catálogo para gerar seu primeiro QR Code."
              action={<Button onClick={() => go("pass")}>Ver catálogo</Button>}
            />
          ) : (
            <>
              <VoucherList title="Ativos" vouchers={activeVouchers} onOpen={setOpenVoucher} empty="Nenhum voucher aguardando uso." />
              {usedVouchers.length > 0 && <VoucherList title="Histórico" vouchers={usedVouchers} onOpen={setOpenVoucher} />}
            </>
          )}
        </section>
      )}

      {section === "missions" && (
        <MissionsPanel
          missions={missions}
          userId={member.id}
          referralCode={referralInfo.referralCode}
          onChanged={pass.refresh}
          onScoreChange={pass.applyScore}
        />
      )}

      {section === "car-home" && <CarHomePanel />}

      {section === "sorteios" && <RafflesPanel />}

      {section === "convidar" && (
        <ReferralPanel
          referralInfo={referralInfo}
          onReferralSuccess={(score, level) => {
            pass.applyScore(score, level);
            void pass.refresh();
          }}
        />
      )}

      <Sheet
        open={Boolean(selected)}
        onClose={closeBenefit}
        title={selected?.title ?? "Benefício"}
        description={selected ? `${selected.partnerName} · ${selected.partnerLocation}` : undefined}
        footer={
          selected &&
          (selectedVoucher ? (
            <Button
              block
              variant="ink"
              onClick={() => {
                setSelected(null);
                setOpenVoucher(selectedVoucher);
                go("pass", "vouchers");
              }}
            >
              Abrir meu voucher
            </Button>
          ) : (
            <Button block onClick={() => redeem(selected)} disabled={redeeming || selectedLocked || missingCoins > 0}>
              {selectedLocked
                ? `Disponível a partir do nível ${selected.minPrxLevel}`
                : missingCoins > 0
                  ? `Faltam ${missingCoins.toLocaleString("pt-BR")} PRX Coins`
                  : redeeming
                    ? "Gerando voucher…"
                    : selectedCost > 0
                      ? `Resgatar por ${selectedCost.toLocaleString("pt-BR")} PRX Coins`
                      : "Gerar voucher"}
            </Button>
          ))
        }
      >
        {selected && (
          <div className="space-y-6">
            {selectedSrc && (
              <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl bg-surface">
                <PrxImage src={selectedSrc} alt="" fill sizes="(max-width: 640px) 100vw, 512px" className="object-cover" />
              </div>
            )}
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <p className="text-4xl font-semibold leading-none tracking-[-0.035em] text-primary">{selected.discountLabel}</p>
              {selectedCost > 0 && (
                <p className="text-[15px] font-medium text-ink">
                  {selectedCost.toLocaleString("pt-BR")} <span className="text-muted-foreground">PRX Coins</span>
                </p>
              )}
            </div>
            {missingCoins > 0 && (
              <Notice tone="neutral">
                Você tem {coins?.toLocaleString("pt-BR")} coins. Comportamentos verificados e compras em parceiros com Pix PRX completam o que falta.
              </Notice>
            )}
            {selected.sponsored && <p className="text-[13px] text-muted-foreground">Patrocinado: o parceiro contratou destaque para esta oferta.</p>}
            {selected.description && <p className="text-[15px] leading-relaxed text-ink">{selected.description}</p>}
            {selected.terms.length > 0 && (
              <div>
                <h3 className="text-[13px] font-semibold text-ink">Regras</h3>
                <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                  {selected.terms.map((term) => (
                    <li key={term} className="flex gap-2">
                      <span aria-hidden>—</span>
                      {term}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {redeemError && <Notice tone="error">{redeemError}</Notice>}
          </div>
        )}
      </Sheet>

      <VoucherSheet
        voucher={openVoucher}
        onClose={() => setOpenVoucher(null)}
        holderName={member.name || "Membro PRX"}
        benefit={openVoucher ? (benefits.find((b) => b.id === openVoucher.benefitId) ?? null) : null}
      />
    </div>
  );
}

function VoucherList({
  title,
  vouchers,
  onOpen,
  empty,
}: {
  title: string;
  vouchers: UserVoucher[];
  onOpen: (voucher: UserVoucher) => void;
  empty?: string;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink">{title}</h2>
      {vouchers.length === 0 ? (
        <p className="mt-3 rounded-3xl glass p-5 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {vouchers.map((voucher) => (
            <li key={voucher.id}>
              <button
                type="button"
                onClick={() => onOpen(voucher)}
                className="flex w-full cursor-pointer items-center gap-3.5 rounded-3xl glass p-4 text-left glass-lift"
              >
                <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-card text-ink">
                  <IconQr size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-ink">{voucher.partnerName}</p>
                  <p className="truncate text-[13px] text-muted-foreground">
                    {voucher.benefitTitle} · {voucher.code}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[15px] font-semibold tracking-[-0.01em] text-primary">{voucher.discountLabel}</span>
                  {voucher.status === "valid" ? <Tag tone="accent">Pronto</Tag> : <Tag>Usado</Tag>}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
