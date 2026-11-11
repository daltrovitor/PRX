// Hello World
"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { EllipsisVertical, Menu, Share } from "lucide-react";
import { Button } from "@/components/app/ui";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { IconClose, IconGift } from "@/components/icons/prx-icons";
import { dismissInstallCard, promptInstall, usePwaInstall, type InstallBrowser, type InstallPlatform } from "@/lib/pwa-install";

/*
 * Convite para colocar o app da PRX na tela de início, no design da PRX (vidro e
 * violeta da marca): presente, título, subtítulo e os dois passos do aparelho.
 * Onde o navegador instala com um toque (Android/computador), um botão faz
 * tudo; no iPhone a Apple não deixa instalar por botão, então os passos
 * explicam o caminho.
 */

const shareGlyph = <Share aria-hidden className="mx-1 inline h-[18px] w-[18px] -translate-y-px" strokeWidth={1.8} />;

function manualSteps(platform: InstallPlatform, browser: InstallBrowser): [ReactNode, ReactNode] {
  if (platform === "ios") {
    // No iPhone o Safari deixa o Compartilhar na barra de baixo; os outros navegadores e o iPad, no topo.
    const below = browser === "safari" && /iPhone|iPod/.test(navigator.userAgent);
    return [<>Toque em {shareGlyph} Compartilhar aí {below ? "embaixo" : "em cima"}</>, <>“Adicionar à Tela de Início”</>];
  }
  if (platform !== "android") {
    return [<>Abra este endereço no Chrome ou Edge</>, <>No menu ⋮, escolha “Instalar PRX” ou “Instalar esta página como app”</>];
  }
  if (browser === "samsung") {
    return [<>Toque em <Menu aria-hidden className="mx-1 inline h-[18px] w-[18px] -translate-y-px" strokeWidth={1.8} /> Menu aí embaixo</>, <>“Adicionar página a” › “Tela inicial”</>];
  }
  return [<>Toque em <EllipsisVertical aria-hidden className="mx-1 inline h-[18px] w-[18px] -translate-y-px" strokeWidth={1.8} /> Menu aí em cima</>, <>“Adicionar à tela inicial”</>];
}

export function PwaInstallPrompt() {
  const { visible, canPrompt, platform, browser } = usePwaInstall();
  const { showToast } = useConfirmToast();
  const [busy, setBusy] = useState(false);
  // Celular sem o botão nativo (iPhone, Firefox, prompt já usado): só os passos.
  const manual = !canPrompt && platform !== "other";
  const show = visible && (canPrompt || manual);
  const mobile = platform === "ios" || platform === "android";

  async function install() {
    setBusy(true);
    const outcome = await promptInstall();
    setBusy(false);
    if (outcome === "accepted") showToast("success", "PRX adicionado. Abra pela tela de início.");
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.section
          role="dialog"
          aria-modal="false"
          aria-labelledby="pwa-install-title"
          aria-describedby="pwa-install-sub"
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
          className="glass-strong fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-[60] rounded-[24px] p-4 sm:inset-x-auto sm:bottom-auto sm:right-6 sm:top-24 sm:w-[420px] sm:p-5"
        >
          <div className="flex items-start gap-3.5 pr-9">
            <span aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[16px] bg-primary text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_8px_20px_-10px_rgba(108,12,240,0.65)]">
              <IconGift size={26} />
            </span>
            <div className="min-w-0 pt-0.5">
              <h2 id="pwa-install-title" className="text-[16px] font-semibold leading-snug tracking-[-0.01em] text-ink">
                Adicione à tela de início e saia ganhando
              </h2>
              <p id="pwa-install-sub" className="mt-1 text-[13.5px] leading-snug text-muted-foreground">
                Presentes e ofertas exclusivas dos parceiros PRX
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => dismissInstallCard("dismissed")}
            aria-label="Fechar"
            className="absolute right-2 top-2 inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface hover:text-ink"
          >
            <IconClose size={16} />
          </button>

          {manual ? (
            <ol className="mt-4 space-y-2.5">
              {manualSteps(platform, browser).map((step, i) => (
                <li key={i} className="flex items-center gap-3 text-[15px] text-ink/85">
                  <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/[0.12] text-[13px] font-semibold text-primary">
                    {i + 1}
                  </span>
                  <span className="min-w-0">{step}</span>
                </li>
              ))}
            </ol>
          ) : (
            <Button block className="mt-4" onClick={() => void install()} disabled={busy}>
              {busy ? "Abrindo…" : mobile ? "Adicionar à tela de início" : "Instalar o app"}
            </Button>
          )}
        </motion.section>
      )}
    </AnimatePresence>
  );
}
