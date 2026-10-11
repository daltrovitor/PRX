// Hello World
"use client";

import { useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/app/ui";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import {
  dismissInstallCard,
  promptInstall,
  usePwaInstall,
} from "@/lib/pwa-install";
import { PwaInstallGuide } from "@/components/app/pwa-install-guide";

/*
 * "Instale o app" logo na entrada, no estilo do PRX: ícone, nome, endereço e os
 * botões Instalar e Cancelar, como o convite nativo do navegador. Instalar abre
 * direto a instalação do sistema (Android e computador), sem passo a passo. O
 * iPhone não permite instalar por botão (regra da Apple): lá o Instalar mostra
 * a única linha necessária.
 */

const noopSubscribe = () => () => undefined;
const host = () => window.location.host;

export function PwaInstallPrompt() {
  const { visible, canPrompt, platform, browser } = usePwaInstall();
  const domain = useSyncExternalStore(noopSubscribe, host, () => "");
  const { showToast } = useConfirmToast();
  const [busy, setBusy] = useState(false);
  const [guide, setGuide] = useState(false);
  // Celular sem o botão nativo (iPhone, Firefox, prompt já usado): o Instalar abre o passo a passo.
  const manual = !canPrompt && (platform === "ios" || platform === "android");
  const show = visible && (canPrompt || manual) && !guide;

  async function install() {
    if (!canPrompt) return setGuide(true);
    setBusy(true);
    const outcome = await promptInstall();
    setBusy(false);
    if (outcome === "accepted")
      showToast("success", "PRX instalado. Abra pela tela inicial.");
    if (outcome === "unavailable") setGuide(true);
  }

  return (
    <>
      <PwaInstallGuide
        open={guide}
        onClose={() => {
          setGuide(false);
          dismissInstallCard("dismissed");
        }}
        platform={platform}
        browser={browser}
      />
      <AnimatePresence>
        {show && (
          <motion.section
            role="dialog"
            aria-modal="false"
            aria-labelledby="pwa-install-title"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className="glass-bar fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-[60] rounded-[24px] p-5 sm:inset-x-auto sm:bottom-auto sm:right-6 sm:top-24 sm:w-[400px] lg:bottom-auto"
          >
            <h2
              id="pwa-install-title"
              className="text-[17px] font-semibold tracking-[-0.01em] text-ink"
            >
              Instale o app
            </h2>
            <div className="mt-4 flex min-w-0 items-center gap-3.5">
              {/* Ícone oficial do app, o mesmo da tela inicial. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/prx-icon-192.png"
                alt=""
                width={48}
                height={48}
                className="h-12 w-12 shrink-0 rounded-[14px] shadow-[0_4px_12px_-6px_rgba(22,12,52,0.35)]"
              />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-medium text-ink">
                  PRX — the next pays
                </p>
                <p className="truncate text-[13px] text-muted-foreground">
                  {domain}
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => dismissInstallCard("dismissed")}
              >
                Agora não
              </Button>
              <Button size="sm" onClick={() => void install()} disabled={busy}>
                {busy ? "Abrindo…" : canPrompt ? "Instalar" : "Como instalar"}
              </Button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
}
