// Hello World
"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { PrxLogo } from "@/components/brand/prx-logo";
import { OBSIDIAN_IMAGES } from "@/components/obsidian/obsidian-ui";
import { cn } from "@/lib/utils";
import {
  BackdropPhoto,
  Chips,
  GlassCard,
  Haze,
  Lead,
  Masked,
  PhotoFrame,
  ProductName,
  Reveal,
  Signature,
  Statement,
  Steps,
  Tagline,
  type SlideTone,
} from "@/components/show/show-kit";
import { CircleRings, MorningSun, PerspectiveDoor, RunLanes } from "@/components/show/show-visuals";

/*
 * As 19 páginas da apresentação "PRX — The ecosystem for the next generation".
 * O texto é o do roteiro, sem acréscimos; as composições seguem a landing:
 * breu com fotos da marca, páginas brancas de respiro (Car, Investimentos, Up, Circle)
 * e o fecho no mesmo breu da capa.
 */

export interface SlideDef {
  id: string;
  label: string;
  tone: SlideTone;
  media?: ReactNode;
  content: ReactNode;
}

const GRID = "grid items-center gap-12 lg:grid-cols-12 lg:gap-10";

/* 1 — Capa ---------------------------------------------------------------- */

/** A capa entra só com CSS (sem esperar o JavaScript): o título é o primeiro conteúdo da tela. */
function Cover() {
  return (
    <div className="flex min-h-[calc(100dvh-13rem)] flex-col justify-between gap-16">
      <div>
        <PrxLogo variant="compact" title="PRX" className="show-fade h-12 w-auto text-white sm:h-16 lg:h-20" />
        <h1 id="capa-title" className="ob-display mt-10 text-[clamp(34px,8.4vw,96px)] leading-[1] tracking-[0.06em] text-white sm:mt-14">
          {["The ecosystem", "for the next", "generation"].map((line, i) => (
            <span key={line} className="block overflow-hidden pb-[0.1em]">
              <span className="show-line block" style={{ animationDelay: `${120 + i * 90}ms` }}>
                {line}
              </span>
            </span>
          ))}
        </h1>
        <ul aria-label="O que a PRX reúne" className="show-fade mt-8 flex max-w-[760px] flex-wrap gap-x-5 gap-y-2 text-[16px] text-[var(--s-body)] [animation-delay:420ms] sm:text-[19px]">
          {["Finanças.", "Oportunidades.", "Experiências.", "Conexões.", "Futuro."].map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </div>
      <p className="ob-label show-fade text-[13px] text-[var(--s-accent)] [animation-delay:560ms] sm:text-[15px]">The next pays</p>
    </div>
  );
}

function CoverMedia() {
  return (
    <>
      <Haze at="72% 44%" />
      <div aria-hidden className="show-crystal absolute inset-y-0 right-[-30%] -z-10 w-[120%] opacity-90 mix-blend-screen sm:right-[-12%] sm:w-[80%] lg:right-[-4%] lg:w-[58%]">
        <Image
          src={OBSIDIAN_IMAGES.crystal}
          alt=""
          fill
          loading="eager"
          fetchPriority="high"
          sizes="(min-width: 1024px) 58vw, 90vw"
          className="object-cover [mask-image:radial-gradient(closest-side,#000_40%,transparent_100%)]"
        />
      </div>
    </>
  );
}

/* 2 — O que é a PRX -------------------------------------------------------- */

const JOURNEYS: ReadonlyArray<[string, string]> = [
  ["Do primeiro investimento", "ao primeiro carro."],
  ["Do primeiro apê", "ao primeiro negócio."],
  ["Da saúde mental", "às conexões certas."],
];

function WhatIs() {
  return (
    <div className="space-y-16 lg:space-y-20">
      <div className={GRID}>
        <div className="lg:col-span-7">
          <Masked
            as="h2"
            id="prx-title"
            lines={[
              "A vida jovem acontece",
              "em vários lugares.",
              <span key="a" className="text-[var(--s-accent)]">
                A PRX conecta todos eles.
              </span>,
            ]}
            className="text-balance text-[clamp(28px,5vw,58px)] font-semibold leading-[1.02] tracking-[-0.045em] text-[var(--s-ink)]"
          />
          <Lead>Um ecossistema criado para transformar boas escolhas, comportamento e ambição em acesso, benefícios e oportunidades reais.</Lead>
        </div>
        <ul aria-label="Momentos que a PRX conecta" className="space-y-3 lg:col-span-5">
          {JOURNEYS.map(([from, to], i) => (
            <li key={from}>
              <Reveal index={i}>
                <GlassCard className="p-5 sm:p-6">
                  <p className="text-[17px] font-medium text-[var(--s-ink)] sm:text-[19px]">{from}</p>
                  <p className="mt-1 flex items-center gap-3 text-[17px] text-[var(--s-body)] sm:text-[19px]">
                    <span aria-hidden className="h-px w-8 bg-[var(--s-accent)]" />
                    {to}
                  </p>
                </GlassCard>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
      <Statement accent="Queremos crescer com ela.">Não queremos apenas falar com a próxima geração.</Statement>
    </div>
  );
}

/* 3 — PRX PASS -------------------------------------------------------------- */

function Pass() {
  return (
    <div className={GRID}>
      <div className="lg:col-span-7">
        <ProductName id="pass" name="PASS" />
        <Tagline lines={["Seu comportamento", "vale mais."]} />
        <Lead>O clube de benefícios da PRX conecta membros a marcas, produtos, serviços e experiências com condições exclusivas dentro do app.</Lead>
        <Chips label="Vantagens do PRX PASS" items={["Descontos.", "Cashback.", "Condições especiais.", "Acesso antecipado.", "Experiências members only."]} />
        <Reveal index={3}>
          <p className="mt-8 max-w-[560px] text-[17px] leading-relaxed text-[var(--s-ink)] sm:text-[19px]">
            E uma nova lógica: <strong className="font-semibold text-[var(--s-accent)]">boas escolhas podem desbloquear melhores benefícios.</strong>
          </p>
        </Reveal>
        <Signature index={4}>The future pays more.</Signature>
      </div>
      <Reveal index={1} className="lg:col-span-5">
        <PhotoFrame
          src={OBSIDIAN_IMAGES.cardMetal}
          alt="Cartão de metal PRX com o símbolo em relevo"
          focus="object-[50%_40%]"
          className="mx-auto aspect-[3/4] w-full max-w-[440px]"
        />
      </Reveal>
    </div>
  );
}

/* 4 — PRX CAR --------------------------------------------------------------- */

function Car() {
  return (
    <div className="space-y-14">
      <div className={GRID}>
        <div className="lg:col-span-6">
          <ProductName id="car" name="CAR" />
          <Tagline lines={["Meu primeiro carro.", "Minha primeira", "grande escolha."]} />
          <Lead>Uma jornada dentro da PRX para ajudar o jovem a conquistar seu primeiro carro com mais inteligência.</Lead>
        </div>
        <Reveal index={1} className="lg:col-span-6">
          <GlassCard>
            <h3 className="ob-label text-[12px] text-[var(--s-muted)]">Parceiros automotivos podem oferecer</h3>
            <Steps
              className="mt-4"
              label="O que os parceiros automotivos podem oferecer"
              items={["Condições exclusivas para membros.", "Descontos e bônus.", "Entrada facilitada.", "Financiamento e benefícios especiais."]}
            />
          </GlassCard>
        </Reveal>
      </div>
      <Reveal index={2}>
        <p className="text-[16px] text-[var(--s-body)] sm:text-[19px]">Antes de perguntar “qual carro você quer?”, a PRX ajuda a responder:</p>
        <p className="mt-4 max-w-[980px] text-balance text-[clamp(26px,4.6vw,54px)] font-semibold leading-[1.04] tracking-[-0.045em] text-[var(--s-accent)]">
          “Qual carro cabe na vida que você quer construir?”
        </p>
      </Reveal>
    </div>
  );
}

/* 5 — PRX HOME -------------------------------------------------------------- */

function Home() {
  return (
    <div className={GRID}>
      <div className="lg:col-span-7">
        <ProductName id="home" name="HOME" />
        <Tagline lines={["Meu primeiro apê", "começa antes da chave."]} />
        <Lead>A PRX conecta jovens a incorporadoras e construtoras parceiras com condições pensadas para a primeira aquisição.</Lead>
        <Chips label="Condições do PRX HOME" items={["Compactos.", "Condições exclusivas.", "Entrada diferenciada.", "Benefícios para membros."]} />
        <Lead index={3} className="mt-8 text-[var(--s-ink)]">
          Mais do que anunciar imóveis, queremos construir uma jornada de preparação para a independência.
        </Lead>
        <Signature index={4}>First home. Next chapter.</Signature>
      </div>
      <div className="mx-auto w-full max-w-[420px] lg:col-span-5">
        <PerspectiveDoor />
      </div>
    </div>
  );
}

/* 6 — PRX BANK -------------------------------------------------------------- */

const BANK_FEATURES = ["Conta.", "Pix.", "Cartão.", "Pagamentos.", "Benefícios.", "Educação financeira."];

function Bank() {
  return (
    <div className={GRID}>
      <div className="lg:col-span-7">
        <ProductName id="bank" name="BANK" />
        <Tagline lines={["Um banco que recompensa", "quem sabe escolher."]} />
        <Lead>Uma experiência financeira pensada para a Geração Z, construída por meio de parceiros regulados e infraestrutura BaaS.</Lead>
        <Reveal index={2}>
          <ul
            aria-label="O que o PRX BANK oferece"
            className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-[20px] border border-[var(--s-line)] bg-[var(--s-line)] sm:grid-cols-3"
          >
            {BANK_FEATURES.map((f) => (
              <li key={f} className="bg-[#08080d] px-4 py-5 text-[15px] font-medium text-[var(--s-ink)] sm:text-[17px]">
                {f}
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal index={3}>
          <p className="mt-8 max-w-[600px] text-[17px] leading-relaxed text-[var(--s-body)] sm:text-[19px]">
            Mas com uma diferença: <strong className="font-semibold text-[var(--s-ink)]">na PRX, comportamento financeiro positivo pode virar vantagem.</strong>
          </p>
        </Reveal>
      </div>
      <Reveal index={1} className="lg:col-span-5">
        <PhotoFrame src={OBSIDIAN_IMAGES.bankCard} alt="Cartão PRX preto apoiado em uma pedra de obsidiana" focus="object-[50%_50%]" className="mx-auto aspect-[3/4] w-full max-w-[440px]" />
      </Reveal>
    </div>
  );
}

/* 7 — NO BET ------------------------------------------------------------------ */

function NoBet() {
  return (
    <div className="space-y-14">
      <div className="max-w-[980px]">
        <Reveal>
          <h2 id="no-bet-title" className="ob-display text-[clamp(52px,15vw,168px)] leading-[0.9] tracking-[0.05em] text-white">
            No <span className="text-[var(--s-accent)]">bet</span>
          </h2>
        </Reveal>
        <Tagline lines={["Não apostar também", "pode valer."]} />
      </div>
      <div className={GRID}>
        <div className="lg:col-span-6">
          <Lead className="mt-0">Uma das primeiras mecânicas de comportamento da PRX.</Lead>
          <Lead index={2}>
            A proposta é reconhecer usuários elegíveis que passam determinados períodos sem transações identificadas para plataformas de apostas, respeitando critérios técnicos,
            regulatórios e de privacidade.
          </Lead>
        </div>
        <Reveal index={2} className="lg:col-span-6">
          <GlassCard>
            <h3 className="ob-label text-[12px] text-[var(--s-muted)]">O comportamento pode desbloquear</h3>
            <p className="mt-4 text-[clamp(22px,2.6vw,30px)] font-semibold leading-[1.15] tracking-[-0.03em] text-white">
              Pontos, benefícios e experiências dentro do ecossistema.
            </p>
          </GlassCard>
        </Reveal>
      </div>
      <Statement accent="queremos ajudá-lo a construir patrimônio." index={3}>
        Enquanto outros apps disputam o dinheiro do jovem,
      </Statement>
    </div>
  );
}

/* 8 — PRX INVEST ---------------------------------------------------------- */

const DREAMS = ["Quero viajar.", "Quero meu carro.", "Quero meu apê.", "Quero liberdade.", "Quero ficar rico cedo."];

function Invest() {
  return (
    <div>
      <ProductName id="invest" name="INVEST" />
      <div className={cn(GRID, "mt-2")}>
        <div className="lg:col-span-6">
          <Tagline lines={["Não comece pelo produto.", "Comece pelo sonho."]} />
          <Reveal index={2}>
            <p className="mt-8 text-[17px] text-[var(--s-body)] sm:text-[19px]">O jovem não acorda pensando:</p>
            <p className="mt-2 text-[clamp(22px,2.8vw,30px)] font-medium tracking-[-0.02em] text-[var(--s-muted)] line-through decoration-[var(--s-accent)] decoration-2">
              “Quero comprar um ETF.”
            </p>
          </Reveal>
          <Lead index={3} className="mt-8">
            A PRX INVEST transforma objetivos de vida em portas de entrada para educação financeira e investimentos, com produtos disponibilizados por instituições parceiras e
            conforme perfil e elegibilidade do usuário.
          </Lead>
        </div>
        <div className="lg:col-span-6">
          <Reveal>
            <p className="ob-label text-[12px] text-[var(--s-muted)]">Ele pensa:</p>
          </Reveal>
          <Masked lines={DREAMS} className="ob-display mt-4 text-[clamp(28px,4.4vw,56px)] leading-[1.12] tracking-[0.04em] text-white [&>span:last-child]:text-[var(--s-accent)]" />
        </div>
      </div>
    </div>
  );
}

/* 9 — Investir em quê? Investir pra quê? ------------------------------------- */

const INVEST_LINES: ReadonlyArray<{
  line: string;
  goal: string;
  products: string;
}> = [
  {
    line: "PRX START",
    goal: "Meu primeiro investimento",
    products: "Tesouro, CDBs, fundos conservadores",
  },
  {
    line: "PRX TRIP",
    goal: "Minha próxima viagem",
    products: "Renda fixa de curto/médio prazo",
  },
  {
    line: "PRX CAR",
    goal: "Meu primeiro carro",
    products: "Renda fixa + carteira por objetivo",
  },
  {
    line: "PRX HOME",
    goal: "Meu primeiro apê",
    products: "Carteira de longo prazo",
  },
  {
    line: "PRX GLOBAL",
    goal: "Quero investir no mundo",
    products: "ETFs/fundos internacionais",
  },
  {
    line: "PRX TECH",
    goal: "Quero investir no futuro",
    products: "Tecnologia e inovação",
  },
  {
    line: "PRX GREEN",
    goal: "Dinheiro + impacto",
    products: "Ativos/fundos ESG",
  },
  {
    line: "PRX FREEDOM",
    goal: "Independência financeira",
    products: "Carteira diversificada",
  },
  {
    line: "PRX RETIRE",
    goal: "Começar cedo muda tudo",
    products: "Previdência + longo prazo",
  },
];

function InvestLines() {
  return (
    <div className="space-y-10">
      <div className="max-w-[900px]">
        <Masked
          as="h2"
          id="investimentos-title"
          lines={[
            "Investir em quê?",
            <span key="p" className="text-[var(--s-accent)]">
              Investir pra quê?
            </span>,
          ]}
          className="text-balance text-[clamp(30px,5.6vw,64px)] font-semibold leading-[1] tracking-[-0.045em] text-[var(--s-ink)]"
        />
        <Lead>Uma nova linguagem para investimentos.</Lead>
      </div>
      <Reveal index={1} amount={0.1}>
        <GlassCard className="p-2 sm:p-3">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">Linhas PRX INVEST: objetivo e produtos possíveis</caption>
            <thead className="max-sm:sr-only">
              <tr className="ob-label text-[11px] text-[var(--s-muted)]">
                <th scope="col" className="px-4 pb-3 pt-3 font-medium">
                  Linha
                </th>
                <th scope="col" className="px-4 pb-3 pt-3 font-medium">
                  Objetivo
                </th>
                <th scope="col" className="px-4 pb-3 pt-3 font-medium">
                  Produtos possíveis*
                </th>
              </tr>
            </thead>
            <tbody>
              {INVEST_LINES.map((row) => (
                <tr key={row.line} className="border-t border-[var(--s-line)] max-sm:grid max-sm:gap-1 max-sm:px-4 max-sm:py-4">
                  <th scope="row" className="ob-label whitespace-nowrap text-[13px] text-[var(--s-accent)] sm:px-4 sm:py-4">
                    {row.line}
                  </th>
                  <td className="text-[16px] font-medium text-[var(--s-ink)] sm:px-4 sm:py-4 sm:text-[17px]">{row.goal}</td>
                  <td className="text-[15px] text-[var(--s-body)] sm:px-4 sm:py-4 sm:text-[16px]">{row.products}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassCard>
      </Reveal>
      <Reveal index={2}>
        <p className="max-w-[760px] text-[13px] leading-relaxed text-[var(--s-muted)]">
          *Produtos ofertados por instituições autorizadas, conforme perfil, idade, suitability e regulamentação aplicável.
        </p>
      </Reveal>
      <Statement accent="O investimento vem depois." index={3}>
        O objetivo vem primeiro.
      </Statement>
    </div>
  );
}

/* 10 — PRX FOUNDERS ----------------------------------------------------------- */

function Founders() {
  return (
    <div className="space-y-14">
      <ProductName id="founders" name="FOUNDERS" className="text-[clamp(40px,10vw,120px)]" />
      <div className={cn(GRID, "!mt-2")}>
        <div className="lg:col-span-7">
          <Tagline lines={["Where the next", "generation builds."]} />
        </div>
        <div className="lg:col-span-5">
          <Lead className="mt-0">O ambiente PRX para jovens que não querem apenas encontrar oportunidades.</Lead>
          <Reveal index={2}>
            <p className="mt-3 text-[clamp(26px,3.4vw,40px)] font-semibold tracking-[-0.04em] text-[var(--s-accent)]">Querem criá-las.</p>
          </Reveal>
          <Lead index={3}>Empreendedores, futuros fundadores, investidores e novas lideranças conectados por conteúdo, encontros, pitches e oportunidades.</Lead>
        </div>
      </div>
      <ul aria-label="Como participar do PRX FOUNDERS" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {["Cadastre sua ideia.", "Apresente seu negócio.", "Encontre pessoas.", "Construa conexões."].map((step, i) => (
          <li key={step}>
            <Reveal index={i}>
              <GlassCard className="h-full p-5">
                <span className="flex min-h-[96px] flex-col justify-between">
                  <span aria-hidden className="ob-label text-[12px] tabular-nums text-[var(--s-accent)]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="mt-6 text-[19px] font-semibold tracking-[-0.02em] text-[var(--s-ink)]">{step}</span>
                </span>
              </GlassCard>
            </Reveal>
          </li>
        ))}
      </ul>
      <Signature index={1} className="mt-0">
        Your network starts early.
      </Signature>
    </div>
  );
}

/* 11 — PRX LEVEL ----------------------------------------------------------- */

function Level() {
  return (
    <div>
      <ProductName id="level" name="LEVEL" />
      <div className={cn(GRID, "mt-2")}>
        <div className="lg:col-span-7">
          <Tagline lines={["Da ideia para", "o próximo nível."]} />
          <Lead>A frente de desenvolvimento de jovens empreendedores da PRX.</Lead>
          <Chips
            label="O que o PRX LEVEL oferece"
            items={["Mentorias", "Preparação de pitch", "Análise de modelo de negócio", "Posicionamento", "Conexões", "Acesso ao ecossistema"]}
          />
          <Reveal index={3}>
            <p className="mt-8 max-w-[600px] text-[17px] leading-relaxed text-[var(--s-body)] sm:text-[19px]">
              O jovem apresenta sua startup. <strong className="font-semibold text-[var(--s-ink)]">A PRX ajuda a transformar potencial em execução.</strong>
            </p>
          </Reveal>
        </div>
        <div className="lg:col-span-5">
          <Masked
            lines={["Build.", "Pitch.", "Grow."]}
            className="ob-display text-[clamp(48px,8vw,104px)] leading-[1.02] tracking-[0.06em] text-white [&>span:last-child]:text-[var(--s-accent)]"
          />
        </div>
      </div>
    </div>
  );
}

function LevelMedia() {
  return (
    <>
      <Haze at="80% 50%" />
      <div aria-hidden className="absolute inset-y-0 right-[-20%] -z-10 w-[90%] opacity-40 mix-blend-screen lg:right-[-8%] lg:w-[50%]">
        <Image
          src={OBSIDIAN_IMAGES.crystal}
          alt=""
          fill
          sizes="50vw"
          placeholder="blur"
          className="object-cover [mask-image:radial-gradient(closest-side,#000_30%,transparent_100%)]"
        />
      </div>
    </>
  );
}

/* 12 — PRX LIVE -------------------------------------------------------------- */

function Live() {
  return (
    <div className="max-w-[760px]">
      <ProductName id="live" name="LIVE" />
      <Tagline lines={["O digital conecta.", "O presencial transforma."]} />
      <Lead>PRX LIVE é a plataforma de experiências presenciais da PRX.</Lead>
      <Lead index={2}>Eventos criados para tirar uma geração das telas e colocá-la diante de pessoas, ideias, esporte, música, negócios e novas experiências.</Lead>
      <Statement className="mt-10" accent="Queremos criar lugares onde o próximo capítulo começa." index={3}>
        Não queremos produzir apenas eventos.
      </Statement>
    </div>
  );
}

/* 13 — PRX UP ---------------------------------------------------------------- */

function Up() {
  return (
    <div className="max-w-[820px]">
      <ProductName id="up" name="UP" />
      <Tagline lines={["A new kind", "of morning."]} />
      <Lead>Coffee Party premium da PRX.</Lead>
      <Chips label="O que tem no PRX UP" items={["Sol.", "Brunch.", "Special coffee.", "Functional drinks.", "Sport.", "Music.", "Creators."]} />
      <Lead index={3} className="mt-8">
        Uma experiência diurna, saudável e social para uma geração que está redefinindo o significado de sair.
      </Lead>
      <Signature index={4}>Less hangover. More life.</Signature>
    </div>
  );
}

/* 14 — PRX RUN --------------------------------------------------------------- */

function Run() {
  return (
    <div className="space-y-12">
      <div className={GRID}>
        <div className="lg:col-span-7">
          <ProductName id="run" name="RUN" />
          <Tagline lines={["A primeira corrida", "pra dentro de si."]} />
        </div>
        <div className="lg:col-span-5">
          <Lead className="mt-0">Uma experiência esportiva criada para a nova geração.</Lead>
          <Lead index={2}>Corrida, música, comunidade, desafios e ativações de marcas conectadas a bem-estar e performance.</Lead>
        </div>
      </div>
      <RunLanes className="h-[140px] sm:h-[190px]" />
      <Statement accent="escolher quem você quer ser quando chegar lá." index={1}>
        Mais do que cruzar uma linha de chegada:
      </Statement>
    </div>
  );
}

/* 15 — PRX SESSION ----------------------------------------------------------- */

function Session() {
  return (
    <div className="mx-auto max-w-[900px] text-center">
      <ProductName id="session" name="SESSION" className="text-[clamp(40px,10vw,120px)]" />
      <Tagline lines={["Members only."]} className="text-[clamp(32px,6.4vw,72px)]" />
      <Lead className="mx-auto">Experiências sociais exclusivas desbloqueadas pelo ecossistema PRX.</Lead>
      <Chips className="justify-center" label="O que tem na PRX SESSION" items={["Música.", "Cultura.", "Creators.", "Conexões.", "Lifestyle."]} />
      <Lead index={3} className="mx-auto">
        Acesso por critérios definidos para cada experiência, benefícios e ativações dentro do app.
      </Lead>
      <Reveal index={4}>
        <p className="mt-12 text-[clamp(26px,4.4vw,52px)] font-semibold leading-[1.05] tracking-[-0.045em] text-white">
          Not everyone gets in.
          <br />
          <span className="text-[var(--s-accent)]">That’s the point.</span>
        </p>
      </Reveal>
    </div>
  );
}

function SessionMedia() {
  return (
    <>
      <Haze at="50% 50%" />
      {/* Moldura dentro da moldura: a porta da sessão. */}
      <div aria-hidden className="pointer-events-none absolute inset-3 -z-10 rounded-[32px] border border-white/[0.07] sm:inset-5 lg:inset-8" />
    </>
  );
}

/* 16 — PRX ME -------------------------------------------------------------------- */

function Me() {
  return (
    <div className={GRID}>
      <div className="lg:col-span-7">
        <ProductName id="me" name="ME" />
        <Tagline lines={["Mental health is", "part of the plan."]} />
        <Lead>Saúde mental acessível, privada e integrada à vida digital da nova geração.</Lead>
        <Lead index={2}>
          No app, o usuário encontra profissionais parceiros e pode adquirir sessões online de psicologia com condições promocionais, observadas as regras profissionais e
          regulatórias aplicáveis.
        </Lead>
      </div>
      <div className="lg:col-span-5">
        <Reveal index={1}>
          <GlassCard>
            <Steps label="Como funciona o PRX ME" size="lg" items={["Escolha o profissional.", "Agende.", "Faça sua sessão online."]} />
          </GlassCard>
        </Reveal>
      </div>
      <div className="lg:col-span-12">
        <Statement index={2}>Porque construir o futuro também exige aprender a cuidar de quem vai vivê-lo.</Statement>
        <Signature>Your mind matters.</Signature>
      </div>
    </div>
  );
}

/* 17 — PRX CIRCLE ------------------------------------------------------------- */

function Circle() {
  return (
    <div className="space-y-14">
      <ProductName id="circle" name="CIRCLE" />
      <div className={cn(GRID, "!mt-2")}>
        <div className="lg:col-span-7">
          <Tagline lines={["Social, without", "the swipe."]} />
          <Lead>Uma nova proposta de conexão dentro da PRX.</Lead>
          <Reveal index={2}>
            <ul aria-label="Menos e mais" className="mt-8 space-y-2 text-[18px] tracking-[-0.01em] sm:text-[21px]">
              <li className="text-[var(--s-muted)]">Menos julgamento instantâneo.</li>
              <li className="text-[var(--s-muted)]">Menos aparência primeiro.</li>
              <li className="font-semibold text-[var(--s-accent)]">Mais contexto, interesses, ideias e afinidades.</li>
            </ul>
          </Reveal>
        </div>
        <div className="mx-auto w-full max-w-[340px] lg:col-span-5">
          <CircleRings />
        </div>
      </div>
      <Steps label="Os princípios do PRX CIRCLE" size="lg" items={["Texto antes da foto.", "Conversa antes do match.", "Conexão antes da performance."]} />
      <Statement accent="Queremos criar círculos." index={1}>
        Não queremos criar mais uma rede para colecionar seguidores.
      </Statement>
    </div>
  );
}

/* 18 — O ecossistema --------------------------------------------------------- */

const ECOSYSTEM: ReadonlyArray<{
  name: string;
  moment: string;
  href: `#${string}`;
}> = [
  { name: "PRX PASS", moment: "benefícios", href: "#pass" },
  { name: "PRX CAR", moment: "primeiro carro", href: "#car" },
  { name: "PRX HOME", moment: "primeiro apê", href: "#home" },
  { name: "PRX BANK", moment: "vida financeira", href: "#bank" },
  { name: "PRX INVEST", moment: "patrimônio", href: "#invest" },
  { name: "PRX FOUNDERS", moment: "empreendedorismo", href: "#founders" },
  { name: "PRX LEVEL", moment: "desenvolvimento", href: "#level" },
  { name: "PRX LIVE", moment: "experiências", href: "#live" },
  { name: "PRX ME", moment: "saúde mental", href: "#me" },
  { name: "PRX CIRCLE", moment: "conexões", href: "#circle" },
];

function Ecosystem() {
  return (
    <div className="space-y-12">
      <Masked
        as="h2"
        id="ecossistema-title"
        lines={[
          "One app.",
          <span key="d" className="text-[var(--s-accent)]">
            Different moments of life.
          </span>,
        ]}
        className="text-balance text-[clamp(30px,5.6vw,64px)] font-semibold leading-[1] tracking-[-0.045em] text-white"
      />
      <ul aria-label="O ecossistema PRX" className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:grid-cols-5">
        {ECOSYSTEM.map((item, i) => (
          <li key={item.name}>
            <Reveal index={i % 5}>
              <a
                href={item.href}
                className="group flex min-h-[112px] cursor-pointer flex-col justify-between rounded-[20px] border border-x-white/10 border-t-white/25 border-b-white/5 bg-white/[0.05] p-3.5 transition-[background-color,transform] min-[400px]:p-4 duration-300 hover:-translate-y-0.5 hover:bg-white/[0.09] sm:p-5"
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="ob-label text-[11px] text-white sm:text-[13px]">{item.name}</span>
                  <span aria-hidden className="text-[var(--s-accent)] transition-transform duration-300 group-hover:translate-x-0.5">
                    →
                  </span>
                </span>
                <span className="mt-4 break-words text-[13px] text-[var(--s-body)] min-[400px]:text-[14px] sm:text-[15px]">{item.moment}</span>
              </a>
            </Reveal>
          </li>
        ))}
      </ul>
      <Statement accent="quanto melhores as escolhas, maiores podem ser as oportunidades." index={1}>
        Tudo conectado por uma mesma ideia:
      </Statement>
    </div>
  );
}

/* 19 — PRX (logo) -------------------------------------------------------------- */

const PLACES = ["Economizar.", "Investir.", "Empreender.", "Cuidar da mente.", "Encontrar pessoas.", "Viver experiências.", "Conquistar independência."];

function Finale({ appUrl }: { appUrl: string }) {
  return (
    <div className="space-y-14 text-center">
      <Reveal>
        <h2 id="next-title" className="sr-only">
          PRX, the next pays
        </h2>
        <PrxLogo variant="full" title="PRX — the next pays" className="mx-auto h-16 w-auto text-white sm:h-24 lg:h-28" />
      </Reveal>
      <Statement className="mx-auto" accent="Precisa de um ecossistema que entenda como ela vive hoje e quem ela quer ser amanhã." index={1}>
        A próxima geração não precisa de mais um app.
      </Statement>
      <div>
        <Reveal index={2}>
          <p className="ob-label text-[12px] text-[var(--s-muted)]">Um lugar para</p>
        </Reveal>
        <Masked
          lines={PLACES}
          className="ob-display mx-auto mt-4 text-[clamp(20px,2.6vw,32px)] leading-[1.2] tracking-[0.06em] text-white [&>span:last-child]:text-[var(--s-accent)]"
        />
      </div>
      <Reveal index={3} className="flex flex-col items-center gap-6">
        <p className="ob-display text-[clamp(30px,5vw,56px)] tracking-[0.08em] text-white">
          PRX <span className="text-[var(--s-accent)]">the next pays</span>
        </p>
        <a
          href={appUrl}
          className={cn(
            "group/lux relative inline-flex min-h-12 cursor-pointer items-center justify-center overflow-hidden whitespace-nowrap rounded-full bg-[#7c3aed] px-7 text-[15px] font-semibold text-white",
            "shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_10px_28px_-10px_rgba(124,58,237,0.8)] transition-[background-color,transform] duration-200 hover:bg-[#6d28d9] active:scale-[0.98]",
          )}
        >
          Entrar na PRX
        </a>
      </Reveal>
    </div>
  );
}

function FinaleMedia() {
  return (
    <>
      <Haze at="50% 60%" />
      <div aria-hidden className="absolute left-1/2 top-1/2 -z-10 aspect-[9/16] h-[120%] -translate-x-1/2 -translate-y-1/2 opacity-35 mix-blend-screen">
        <Image
          src={OBSIDIAN_IMAGES.crystal}
          alt=""
          fill
          sizes="70vh"
          placeholder="blur"
          className="object-cover [mask-image:radial-gradient(closest-side,#000_30%,transparent_100%)]"
        />
      </div>
    </>
  );
}

/* Roteiro ------------------------------------------------------------------------ */

export function buildSlides(appUrl: string): ReadonlyArray<SlideDef> {
  return [
    {
      id: "capa",
      label: "Capa",
      tone: "night",
      media: <CoverMedia />,
      content: <Cover />,
    },
    {
      id: "prx",
      label: "O que é a PRX",
      tone: "night",
      media: <Haze at="85% 30%" />,
      content: <WhatIs />,
    },
    {
      id: "pass",
      label: "PRX PASS",
      tone: "night",
      media: <Haze at="78% 50%" />,
      content: <Pass />,
    },
    {
      id: "car",
      label: "PRX CAR",
      tone: "day",
      media: <Haze at="85% 20%" />,
      content: <Car />,
    },
    {
      id: "home",
      label: "PRX HOME",
      tone: "night",
      media: <Haze at="75% 50%" />,
      content: <Home />,
    },
    {
      id: "bank",
      label: "PRX BANK",
      tone: "night",
      media: <Haze at="78% 60%" />,
      content: <Bank />,
    },
    {
      id: "no-bet",
      label: "NO BET",
      tone: "night",
      media: <Haze at="20% 20%" />,
      content: <NoBet />,
    },
    {
      id: "invest",
      label: "PRX INVEST",
      tone: "night",
      media: <BackdropPhoto src={OBSIDIAN_IMAGES.investCopper} focus="object-[50%_40%]" shade="left" />,
      content: <Invest />,
    },
    {
      id: "investimentos",
      label: "Investir pra quê?",
      tone: "day",
      media: <Haze at="10% 10%" />,
      content: <InvestLines />,
    },
    {
      id: "founders",
      label: "PRX FOUNDERS",
      tone: "night",
      media: <Haze at="85% 70%" />,
      content: <Founders />,
    },
    {
      id: "level",
      label: "PRX LEVEL",
      tone: "night",
      media: <LevelMedia />,
      content: <Level />,
    },
    {
      id: "live",
      label: "PRX LIVE",
      tone: "night",
      media: <BackdropPhoto src={OBSIDIAN_IMAGES.liveConcert} focus="object-[50%_40%]" shade="left" />,
      content: <Live />,
    },
    {
      id: "up",
      label: "PRX UP",
      tone: "day",
      media: <MorningSun />,
      content: <Up />,
    },
    {
      id: "run",
      label: "PRX RUN",
      tone: "night",
      media: <Haze at="50% 80%" />,
      content: <Run />,
    },
    {
      id: "session",
      label: "PRX SESSION",
      tone: "night",
      media: <SessionMedia />,
      content: <Session />,
    },
    {
      id: "me",
      label: "PRX ME",
      tone: "night",
      media: <BackdropPhoto src={OBSIDIAN_IMAGES.meHorizon} focus="object-[60%_55%]" shade="left" />,
      content: <Me />,
    },
    {
      id: "circle",
      label: "PRX CIRCLE",
      tone: "day",
      media: <Haze at="80% 40%" />,
      content: <Circle />,
    },
    {
      id: "ecossistema",
      label: "O ecossistema",
      tone: "night",
      media: <Haze at="50% 30%" />,
      content: <Ecosystem />,
    },
    {
      id: "next",
      label: "PRX",
      tone: "night",
      media: <FinaleMedia />,
      content: <Finale appUrl={appUrl} />,
    },
  ];
}
