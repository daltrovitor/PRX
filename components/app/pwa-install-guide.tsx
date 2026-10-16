// Hello World
"use client";

import { motion, useReducedMotion } from "motion/react";
import { Button, Notice, Sheet } from "@/components/app/ui";
import type { InstallBrowser, InstallPlatform } from "@/lib/pwa-install";

/**
 * Passo a passo para colocar o app da PRX na tela inicial quando o navegador não tem
 * o botão de instalação de um toque (iPhone, Firefox, prompt já usado…).
 * Cada aparelho/navegador vê só os passos dele. Animação leve, desligada para
 * quem prefere menos movimento.
 */

interface Step {
  title: string;
  detail: string;
  glyph: "share" | "plus" | "menu" | "install" | "check" | "dock";
}

export interface InstallGuide {
  intro: string;
  steps: Step[];
  note?: string;
}

export function installGuideFor(platform: InstallPlatform, browser: InstallBrowser): InstallGuide {
  if (platform === "ios") {
    const share = browser === "safari" ? "na barra de baixo do Safari" : "na barra de endereço (no topo ou no canto)";
    return {
      intro: "No iPhone e no iPad a instalação é feita pelo menu Compartilhar.",
      steps: [
        { title: "Toque em Compartilhar", detail: `O ícone de quadrado com a seta para cima, ${share}.`, glyph: "share" },
        { title: "Adicionar à Tela de Início", detail: "Role a lista de opções até encontrar este item.", glyph: "plus" },
        { title: "Toque em Adicionar", detail: "O ícone da PRX aparece na tela inicial e abre como app.", glyph: "check" },
      ],
      note: browser === "safari" ? undefined : "Não achou a opção? Ela exige iOS 16.4 ou mais novo. Abra este endereço no Safari e siga os mesmos passos.",
    };
  }
  if (platform === "android") {
    if (browser === "firefox") {
      return {
        intro: "No Firefox para Android, a instalação fica no menu.",
        steps: [
          { title: "Abra o menu ⋮", detail: "Os três pontos ao lado da barra de endereço.", glyph: "menu" },
          { title: "Instalar ou Adicionar à tela inicial", detail: "O nome muda conforme a versão do Firefox.", glyph: "plus" },
          { title: "Confirme", detail: "A PRX aparece junto com os seus apps.", glyph: "check" },
        ],
      };
    }
    return {
      intro: "No Android, o navegador instala o app da PRX.",
      steps: [
        { title: "Abra o menu ⋮", detail: "Os três pontos no canto da tela do navegador.", glyph: "menu" },
        { title: "Instalar app", detail: "Pode aparecer como “Adicionar à tela inicial”.", glyph: "install" },
        { title: "Confirme em Instalar", detail: "A PRX vai para a gaveta de apps e a tela inicial.", glyph: "check" },
      ],
    };
  }
  if (platform === "macos" && browser === "safari") {
    return {
      intro: "No Mac, o Safari 17 ou mais novo coloca o app da PRX no Dock.",
      steps: [
        { title: "Menu Arquivo", detail: "Na barra de menus do Safari.", glyph: "menu" },
        { title: "Adicionar ao Dock", detail: "Confirme o nome PRX.", glyph: "dock" },
        { title: "Pronto", detail: "A PRX abre em uma janela própria.", glyph: "check" },
      ],
    };
  }
  if (browser === "firefox" || browser === "safari") {
    return {
      intro: "Este navegador do computador não instala apps da web.",
      steps: [{ title: "Use Chrome ou Edge", detail: "Abra este endereço no Chrome ou no Edge e use o botão de instalar da barra de endereço.", glyph: "install" }],
    };
  }
  return {
    intro: "No Chrome e no Edge do computador, a instalação fica na barra de endereço.",
    steps: [
      { title: "Ícone de instalar", detail: "Na ponta direita da barra de endereço (um monitor com seta) ou no menu ⋮ → Instalar PRX.", glyph: "install" },
      { title: "Confirme em Instalar", detail: "A PRX abre em uma janela própria, como app.", glyph: "check" },
    ],
  };
}

function Glyph({ kind }: { kind: Step["glyph"] }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden>
      {kind === "share" && (
        <g {...common}>
          <path d="M12 3v12" />
          <path d="M8 7l4-4 4 4" />
          <path d="M6 11v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8" />
        </g>
      )}
      {kind === "plus" && (
        <g {...common}>
          <rect x="4" y="4" width="16" height="16" rx="3" />
          <path d="M12 8v8M8 12h8" />
        </g>
      )}
      {kind === "menu" && (
        <g fill="currentColor">
          <circle cx="12" cy="5" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="12" cy="19" r="1.8" />
        </g>
      )}
      {kind === "install" && (
        <g {...common}>
          <rect x="3" y="4" width="18" height="13" rx="2" />
          <path d="M12 8v6M9 11l3 3 3-3M8 21h8" />
        </g>
      )}
      {kind === "dock" && (
        <g {...common}>
          <rect x="3" y="15" width="18" height="5" rx="2" />
          <path d="M12 4v8M9 9l3 3 3-3" />
        </g>
      )}
      {kind === "check" && (
        <g {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M8 12.5l2.5 2.5L16 9.5" />
        </g>
      )}
    </svg>
  );
}

export function PwaInstallGuide({ open, onClose, platform, browser }: { open: boolean; onClose: () => void; platform: InstallPlatform; browser: InstallBrowser }) {
  const reduce = useReducedMotion();
  const guide = installGuideFor(platform, browser);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Instalar o app da PRX"
      description={guide.intro}
      footer={
        <Button block variant="secondary" onClick={onClose}>
          Entendi
        </Button>
      }
    >
      <ol className="space-y-3">
        {guide.steps.map((step, index) => (
          <motion.li
            key={step.title}
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 28, delay: 0.08 * index }}
            className="flex items-start gap-4 rounded-3xl bg-surface p-4"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-card text-ink ring-1 ring-line">
              <Glyph kind={step.glyph} />
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold text-ink">
                {index + 1}. {step.title}
              </span>
              <span className="mt-0.5 block text-[14px] leading-relaxed text-muted-foreground">{step.detail}</span>
            </span>
          </motion.li>
        ))}
      </ol>
      {guide.note && (
        <Notice className="mt-4" tone="neutral">
          {guide.note}
        </Notice>
      )}
    </Sheet>
  );
}
