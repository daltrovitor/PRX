// Hello World
"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import Image from "next/image";
import {
  isMotionValue,
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { PrxLogo } from "@/components/brand/prx-logo";
import { cn } from "@/lib/utils";
import {
  IconArrowRight,
  IconBank,
  IconBarcode,
  IconCard,
  IconCheck,
  IconChevronRight,
  IconCoin,
  IconCopy,
  IconHome,
  IconLive,
  IconPaperPlane,
  IconPass,
  IconPixDiamonds,
  IconQr,
  IconReceive,
  IconReels,
  IconSend,
  IconTicket,
} from "@/components/icons/prx-icons";
import {
  OBSIDIAN_IMAGES,
  OBSIDIAN_PILLARS,
  ObsidianAvatarStack,
  ObsidianBalanceCard,
  ObsidianBell,
  ObsidianCrystal,
  ObsidianDock,
  ObsidianEventCard,
  ObsidianGreeting,
  ObsidianPillarCard,
  ObsidianSectionHeader,
  type ObsidianAction,
  type ObsidianDockItem,
  type PillarId,
} from "@/components/obsidian/obsidian-ui";

/* -------------------------------------------------------------------------- */
/* Geometria do aparelho                                                      */
/* -------------------------------------------------------------------------- */

/** Chassi 372×762 (proporção de um smartphone de 6,1"); a tela desenha o app em 390pt de largura. */
export const PHONE = { width: 372, height: 762, frame: 3, bezel: 9, radius: 60 } as const;
const SCREEN_W = PHONE.width - 2 * (PHONE.frame + PHONE.bezel);
const SCREEN_H = PHONE.height - 2 * (PHONE.frame + PHONE.bezel);
export const APP_WIDTH = 390;
const APP_SCALE = SCREEN_W / APP_WIDTH;
export const APP_HEIGHT = Math.round(SCREEN_H / APP_SCALE);

/** Camadas da lateral de titânio: dão espessura real quando o aparelho gira. */
const EDGE_LAYERS = [1, 2, 3, 4, 5, 6, 7, 8];

/* -------------------------------------------------------------------------- */
/* App de demonstração (a tela viva do PRX)                                   */
/* -------------------------------------------------------------------------- */

type PhoneTab = "home" | "pass" | "reels" | "bank" | "live" | "profile";

const PHONE_DOCK: ReadonlyArray<ObsidianDockItem<PhoneTab>> = [
  { id: "home", label: "Início", Icon: IconHome },
  { id: "pass", label: "PRX Pass", Icon: IconPass },
  { id: "reels", label: "Destaques", Icon: IconReels },
  { id: "bank", label: "PRX Bank", Icon: IconBank },
  { id: "live", label: "PRX Live", Icon: IconLive },
];

const DEMO = {
  name: "Rafael",
  balance: 12430.25,
  coins: 2840,
  level: { current: 3, next: 4, xp: 680, goal: 1000, title: "Membro Black" },
  friends: [
    { initials: "MA", tone: "linear-gradient(135deg,#7c3aed,#2563eb)" },
    { initials: "LU", tone: "linear-gradient(135deg,#334155,#0f172a)" },
    { initials: "JO", tone: "linear-gradient(135deg,#9333ea,#be185d)" },
  ],
  month: { incoming: 4820, outgoing: 1936.4, cashback: 86.3 },
  transactions: [
    { id: "t1", label: "Pix recebido", who: "Marina · hoje, 10:14", value: 250, incoming: true },
    { id: "t2", label: "Café Central", who: "Parceiro PRX · +19 coins", value: 18.9, incoming: false },
    { id: "t3", label: "Cashback PRX Pass", who: "Academia Move · −30%", value: 12.4, incoming: true },
    { id: "t4", label: "Pix enviado", who: "Lucas · ontem", value: 60, incoming: false },
    { id: "t5", label: "Ingresso Resenha", who: "PRX Live · setor VIP", value: 180, incoming: false },
    { id: "t6", label: "Mesada", who: "Conta Pai · automática", value: 400, incoming: true },
    { id: "t7", label: "Streaming", who: "Débito no cartão", value: 39.9, incoming: false },
  ],
  pixKeys: [
    { id: "k1", type: "Celular", value: "(62) 9•••• -4821" },
    { id: "k2", type: "E-mail", value: "rafa•••@prx.app" },
    { id: "k3", type: "Aleatória", value: "7f3c••••-••••-9a1e" },
  ],
  benefits: [
    { id: "b1", discount: "2 por 1", partner: "Cinema", title: "Ingressos de quarta a domingo" },
    { id: "b2", discount: "−30%", partner: "Academia", title: "Primeiro mês com desconto" },
    { id: "b3", discount: "−25%", partner: "Delivery", title: "Pedidos acima de R$ 40" },
    { id: "b4", discount: "−20%", partner: "Cafeteria", title: "Todo dia, no balcão via QR" },
    { id: "b5", discount: "−15%", partner: "Streetwear", title: "Coleção nova da loja parceira" },
  ],
  missions: [
    { id: "m1", title: "Guardar R$ 100 este mês", reward: 150, progress: 0.7 },
    { id: "m2", title: "3 compras em parceiros", reward: 90, progress: 0.66 },
    { id: "m3", title: "Ir a um evento PRX Live", reward: 200, progress: 0 },
  ],
  reels: [
    { id: "r1", who: "@marina", what: "Pré da Resenha", likes: "1,2 mil", image: OBSIDIAN_IMAGES.liveConcert },
    { id: "r2", who: "@lucas", what: "Treino com −30%", likes: "842", image: OBSIDIAN_IMAGES.meHorizon },
    { id: "r3", who: "@jo", what: "Meta batida!", likes: "610", image: OBSIDIAN_IMAGES.investCopper },
    { id: "r4", who: "@rafa", what: "Cartão chegou", likes: "2,4 mil", image: OBSIDIAN_IMAGES.cardMetal },
  ],
} as const;

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Atalhos do perfil; sem aba, o item aparece desativado (ainda não existe na demonstração). */
const PROFILE_LINKS: ReadonlyArray<{ label: string; tab?: PhoneTab }> = [
  { label: "Meus vouchers e ingressos", tab: "pass" },
  { label: "Extrato e chaves Pix", tab: "bank" },
  { label: "Meus eventos", tab: "live" },
  { label: "Segurança e biometria" },
  { label: "PRX Invest · em breve" },
];

/** Progresso em barra fina violeta (0–1). */
function Progress({ value, label }: { value: number; label: string }) {
  const pct = Math.round(value * 100);
  return (
    <span role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="mt-2 block h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
      <span className="block h-full rounded-full bg-[#9468fa]" style={{ width: `${pct}%` }} />
    </span>
  );
}

/**
 * Interface viva do PRX na identidade Obsidian, em 390pt de largura. Botões
 * funcionam de verdade: o dock troca de tela, o olho oculta o saldo, os
 * pilares e atalhos navegam, as chaves Pix copiam. Dados de demonstração (não há conta por trás).
 */
export function ObsidianPhoneApp({ className, height = APP_HEIGHT }: { className?: string; height?: number }) {
  const [tab, setTab] = useState<PhoneTab>("home");
  const [hidden, setHidden] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const go = (next: PhoneTab) => {
    setTab(next);
    scroller.current?.scrollTo({ top: 0 });
  };
  const openPillar = (id: PillarId) => {
    if (id === "pass") go("pass");
    else if (id === "live") go("live");
    else go("profile");
  };
  const show = (value: number, sign: "+" | "−" | "" = "") => (hidden ? "••••" : `${sign}${sign ? " " : ""}${money.format(value)}`);

  const actions: ReadonlyArray<ObsidianAction> = [
    { key: "pix", label: "Pix", Icon: IconPixDiamonds, onClick: () => go("bank") },
    { key: "pagar", label: "Pagar", Icon: IconBarcode, onClick: () => go("bank") },
    { key: "transferir", label: "Transferir", Icon: IconPaperPlane, onClick: () => go("bank") },
  ];
  const pages = { onHome: () => go("home"), onProfile: () => go("profile"), onVouchers: () => go("pass") };

  return (
    <div
      role="region"
      aria-label="Demonstração do app PRX"
      className={cn("prx-obsidian relative isolate flex flex-col overflow-hidden text-left", className)}
      style={{ width: APP_WIDTH, height }}
    >
      {/* Luz volumétrica própria da tela (a do app real é fixa na janela). */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(28rem_22rem_at_100%_0%,rgba(124,58,237,0.26),transparent_70%),radial-gradient(24rem_20rem_at_-10%_30%,rgba(0,102,255,0.16),transparent_70%),radial-gradient(30rem_18rem_at_50%_110%,rgba(76,29,149,0.3),transparent_72%)]"
      />
      <StatusBar />

      <div ref={scroller} data-lenis-prevent className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-none">
        {tab === "home" && (
          <div className="relative px-5 pb-[104px]">
            <ObsidianCrystal sizes="320px" className="absolute -right-[92px] -top-[46px] -z-10 h-[400px] w-[340px]" />
            <PhoneHeader {...pages} />
            <ObsidianGreeting name={DEMO.name} as="p" density="phone" className="mt-2" />
            <ObsidianBalanceCard
              density="phone"
              className="mt-4"
              value={DEMO.balance}
              hidden={hidden}
              onToggleHidden={() => setHidden((h) => !h)}
              onOpen={() => go("bank")}
              actions={actions}
            />
            <button type="button" onClick={() => go("profile")} className="glass mt-3 flex w-full cursor-pointer items-center gap-3 rounded-[18px] p-3.5 text-left">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
                <IconCoin size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between text-[13px] font-medium text-ink">
                  <span>{DEMO.coins.toLocaleString("pt-BR")} PRX Coins</span>
                  <span className="text-[11px] text-muted-foreground">Nível {DEMO.level.current}</span>
                </span>
                <Progress value={DEMO.level.xp / DEMO.level.goal} label="Progresso até o próximo nível" />
              </span>
            </button>
            <ul aria-label="Ecossistema PRX" className="-mx-5 mt-3 flex gap-2.5 overflow-x-auto px-5 scrollbar-none">
              {OBSIDIAN_PILLARS.map((pillar) => (
                <li key={pillar.id} className="w-[120px] shrink-0">
                  <ObsidianPillarCard pillar={pillar} density="phone" sizes="140px" onSelect={openPillar} />
                </li>
              ))}
            </ul>
            <ObsidianSectionHeader title="Próximos eventos" actionLabel="Ver todos" onAction={() => go("live")} className="mt-1" />
            <ObsidianEventCard
              density="phone"
              title="Resenha"
              meta="25 out · Goiânia"
              onOpen={() => go("live")}
              trailing={<ObsidianAvatarStack people={DEMO.friends} extra={120} />}
            />
          </div>
        )}

        {tab === "pass" && (
          <PhonePage title="PRX Pass" {...pages}>
            <Banner image={OBSIDIAN_IMAGES.cardMetal} title="PRX Pass" caption="Benefícios exclusivos" />
            <div className="glass mt-3 rounded-[20px] p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-primary">
                    <IconQr size={18} />
                  </span>
                  <div>
                    <p className="text-[13.5px] font-medium text-ink">Voucher ativo</p>
                    <p className="text-[11.5px] text-muted-foreground">Cinema · 2 por 1 · vale até domingo</p>
                  </div>
                </div>
                <span className="ob-label text-[10px] tracking-wider text-primary">Pronto</span>
              </div>
              <div className="mt-3 flex items-center justify-between rounded-[14px] bg-white/[0.04] px-3 py-2.5">
                <span className="font-mono text-[15px] tracking-[0.3em] text-ink">PRX-7K2Q</span>
                <span className="text-[11px] text-muted-foreground">QR protegido · 60s</span>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="glass rounded-[18px] p-3.5">
                <p className="text-[11px] text-muted-foreground">Economia no mês</p>
                <p className="mt-1 text-[19px] font-light text-ink">{show(DEMO.month.cashback)}</p>
              </div>
              <div className="glass rounded-[18px] p-3.5">
                <p className="text-[11px] text-muted-foreground">Cupons usados</p>
                <p className="mt-1 text-[19px] font-light text-ink">7 de 10</p>
              </div>
            </div>
            <ObsidianSectionHeader title="Vantagens do seu plano" className="mt-4" />
            <ul className="mt-2 space-y-2">
              {DEMO.benefits.map((b) => (
                <li key={b.id} className="glass flex items-center gap-3 rounded-[18px] p-3.5">
                  <span className="w-[62px] shrink-0 text-[17px] font-light tracking-[-0.01em] text-primary">{b.discount}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-ink">{b.partner}</span>
                    <span className="block truncate text-[11.5px] text-muted-foreground">{b.title}</span>
                  </span>
                  <IconChevronRight size={14} className="text-muted-foreground" />
                </li>
              ))}
            </ul>
          </PhonePage>
        )}

        {tab === "reels" && (
          <PhonePage title="Destaques" {...pages}>
            <Banner image={OBSIDIAN_IMAGES.liveConcert} title="Momentos PRX" caption="Experiências em alta" />
            <ul className="mt-3 grid grid-cols-2 gap-2">
              {DEMO.reels.map((r) => (
                <li key={r.id} className="relative isolate flex aspect-[3/4] flex-col justify-end overflow-hidden rounded-[16px] border border-white/[0.1] p-2.5 text-[#fff]">
                  <Image src={r.image} alt="" fill sizes="180px" placeholder="blur" className="-z-10 object-cover" />
                  <span aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,transparent_40%,rgba(5,5,8,0.85))]" />
                  <span className="text-[12px] font-medium">{r.what}</span>
                  <span className="text-[10.5px] text-[#cbd5e1]">
                    {r.who} · ♥ {r.likes}
                  </span>
                </li>
              ))}
            </ul>
            <div className="glass mt-3 rounded-[22px] p-4">
              <p className="ob-label text-[10px] text-muted-foreground">Comunidade e moedas</p>
              <p className="mt-2 text-[16px] font-light leading-snug text-ink">Compartilhe seus melhores momentos no ecossistema e acumule PRX Coins.</p>
              <button
                type="button"
                onClick={() => go("live")}
                className="mt-3 inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full bg-primary px-4 text-[13px] font-medium text-[#fff]"
              >
                Ver os próximos eventos <IconArrowRight size={14} />
              </button>
            </div>
          </PhonePage>
        )}

        {tab === "bank" && (
          <PhonePage title="PRX Bank" {...pages}>
            <ObsidianBalanceCard density="phone" value={DEMO.balance} hidden={hidden} onToggleHidden={() => setHidden((h) => !h)} actions={actions} />
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              {[
                { label: "Entradas", value: show(DEMO.month.incoming), tone: "text-success" },
                { label: "Saídas", value: show(DEMO.month.outgoing), tone: "text-ink" },
                { label: "Cashback", value: show(DEMO.month.cashback), tone: "text-primary" },
              ].map((m) => (
                <div key={m.label} className="glass rounded-[16px] px-2 py-3">
                  <p className="text-[10.5px] text-muted-foreground">{m.label}</p>
                  <p className={cn("mt-1 truncate text-[12.5px] font-medium tabular-nums", m.tone)}>{m.value}</p>
                </div>
              ))}
            </div>
            <div className="relative isolate mt-3 flex h-[120px] flex-col justify-between overflow-hidden rounded-[20px] border border-white/[0.12] p-4 text-[#fff]">
              <Image src={OBSIDIAN_IMAGES.cardMetal} alt="" fill sizes="360px" placeholder="blur" className="-z-10 object-cover object-[50%_62%]" />
              <span aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(5,5,8,0.85),rgba(5,5,8,0.2))]" />
              <span className="flex items-center justify-between gap-2 text-[12px]">
                <span className="flex items-center gap-2">
                  <IconCard size={15} /> Cartão de metal · sem anuidade
                </span>
                {/* O cartão ainda não é emitido: nada de número ou limite que pareça cartão ativo. */}
                <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ring-1 ring-white/25">Em breve</span>
              </span>
              <span className="flex items-end justify-between">
                <span className="font-mono text-[14px] tracking-[0.2em]">•••• ••••</span>
                <span className="text-[11px] text-[#cbd5e1]">Disponível em breve</span>
              </span>
            </div>
            <ObsidianSectionHeader title="Suas chaves Pix" className="mt-5" />
            <ul className="glass mt-1 divide-y divide-white/[0.06] rounded-[20px] px-4">
              {DEMO.pixKeys.map((k) => (
                <li key={k.id} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] text-muted-foreground">{k.type}</span>
                    <span className="block truncate text-[13.5px] text-ink">{k.value}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setCopied(k.id)}
                    aria-label={copied === k.id ? `Chave ${k.type} copiada` : `Copiar chave ${k.type}`}
                    className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-ink"
                  >
                    {copied === k.id ? <IconCheck size={15} className="text-success" /> : <IconCopy size={15} />}
                  </button>
                </li>
              ))}
            </ul>
            <ObsidianSectionHeader title="Extrato" className="mt-5" />
            <ul className="glass mt-1 divide-y divide-white/[0.06] rounded-[20px] px-4">
              {DEMO.transactions.map((tx) => (
                <li key={tx.id} className="flex items-center gap-3 py-3">
                  <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink">
                    {tx.incoming ? <IconReceive size={15} /> : <IconSend size={15} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-ink">{tx.label}</span>
                    <span className="block truncate text-[11.5px] text-muted-foreground">{tx.who}</span>
                  </span>
                  <span className={cn("text-[13.5px] font-medium tabular-nums", tx.incoming ? "text-success" : "text-ink")}>{show(tx.value, tx.incoming ? "+" : "−")}</span>
                </li>
              ))}
            </ul>
          </PhonePage>
        )}

        {tab === "live" && (
          <PhonePage title="PRX Live" {...pages}>
            <Banner image={OBSIDIAN_IMAGES.liveConcert} title="PRX Live" caption="Eventos · festivais" />
            <div className="glass mt-3 rounded-[20px] p-4">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-2 text-[13.5px] font-medium text-ink">
                  <IconTicket size={16} className="text-primary" /> Seu ingresso
                </p>
                <span className="ob-label text-[10px] tracking-wider text-primary">Confirmado</span>
              </div>
              <p className="mt-2 text-[18px] font-light text-ink">Resenha · 25 out</p>
              <p className="text-[11.5px] text-muted-foreground">VIP · Portão B · 22h · +36 coins no balcão</p>
            </div>
            <ObsidianSectionHeader title="Agenda" className="mt-4" />
            <div className="mt-1 space-y-2.5">
              <ObsidianEventCard density="phone" title="Resenha" meta="25 out · Goiânia" trailing={<ObsidianAvatarStack people={DEMO.friends} extra={120} />} />
              <ObsidianEventCard density="phone" title="Corrida PRX" meta="12 nov · Goiânia" image={OBSIDIAN_IMAGES.meHorizon} />
              <ObsidianEventCard density="phone" title="Founders Demo Day" meta="30 nov · São Paulo" image={OBSIDIAN_IMAGES.investCopper} />
            </div>
          </PhonePage>
        )}

        {tab === "profile" && (
          <PhonePage title="Meu Perfil" {...pages}>
            <div className="glass flex items-center gap-4 rounded-[22px] p-4">
              <div className="flex h-13 w-13 items-center justify-center rounded-full bg-[linear-gradient(135deg,#2a2342,#0e0f16)] text-[18px] font-semibold text-ink ring-2 ring-primary/40">
                R
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[16px] font-semibold text-ink">Rafael Santos</p>
                <p className="ob-label text-[11px] text-muted-foreground">
                  Nível {DEMO.level.current} · {DEMO.level.title}
                </p>
              </div>
            </div>
            <div className="glass mt-3 rounded-[20px] p-4">
              <div className="flex items-center justify-between text-[12px] text-muted-foreground">
                <span>Nível {DEMO.level.current}</span>
                <span>
                  {DEMO.level.xp} / {DEMO.level.goal} XP
                </span>
                <span>Nível {DEMO.level.next}</span>
              </div>
              <Progress value={DEMO.level.xp / DEMO.level.goal} label="XP até o próximo nível" />
              <p className="mt-2.5 text-[11.5px] text-muted-foreground">No nível {DEMO.level.next}: limite ampliado e acesso a lounge VIP.</p>
            </div>
            <ObsidianSectionHeader title="Missões da semana" className="mt-4" />
            <ul className="mt-1 space-y-2">
              {DEMO.missions.map((m) => (
                <li key={m.id} className="glass rounded-[18px] p-3.5">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-medium text-ink">{m.title}</span>
                    <span className="shrink-0 text-[11.5px] text-primary">+{m.reward} coins</span>
                  </span>
                  <Progress value={m.progress} label={`Progresso: ${m.title}`} />
                </li>
              ))}
            </ul>
            <ul className="glass mt-4 divide-y divide-white/[0.06] rounded-[22px] px-4">
              {PROFILE_LINKS.map((item) => (
                <li key={item.label}>
                  <button
                    type="button"
                    onClick={() => item.tab && go(item.tab)}
                    disabled={!item.tab}
                    className="flex min-h-12 w-full cursor-pointer items-center justify-between text-left text-[14px] text-ink transition-colors hover:text-primary disabled:cursor-default disabled:hover:text-ink"
                  >
                    {item.label}
                    <IconChevronRight size={14} className="text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          </PhonePage>
        )}
      </div>

      <ObsidianDock
        items={PHONE_DOCK}
        active={tab === "profile" ? null : tab}
        onSelect={go}
        density="phone"
        label="Navegação do app de demonstração"
        layoutId="ob-phone-dock-dot"
        className="absolute inset-x-3 bottom-[22px] z-20"
      />
      <span aria-hidden className="absolute bottom-[7px] left-1/2 z-20 h-[5px] w-[134px] -translate-x-1/2 rounded-full bg-[#fff]/[0.85]" />
    </div>
  );
}

function StatusBar() {
  return (
    <div aria-hidden className="relative z-10 flex h-[50px] shrink-0 items-end justify-between px-8 pb-2 text-[15px] font-semibold text-ink">
      <span className="tabular-nums">9:41</span>
      <span className="flex items-center gap-1.5">
        <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor">
          <rect x="0" y="8" width="3" height="4" rx="0.8" />
          <rect x="5" y="5.5" width="3" height="6.5" rx="0.8" />
          <rect x="10" y="3" width="3" height="9" rx="0.8" />
          <rect x="15" y="0" width="3" height="12" rx="0.8" />
        </svg>
        <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor">
          <path d="M8 2.4c2.3 0 4.4.9 6 2.4l1.2-1.2A10.2 10.2 0 0 0 8 .7 10.2 10.2 0 0 0 .8 3.6L2 4.8a8.5 8.5 0 0 1 6-2.4Zm0 3.4c1.4 0 2.7.5 3.6 1.4l1.2-1.2A6.8 6.8 0 0 0 8 4.1 6.8 6.8 0 0 0 3.2 6l1.2 1.2c1-.9 2.2-1.4 3.6-1.4Zm0 3.4c.5 0 .9.2 1.2.5L8 11 6.8 9.7c.3-.3.7-.5 1.2-.5Z" />
        </svg>
        <svg width="26" height="12" viewBox="0 0 26 12" fill="none">
          <rect x="0.5" y="0.5" width="22" height="11" rx="3.2" stroke="currentColor" strokeOpacity="0.45" />
          <rect x="2.2" y="2.2" width="18.6" height="7.6" rx="1.8" fill="currentColor" />
          <path d="M24.2 4v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2Z" fill="currentColor" fillOpacity="0.45" />
        </svg>
      </span>
    </div>
  );
}

function PhoneHeader({
  onHome,
  onProfile,
  onVouchers,
}: {
  onHome: () => void;
  onProfile: () => void;
  onVouchers: () => void;
}) {
  return (
    <div className="flex h-[52px] items-center justify-between">
      <button type="button" onClick={onHome} aria-label="PRX — início" className="flex min-h-11 cursor-pointer items-center">
        <PrxLogo variant="compact" title="" className="h-[22px] w-auto text-ink" />
      </button>
      <span className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onVouchers}
          aria-label="Vouchers e QR Codes"
          className="glass-chip flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-ink transition-transform hover:scale-105 active:scale-95"
        >
          <IconQr size={16} />
        </button>
        <ObsidianBell count={1} className="h-10 w-10" />
        <button
          type="button"
          onClick={onProfile}
          aria-label="Perfil de Rafael"
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-[linear-gradient(135deg,#2a2342,#0e0f16)] text-[13px] font-semibold text-ink ring-1 ring-white/[0.2] transition-transform hover:scale-105 active:scale-95"
        >
          R
        </button>
      </span>
    </div>
  );
}

function PhonePage({
  title,
  children,
  onHome,
  onProfile,
  onVouchers,
}: {
  title: string;
  children: ReactNode;
  onHome: () => void;
  onProfile: () => void;
  onVouchers: () => void;
}) {
  return (
    <div className="px-5 pb-[112px]">
      <PhoneHeader onHome={onHome} onProfile={onProfile} onVouchers={onVouchers} />
      <p className="ob-display mb-5 mt-3 text-[24px] text-ink">{title}</p>
      {children}
    </div>
  );
}

function Banner({ image, title, caption }: { image: (typeof OBSIDIAN_IMAGES)[keyof typeof OBSIDIAN_IMAGES]; title: string; caption: string }) {
  return (
    <div className="relative isolate mt-4 flex h-[168px] flex-col justify-between overflow-hidden rounded-[22px] border border-white/[0.12] p-4 text-[#fff]">
      <Image src={image} alt="" fill sizes="360px" placeholder="blur" className="-z-10 object-cover object-[50%_55%]" />
      <span aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(5,5,8,0.55),rgba(5,5,8,0.05)_45%,rgba(5,5,8,0.85))]" />
      <span className="ob-label text-[15px] tracking-[0.16em]">{title}</span>
      <span className="ob-label text-[10px] tracking-[0.16em] text-[#e6e8ee]">{caption}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Celular 3D                                                                 */
/* -------------------------------------------------------------------------- */

type Angle = number | MotionValue<number>;

function useAngle(value: Angle | undefined, fallback: number): MotionValue<number> {
  const own = useMotionValue(typeof value === "number" ? value : fallback);
  useEffect(() => {
    if (typeof value === "number") own.set(value);
  }, [own, value]);
  return isMotionValue(value) ? value : own;
}

export interface ObsidianPhone3DProps {
  /** Rotação base (graus). Aceita MotionValue para seguir a rolagem da landing. */
  rotationX?: Angle;
  rotationY?: Angle;
  rotationZ?: Angle;
  /** Inclinação 3D sutil acompanhando o cursor, com reflexo de luz na tela. */
  pointerTilt?: boolean;
  /** Arrastar para girar livremente (visualizador do /teste). Duplo clique volta ao início. */
  draggable?: boolean;
  /** Zoom do visualizador (1 = tamanho natural). */
  zoom?: number;
  /** Conteúdo da tela; padrão: o app PRX de demonstração. */
  screen?: ReactNode;
  className?: string;
}

/**
 * Smartphone de alta fidelidade em CSS 3D: chassi de titânio escuro com
 * espessura real (camadas laterais), botões de titânio, Dynamic Island e
 * vidro com reflexo que muda de lugar conforme o aparelho inclina.
 */
export function ObsidianPhone3D({ rotationX, rotationY, rotationZ, pointerTilt = true, draggable = false, zoom = 1, screen, className }: ObsidianPhone3DProps) {
  const reduceMotion = useReducedMotion();
  const stage = useRef<HTMLDivElement>(null);
  const baseX = useAngle(rotationX, 8);
  const baseY = useAngle(rotationY, -16);
  const baseZ = useAngle(rotationZ, 0);

  // Cursor normalizado em [-1, 1] relativo ao centro do aparelho, com mola.
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const tiltX = useSpring(pointerX, { stiffness: 120, damping: 18, mass: 0.6 });
  const tiltY = useSpring(pointerY, { stiffness: 120, damping: 18, mass: 0.6 });
  // Arrasto livre (visualizador): graus somados à rotação base.
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  const dragXSpring = useSpring(dragX, { stiffness: 300, damping: 28 });
  const dragYSpring = useSpring(dragY, { stiffness: 300, damping: 28 });
  const zoomSpring = useSpring(zoom, { stiffness: 300, damping: 28 });

  useEffect(() => {
    zoomSpring.set(zoom);
  }, [zoom, zoomSpring]);

  const rotateX = useTransform(() => baseX.get() - tiltY.get() * 7 + dragXSpring.get());
  const rotateY = useTransform(() => baseY.get() + tiltX.get() * 9 + dragYSpring.get());
  const rotateZ = baseZ;

  // Reflexo: a mancha de luz corre na direção oposta à inclinação.
  const glareX = useTransform(() => 50 - tiltX.get() * 34 - dragYSpring.get() * 0.6);
  const glareY = useTransform(() => 30 - tiltY.get() * 26 + dragXSpring.get() * 0.4);
  const glare = useMotionTemplate`radial-gradient(520px circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.14), transparent 55%)`;

  useEffect(() => {
    if (!pointerTilt || reduceMotion) return;
    const onMove = (event: PointerEvent) => {
      const el = stage.current;
      if (!el || event.pointerType === "touch") return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const nx = (event.clientX - cx) / Math.max(window.innerWidth / 2, 1);
      const ny = (event.clientY - cy) / Math.max(window.innerHeight / 2, 1);
      pointerX.set(Math.max(-1, Math.min(1, nx)));
      pointerY.set(Math.max(-1, Math.min(1, ny)));
    };
    const onLeave = () => {
      pointerX.set(0);
      pointerY.set(0);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, [pointerTilt, reduceMotion, pointerX, pointerY]);

  const drag = useRef<{ x: number; y: number; rx: number; ry: number; id: number } | null>(null);
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggable) return;
    // Toques e cliques na tela do app continuam funcionando; o giro nasce na moldura ou fora dela.
    if ((event.target as HTMLElement).closest("[data-phone-screen]")) return;
    drag.current = { x: event.clientX, y: event.clientY, rx: dragX.get(), ry: dragY.get(), id: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start || start.id !== event.pointerId) return;
    dragY.set(start.ry + (event.clientX - start.x) * 0.45);
    dragX.set(Math.max(-60, Math.min(60, start.rx - (event.clientY - start.y) * 0.3)));
  };
  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.id === event.pointerId) drag.current = null;
  };

  return (
    <div
      ref={stage}
      data-device-mockup
      className={cn("relative select-none [perspective:1800px]", draggable && "cursor-grab touch-none active:cursor-grabbing", className)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => {
        if (!draggable) return;
        dragX.set(0);
        dragY.set(0);
      }}
    >
      {/* Sombra de contato no "chão" do estúdio */}
      <div aria-hidden className="absolute -bottom-10 left-1/2 h-16 w-[78%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgba(0,0,0,0.75),transparent)] blur-md" />
      <motion.div style={{ scale: zoomSpring }} className="[transform-style:preserve-3d]">
        <motion.div
          style={{ rotateX, rotateY, rotateZ, width: PHONE.width, height: PHONE.height }}
          className="relative [transform-style:preserve-3d]"
        >
          {/* Lateral de titânio: camadas empilhadas atrás da frente */}
          {EDGE_LAYERS.map((depth) => (
            <div
              key={depth}
              aria-hidden
              className="absolute inset-0"
              style={{
                borderRadius: PHONE.radius,
                transform: `translateZ(${-depth * 1.25}px)`,
                background: depth === EDGE_LAYERS.length ? "linear-gradient(160deg,#2b2c33,#0d0e12 55%,#23242b)" : "linear-gradient(90deg,#4a4c55,#1b1c21 18%,#2e3038 50%,#1b1c21 82%,#4a4c55)",
              }}
            />
          ))}

          {/* Botões laterais de titânio (ação, volume +/−, lateral) */}
          {[
            { side: "left", top: 150, h: 30 },
            { side: "left", top: 205, h: 58 },
            { side: "left", top: 276, h: 58 },
            { side: "right", top: 232, h: 92 },
          ].map((b) => (
            <span
              key={`${b.side}-${b.top}`}
              aria-hidden
              className="absolute w-[5px] rounded-full bg-[linear-gradient(90deg,#5b5d66,#23242a_60%,#3f414a)]"
              style={{ top: b.top, height: b.h, [b.side]: -3, transform: "translateZ(-5px)" } as CSSProperties}
            />
          ))}

          {/* Frente: aro de titânio → borda preta → tela */}
          <div
            className="absolute inset-0 [backface-visibility:hidden]"
            style={{
              borderRadius: PHONE.radius,
              padding: PHONE.frame,
              background: "linear-gradient(145deg,#6b6e78 0%,#25262c 24%,#3d3f47 50%,#16171b 76%,#555862 100%)",
              boxShadow: "0 50px 90px -30px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.05), 0 30px 120px -40px rgba(124,58,237,0.55)",
            }}
          >
            <div className="h-full w-full bg-[#010102]" style={{ borderRadius: PHONE.radius - PHONE.frame, padding: PHONE.bezel }}>
              <div
                data-phone-screen
                className="relative h-full w-full overflow-hidden bg-[#050508]"
                style={{ borderRadius: PHONE.radius - PHONE.frame - PHONE.bezel + 2 }}
              >
                {/* zoom (e não transform: scale) para o app caber na tela: um transform aninhado no plano 3D
                    quebra o hit-test do Chrome e os toques caíam na tela em vez dos botões. */}
                <div style={{ width: APP_WIDTH, height: APP_HEIGHT, zoom: APP_SCALE }}>{screen ?? <ObsidianPhoneApp />}</div>

                {/* Dynamic Island */}
                <div aria-hidden className="absolute left-1/2 top-[10px] z-30 flex h-[31px] w-[106px] -translate-x-1/2 items-center justify-end rounded-full bg-[#000] pr-2.5">
                  <span className="h-[9px] w-[9px] rounded-full bg-[radial-gradient(circle_at_35%_35%,#3b3f58,#0b0c14_70%)] ring-1 ring-white/[0.06]" />
                </div>

                {/* Vidro: reflexo fixo em diagonal + mancha de luz que acompanha a inclinação */}
                <div aria-hidden className="pointer-events-none absolute inset-0 z-30 bg-[linear-gradient(118deg,rgba(255,255,255,0.1)_0%,rgba(255,255,255,0.025)_26%,transparent_42%)]" />
                <motion.div aria-hidden className="pointer-events-none absolute inset-0 z-30 mix-blend-screen" style={{ backgroundImage: glare }} />
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
