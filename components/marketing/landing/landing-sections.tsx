// Hello World
"use client";

import { useId, useState, type ComponentType, type ReactNode } from "react";
import { Tagline } from "@/components/marketing/tagline";
import { AnimatePresence, motion } from "motion/react";
import { ObsidianPhone3D } from "@/components/obsidian/obsidian-phone";
import {
  IconBank,
  IconCard,
  IconChevronDown,
  IconCoin,
  IconCommunity,
  IconGift,
  IconHome,
  IconLevel,
  IconLive,
  IconLock,
  IconPass,
  IconPixDiamonds,
  IconProfile,
  IconQr,
  IconShield,
  IconTicket,
  IconUsers,
  IconWallet,
} from "@/components/icons/prx-icons";
import { cn } from "@/lib/utils";
import { GlassButton, LIQUID, LuxuryButton, Reveal, SectionHeading, Specular, brl } from "./landing-kit";

/*
 * Seções aprofundadas da nova landing (depois dos três momentos de rolagem):
 * o app ao vivo no celular 3D, como funciona, diferenciais, segurança, Sou Pai,
 * benefícios por perfil, planos, perguntas frequentes e a chamada final.
 * Superfícies e textos usam os tokens --rv-* e acompanham o tema claro/escuro.
 */

type IconComponent = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

export interface LandingLinks {
  appUrl: string;
  login: string;
  signup: string;
  parent: string;
}

const SECTION = "relative scroll-mt-24 bg-[var(--rv-bg)] px-5 py-20 sm:px-8 sm:py-28";
const WRAP = "mx-auto max-w-[1200px]";

/** Ícone em pastilha de vidro violeta. */
function IconBadge({ Icon }: { Icon: IconComponent }) {
  return (
    <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#7c3aed]/12 text-[#7c3aed] dark:bg-[#9468fa]/15 dark:text-[#b69cfb]">
      <Icon size={19} strokeWidth={1.6} />
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* O app ao vivo                                                              */
/* -------------------------------------------------------------------------- */

const APP_TABS: ReadonlyArray<{ Icon: IconComponent; name: string; text: string }> = [
  { Icon: IconHome, name: "Início", text: "Saldo, PRX Coins, seu nível e os próximos eventos em uma tela." },
  { Icon: IconBank, name: "PRX Bank", text: "Extrato completo, chaves Pix, cartão de metal e o resumo do mês." },
  { Icon: IconPass, name: "PRX Pass", text: "Voucher ativo com QR protegido e as vantagens dos parceiros." },
  { Icon: IconLive, name: "Live e Destaques", text: "Seu ingresso confirmado, a agenda e os momentos da comunidade." },
  { Icon: IconProfile, name: "Perfil", text: "XP até o próximo nível e as missões da semana (toque no avatar)." },
];

/** O celular 3D fica parado e estável: nada de flutuar pela tela; só a tela reage ao toque. */
export function AppShowcaseSection() {
  return (
    <section id="app" aria-labelledby="app-title" className={cn(SECTION, "overflow-x-clip")}>
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(40rem_30rem_at_70%_50%,var(--rv-haze),transparent_70%)]" />
      <div className={cn(WRAP, "relative grid items-center gap-12 lg:grid-cols-12 lg:gap-8")}>
        <div className="lg:col-span-5">
          <SectionHeading
            id="app-title"
            align="left"
            title="O app, ao vivo."
            accent="Toque e navegue."
            lead="Este é o PRX de verdade, com dados de demonstração. Troque de aba no celular e veja como o seu dinheiro, seus benefícios e seus eventos ficam juntos."
          />
          <ul className="mt-8 space-y-3">
            {APP_TABS.map((t, i) => (
              <li key={t.name}>
                <Reveal index={i} className={cn("relative flex items-start gap-4 overflow-hidden rounded-[20px] p-4", LIQUID.soft)}>
                  <IconBadge Icon={t.Icon} />
                  <span>
                    <span className="block text-[15px] font-semibold text-[var(--rv-ink)]">{t.name}</span>
                    <span className="mt-0.5 block text-[14px] leading-relaxed text-[var(--rv-body)]">{t.text}</span>
                  </span>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
        {/* No desktop o aparelho fica fixo na coluna (sticky) e cabe inteiro na tela, dock incluso. */}
        <div className="lg:sticky lg:top-[max(88px,calc(50dvh-320px))] lg:col-span-7 lg:self-start">
          <Reveal className="flex justify-center" amount={0.2}>
            {/* O aparelho tem 762px de altura fixa: margens negativas devolvem o espaço que a escala tira. */}
            <div className="-my-[99px] scale-[0.74] min-[400px]:-my-[61px] min-[400px]:scale-[0.84] sm:my-0 sm:scale-100 lg:-my-[69px] lg:scale-[0.82]">
              <ObsidianPhone3D rotationX={4} rotationY={-10} rotationZ={0} pointerTilt={false} />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Como funciona                                                              */
/* -------------------------------------------------------------------------- */

const STEPS: ReadonlyArray<{ title: string; text: string }> = [
  { title: "Crie sua conta", text: "Baixe o app, cadastre-se em poucos minutos e aceite os Termos. A idade mínima é 12 anos; menores de 18 entram com o consentimento do responsável." },
  { title: "Pague com Pix nos parceiros", text: "Cada pagamento é reconhecido na hora e categorizado no PRX Map: você vê para onde vai cada real, por nicho." },
  { title: "Ganhe coins e suba de nível", text: "Compras em parceiros, metas cumpridas e eventos rendem PRX Coins e XP. O PRX Level mostra o quanto você evoluiu." },
  { title: "Troque por experiências", text: "Use coins e o seu nível para destravar descontos de 20% a 50%, ingressos VIP, limites ampliados e lounges." },
];

export function HowItWorksSection() {
  return (
    <section id="como-funciona" aria-labelledby="como-funciona-title" className={cn(SECTION, "bg-[var(--rv-soft)]")}>
      <div className={WRAP}>
        <SectionHeading
          id="como-funciona-title"
          title="Como funciona."
          accent="Quatro passos, um ciclo que premia."
          lead="O PRX transforma o que você já faz no dia a dia em conquistas: quanto mais você cuida do seu dinheiro, mais o app devolve."
        />
        <ol className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <Reveal index={i} className={cn("relative h-full overflow-hidden rounded-[26px] p-6", LIQUID.soft)}>
                <Specular />
                <span className="relative block font-mono text-[13px] text-[#7c3aed] dark:text-[#b69cfb]">0{i + 1}</span>
                <h3 className="relative mt-6 text-[20px] font-semibold tracking-[-0.02em] text-[var(--rv-ink)]">{s.title}</h3>
                <p className="relative mt-2 text-[15px] leading-relaxed text-[var(--rv-body)]">{s.text}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Diferenciais                                                               */
/* -------------------------------------------------------------------------- */

const DIFFERENTIALS: ReadonlyArray<{ Icon: IconComponent; title: string; text: string }> = [
  { Icon: IconPixDiamonds, title: "Pix 24/7 sem tarifa", text: "Envie e receba a qualquer hora, sem custo por transação." },
  { Icon: IconCard, title: "Cartão de metal", text: "Virtual na ativação e físico sob pedido, sem anuidade." },
  { Icon: IconWallet, title: "PRX Map", text: "Seus gastos organizados por nicho, com o que é parceiro destacado." },
  { Icon: IconCoin, title: "Cashback em coins", text: "Cada compra em parceiro vira PRX Coins no mesmo instante." },
  { Icon: IconCommunity, title: "Comunidade e eventos", text: "PRX Live reúne shows, corridas e o Founders Demo Day." },
  { Icon: IconLevel, title: "Gamificação saudável", text: "Pontua quem economiza e bate metas; nunca quem arrisca." },
];

export function DifferentialsSection() {
  return (
    <section id="diferenciais" aria-labelledby="diferenciais-title" className={SECTION}>
      <div className={WRAP}>
        <SectionHeading
          id="diferenciais-title"
          title="Tudo o que um banco faz."
          accent="E o que nenhum outro faz por você."
          lead="Conta digital completa, benefícios de verdade e uma comunidade que valoriza quem constrói. Sem letras miúdas."
        />
        <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          {DIFFERENTIALS.map((d, i) => (
            <li key={d.title}>
              <Reveal index={i % 3} className={cn("relative flex h-full gap-4 overflow-hidden rounded-[24px] p-6", LIQUID.surface)}>
                <Specular />
                <IconBadge Icon={d.Icon} />
                <span className="relative">
                  <h3 className="text-[17px] font-semibold tracking-[-0.01em] text-[var(--rv-ink)]">{d.title}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-[var(--rv-body)]">{d.text}</p>
                </span>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Segurança                                                                  */
/* -------------------------------------------------------------------------- */

const SECURITY: ReadonlyArray<{ Icon: IconComponent; title: string; text: string }> = [
  { Icon: IconLock, title: "Entrada com biometria", text: "Acesse com passkey (digital ou rosto) no aparelho, sem digitar senha a cada vez." },
  { Icon: IconQr, title: "QR Code protegido", text: "Cupons e ingressos geram códigos exclusivos no celular, validados direto no balcão do parceiro." },
  { Icon: IconShield, title: "Conexão protegida", text: "Todo o tráfego é criptografado (HTTPS com HSTS) e as sessões são assinadas no servidor." },
  { Icon: IconUsers, title: "Privacidade pela LGPD", text: "Nenhum acesso sem o aceite dos Termos e da Política de Privacidade; menores só com o responsável." },
];

export function SecuritySection() {
  return (
    <section id="seguranca" aria-labelledby="seguranca-title" className="relative scroll-mt-24 overflow-hidden bg-[#050508] px-5 py-20 text-white sm:px-8 sm:py-28">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(50rem_30rem_at_20%_0%,rgba(124,58,237,0.24),transparent_70%),radial-gradient(40rem_26rem_at_90%_100%,rgba(0,102,255,0.14),transparent_70%)]" />
      <div className={cn(WRAP, "relative grid gap-12 lg:grid-cols-12 lg:gap-10")}>
        <div className="lg:col-span-5">
          <Reveal amount={0.6}>
            <h2 id="seguranca-title" className="text-balance text-[clamp(28px,7vw,44px)] font-semibold leading-[1.04] tracking-[-0.04em] md:text-[clamp(40px,4.4vw,60px)]">
              Segurança em cada camada.
            </h2>
          </Reveal>
          <Reveal index={1} amount={0.6}>
            <p className="mt-5 text-pretty text-[16px] leading-relaxed text-white/75 sm:text-[18px]">
              Seu dinheiro, seus dados e a conta do seu filho protegidos do login ao balcão. Você decide o que compartilhar.
            </p>
          </Reveal>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:col-span-7">
          {SECURITY.map((s, i) => (
            <li key={s.title}>
              <Reveal index={i} className={cn("relative h-full overflow-hidden rounded-[24px] p-6", LIQUID.dark)}>
                <Specular />
                <span aria-hidden className="relative flex h-11 w-11 items-center justify-center rounded-full bg-[#9468fa]/15 text-[#c4b1fd]">
                  <s.Icon size={19} strokeWidth={1.6} />
                </span>
                <h3 className="relative mt-5 text-[17px] font-semibold">{s.title}</h3>
                <p className="relative mt-1.5 text-[15px] leading-relaxed text-white/75">{s.text}</p>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Sou Pai                                                                    */
/* -------------------------------------------------------------------------- */

const PARENT_FEATURES: ReadonlyArray<{ title: string; text: string }> = [
  { title: "Mesada automática", text: "Escolha o valor e o dia: ela cai às 9h (Brasília), direto na conta do seu filho." },
  { title: "Limites de gasto", text: "Defina quanto pode sair no cartão e no Pix. Acima do limite, o PRX bloqueia na hora." },
  { title: "Extrato em tempo real", text: "Pix, compras, mesada e cashbacks aparecem para você assim que acontecem." },
  { title: "Benefícios, coins e XP", text: "Acompanhe o que ele resgatou no PRX Pass e como está evoluindo no PRX Level." },
  { title: "Eventos e ingressos", text: "Veja cada ingresso do PRX Live e os projetos enviados ao PRX Founders." },
  { title: "Consentimento do responsável", text: "A conta do menor nasce vinculada a você, com seus documentos e o seu aceite (LGPD)." },
];

const KID_ACTIVITY: ReadonlyArray<{ label: string; meta: string; value: number; incoming: boolean }> = [
  { label: "Mesada", meta: "automática · dia 5", value: 400, incoming: true },
  { label: "Cantina da escola", meta: "Parceiro PRX · +8 coins", value: 14.5, incoming: false },
  { label: "Pix para Ana", meta: "dentro do limite", value: 25, incoming: false },
];

/** Painel da Conta Pai em vidro fumê: o que o responsável vê, com dados de demonstração. */
function ParentPanel() {
  const used = 62;
  return (
    <div className={cn("relative overflow-hidden rounded-[30px] p-6 text-white sm:p-7", LIQUID.dark, "bg-[#0b0b12]/90")}>
      <Specular />
      <div className="relative flex items-center justify-between">
        <div>
          <p className="ob-label text-[11px] text-white/70">Conta Pai</p>
          <p className="mt-1 text-[20px] font-semibold tracking-[-0.02em]">Conta do Lucas, 15</p>
        </div>
        <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[12px] font-medium text-emerald-300">Vinculada</span>
      </div>
      {/* Abaixo de 400px os dois valores empilham: lado a lado "R$ 312,40" não cabe no cartão. */}
      <div className="relative mt-6 grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
        <div className="rounded-[18px] bg-white/[0.05] p-4">
          <p className="text-[12px] text-white/70">Saldo</p>
          <p className="mt-1 text-[22px] font-light tabular-nums">{brl.format(312.4)}</p>
        </div>
        <div className="rounded-[18px] bg-white/[0.05] p-4">
          <p className="text-[12px] text-white/70">Próxima mesada</p>
          <p className="mt-1 text-[22px] font-light tabular-nums">{brl.format(400)}</p>
        </div>
      </div>
      <div className="relative mt-4 rounded-[18px] bg-white/[0.05] p-4">
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-white/80">Limite diário (cartão + Pix)</span>
          <span className="tabular-nums text-white/80">
            {brl.format(31)} de {brl.format(50)}
          </span>
        </div>
        <div role="progressbar" aria-label="Limite diário usado" aria-valuemin={0} aria-valuemax={100} aria-valuenow={used} className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/[0.1]">
          <motion.span
            className="block h-full origin-left rounded-full bg-[#9468fa]"
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: used / 100 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ type: "spring", stiffness: 300, damping: 28, delay: 0.2 }}
          />
        </div>
      </div>
      <ul className="relative mt-4 divide-y divide-white/[0.07]">
        {KID_ACTIVITY.map((a) => (
          <li key={a.label} className="flex items-center justify-between gap-3 py-3">
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-medium">{a.label}</span>
              <span className="block truncate text-[12px] text-white/65">{a.meta}</span>
            </span>
            <span className={cn("shrink-0 text-[14px] font-medium tabular-nums", a.incoming ? "text-emerald-300" : "text-white")}>
              {a.incoming ? "+" : "−"} {brl.format(a.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ParentSection({ links }: { links: LandingLinks }) {
  return (
    <section id="sou-pai" aria-labelledby="sou-pai-title" className={cn(SECTION, "overflow-hidden")}>
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(44rem_30rem_at_85%_40%,var(--rv-haze),transparent_70%)]" />
      <div className={cn(WRAP, "relative grid items-center gap-12 lg:grid-cols-12 lg:gap-12")}>
        <div className="lg:col-span-6">
          <SectionHeading
            id="sou-pai-title"
            align="left"
            title="Sou Pai."
            accent="Liberdade para eles, tranquilidade para você."
            lead="A Conta Pai conecta você à conta do seu filho: mesada automática, limites de gasto e acompanhamento de tudo o que ele faz no PRX, em tempo real."
          />
          <ul className="mt-8 grid gap-x-6 gap-y-5 sm:grid-cols-2">
            {PARENT_FEATURES.map((f, i) => (
              <li key={f.title}>
                <Reveal index={i % 2} className="border-l-2 border-[#7c3aed]/50 pl-4">
                  <h3 className="text-[15px] font-semibold text-[var(--rv-ink)]">{f.title}</h3>
                  <p className="mt-1 text-[14px] leading-relaxed text-[var(--rv-body)]">{f.text}</p>
                </Reveal>
              </li>
            ))}
          </ul>
          <Reveal className="mt-9 flex flex-wrap gap-3">
            <LuxuryButton href={links.parent} className="px-6 text-[15px]">
              Abrir a Conta Pai
            </LuxuryButton>
            <GlassButton href="#faq">Dúvidas frequentes</GlassButton>
          </Reveal>
        </div>
        <Reveal className="lg:col-span-6" amount={0.25}>
          <ParentPanel />
        </Reveal>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Benefícios por perfil                                                      */
/* -------------------------------------------------------------------------- */

const AUDIENCES: ReadonlyArray<{ Icon: IconComponent; who: string; title: string; items: readonly string[] }> = [
  {
    Icon: IconGift,
    who: "Para você",
    title: "Sua rotina rende mais.",
    items: ["Descontos de 20% a 50% nos parceiros", "PRX Coins em cada compra reconhecida", "Ingressos VIP e cashback no balcão", "Nível que destrava limites e lounges"],
  },
  {
    Icon: IconUsers,
    who: "Para responsáveis",
    title: "Educação financeira na prática.",
    items: ["Mesada automática no dia escolhido", "Limites de cartão e Pix ajustáveis", "Extrato do filho em tempo real", "Metas que ensinam a guardar"],
  },
  {
    Icon: IconTicket,
    who: "Para parceiros",
    title: "Clientes que voltam.",
    items: ["Pagamento via Pix reconhecido na hora", "Cupons validados por QR no balcão", "Público jovem e engajado da comunidade", "Painel próprio para acompanhar resgates"],
  },
];

export function AudiencesSection() {
  return (
    <section id="beneficios" aria-labelledby="beneficios-title" className={cn(SECTION, "bg-[var(--rv-soft)]")}>
      <div className={WRAP}>
        <SectionHeading
          id="beneficios-title"
          title="Benefícios para cada lado."
          accent="Quem usa, quem cuida e quem vende."
          lead="O ecossistema só funciona porque todo mundo ganha: o membro economiza, o responsável acompanha e o parceiro conquista clientes fiéis."
        />
        <ul className="mt-14 grid gap-4 lg:grid-cols-3 lg:gap-5">
          {AUDIENCES.map((a, i) => (
            <li key={a.who}>
              <Reveal index={i} className={cn("relative h-full overflow-hidden rounded-[28px] p-7", LIQUID.surface)}>
                <Specular />
                <div className="relative flex items-center gap-3">
                  <IconBadge Icon={a.Icon} />
                  <p className="ob-label text-[12px] text-[var(--rv-body)]">{a.who}</p>
                </div>
                <h3 className="relative mt-6 text-[24px] font-semibold tracking-[-0.03em] text-[var(--rv-ink)]">{a.title}</h3>
                <ul className="relative mt-5 space-y-3">
                  {a.items.map((item) => (
                    <li key={item} className="flex gap-3 text-[15px] leading-snug text-[var(--rv-body)]">
                      <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#7c3aed] dark:bg-[#9468fa]" />
                      {item}
                    </li>
                  ))}
                </ul>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Planos                                                                     */
/* -------------------------------------------------------------------------- */

interface Plan {
  name: string;
  badge: string;
  headline: string;
  items: readonly string[];
  cta: { label: string; href: (l: LandingLinks) => string };
  featured?: boolean;
}

const PLANS: ReadonlyArray<Plan> = [
  {
    name: "Conta PRX",
    badge: "Para começar",
    headline: "Sem tarifa no Pix e sem anuidade.",
    items: ["Conta digital e Pix 24/7", "Cartão virtual na ativação", "PRX Pass com descontos em parceiros", "PRX Coins desde a primeira compra"],
    cta: { label: "Criar conta", href: (l) => l.signup },
  },
  {
    name: "PRX Level",
    badge: "Conquistado, não comprado",
    headline: "Suba de nível usando o app.",
    items: ["Limites ampliados a cada nível", "Anuidade zero no cartão de metal", "Acesso a lounges VIP", "Benefícios maiores no PRX Pass e no Live"],
    cta: { label: "Ver como funciona", href: () => "#como-funciona" },
    featured: true,
  },
  {
    name: "Conta Pai",
    badge: "Para responsáveis",
    headline: "A conta do seu filho, com você por perto.",
    items: ["Mesada automática", "Limites de cartão e Pix", "Extrato e benefícios do filho", "Cadastro guiado com consentimento"],
    cta: { label: "Abrir a Conta Pai", href: (l) => l.parent },
  },
];

export function PlansSection({ links }: { links: LandingLinks }) {
  return (
    <section id="planos" aria-labelledby="planos-title" className={SECTION}>
      <div className={WRAP}>
        <SectionHeading
          id="planos-title"
          title="Planos."
          accent="O próximo nível se conquista."
          lead="Comece com a conta sem tarifa no Pix. Os benefícios maiores não se compram: chegam conforme você evolui no PRX Level."
        />
        <ul className="mt-14 grid gap-4 lg:grid-cols-3 lg:gap-5">
          {PLANS.map((p, i) => (
            <li key={p.name}>
              <Reveal
                index={i}
                className={cn(
                  "relative flex h-full flex-col overflow-hidden rounded-[28px] p-7",
                  p.featured ? cn(LIQUID.dark, "bg-[#0b0b12] text-white ring-1 ring-[#9468fa]/40") : LIQUID.surface,
                )}
              >
                <Specular />
                <div className="relative flex items-center justify-between gap-3">
                  <h3 className={cn("text-[22px] font-semibold tracking-[-0.02em]", p.featured ? "text-white" : "text-[var(--rv-ink)]")}>{p.name}</h3>
                  <span className={cn("rounded-full px-3 py-1 text-[11.5px] font-semibold", p.featured ? "bg-[#9468fa]/20 text-[#d8cbfd]" : "bg-[#7c3aed]/10 text-[#6d28d9] dark:bg-[#9468fa]/15 dark:text-[#c4b1fd]")}>
                    {p.badge}
                  </span>
                </div>
                <p className={cn("relative mt-4 text-[17px] leading-snug", p.featured ? "text-white/90" : "text-[var(--rv-ink)]")}>{p.headline}</p>
                <ul className="relative mt-6 flex-1 space-y-3">
                  {p.items.map((item) => (
                    <li key={item} className={cn("flex gap-3 text-[15px] leading-snug", p.featured ? "text-white/80" : "text-[var(--rv-body)]")}>
                      <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#9468fa]" />
                      {item}
                    </li>
                  ))}
                </ul>
                <div className="relative mt-8">
                  {p.featured ? (
                    <LuxuryButton href={p.cta.href(links)} className="w-full">
                      {p.cta.label}
                    </LuxuryButton>
                  ) : (
                    <GlassButton href={p.cta.href(links)} className="w-full">
                      {p.cta.label}
                    </GlassButton>
                  )}
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* FAQ                                                                        */
/* -------------------------------------------------------------------------- */

const FAQ: ReadonlyArray<{ q: string; a: ReactNode }> = [
  { q: "O que é o PRX?", a: "Um super app que junta conta digital (PRX Bank), clube de benefícios (PRX Pass) e eventos (PRX Live), e transforma hábitos positivos em recompensas: PRX Coins, XP e níveis." },
  { q: "Tem tarifa ou anuidade?", a: "O Pix não tem tarifa por transação e o cartão não tem anuidade. Benefícios maiores, como limites ampliados e lounges, são desbloqueados pelo PRX Level." },
  { q: "Como ganho PRX Coins?", a: "Pagando com Pix em parceiros PRX (a compra é reconhecida na hora), cumprindo missões e metas e participando dos eventos da comunidade." },
  { q: "O que o PRX Level desbloqueia?", a: "Cada nível amplia limites e libera vantagens como anuidade zero, acesso a lounges VIP e benefícios maiores no PRX Pass e no PRX Live." },
  { q: "Como funciona a Conta Pai?", a: "O responsável abre a Conta Pai, cadastra o filho e define mesada automática e limites de gasto no cartão e no Pix. Tudo o que o filho faz aparece no extrato do responsável." },
  { q: "Menor de idade pode usar o PRX?", a: "Pode, a partir de 12 anos e com a conta vinculada a um responsável: o cadastro pede os documentos e o consentimento do responsável, como manda a LGPD." },
  { q: "Onde uso o PRX Pass?", a: "Nos estabelecimentos parceiros credenciados. Você gera o cupom no app e mostra o QR Code protegido no balcão; o desconto sai na hora." },
  { q: "Quando chegam o PRX Invest e o PRX Me?", a: "Estão em construção. O Invest trará caixinhas e metas para os seus planos, e o Me, conteúdo de saúde mental e longevidade. Avisaremos no app." },
];

function FaqItem({ q, a, index }: { q: string; a: ReactNode; index: number }) {
  const [open, setOpen] = useState(index === 0);
  const id = useId();
  return (
    <li className={cn("overflow-hidden rounded-[20px]", LIQUID.soft)}>
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-14 w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left text-[16px] font-semibold text-[var(--rv-ink)] sm:px-6"
        >
          {q}
          <motion.span aria-hidden animate={{ rotate: open ? 180 : 0 }} transition={{ type: "spring", stiffness: 300, damping: 28 }} className="shrink-0 text-[var(--rv-muted)]">
            <IconChevronDown size={18} />
          </motion.span>
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            role="region"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 34 }}
          >
            <p className="px-5 pb-5 text-[15px] leading-relaxed text-[var(--rv-body)] sm:px-6">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

export function FaqSection() {
  return (
    <section id="faq" aria-labelledby="faq-title" className={cn(SECTION, "bg-[var(--rv-soft)]")}>
      <div className="mx-auto grid max-w-[1200px] gap-10 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <SectionHeading id="faq-title" align="left" title="Perguntas frequentes." lead="O essencial sobre conta, benefícios, níveis e a Conta Pai." />
        </div>
        <ul className="space-y-3 lg:col-span-8">
          {FAQ.map((f, i) => (
            <FaqItem key={f.q} q={f.q} a={f.a} index={i} />
          ))}
        </ul>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Chamada final                                                              */
/* -------------------------------------------------------------------------- */

export function FinalCtaSection({ links }: { links: LandingLinks }) {
  return (
    <section id="comecar" aria-labelledby="comecar-title" className="relative scroll-mt-24 overflow-hidden bg-[#050508] px-5 py-24 text-center text-white sm:px-8 sm:py-32">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(46rem_26rem_at_50%_100%,rgba(124,58,237,0.32),transparent_70%)]" />
      <div className="relative mx-auto max-w-[760px]">
        <Reveal amount={0.6}>
          <h2 id="comecar-title" className="ob-display text-balance text-[clamp(26px,7vw,40px)] leading-[1.12] tracking-[0.06em] md:text-[clamp(40px,4.2vw,56px)]">
            <Tagline />
          </h2>
        </Reveal>
        <Reveal index={1} amount={0.6}>
          <p className="mx-auto mt-6 max-w-[520px] text-pretty text-[16px] leading-relaxed text-white/75 sm:text-[18px]">
            Crie sua conta em poucos minutos e comece a transformar cada gasto em conquista.
          </p>
        </Reveal>
        <Reveal index={2} className="mt-9 flex flex-wrap justify-center gap-3">
          <LuxuryButton href={links.signup} className="px-7 text-[15px]">
            Criar conta
          </LuxuryButton>
          <a
            href={links.login}
            className={cn("inline-flex min-h-12 cursor-pointer items-center justify-center rounded-full px-7 text-[15px] font-semibold text-white transition-transform hover:-translate-y-px active:scale-[0.98]", LIQUID.dark)}
          >
            Já tenho conta · Entrar
          </a>
        </Reveal>
      </div>
    </section>
  );
}
