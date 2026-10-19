// Hello World
"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/app/ui";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { IconBell, IconClose } from "@/components/icons/prx-icons";
import { usePwaInstall } from "@/lib/pwa-install";
import { dismissedRecently, rememberDismiss, usePush } from "@/components/app/profile/use-push";

const BANNER_KEY = "prx_push_banner_dismissed_at";
const POPUP_KEY = "prx_push_popup_dismissed_at";
const POPUP_DELAY_MS = 4_000;

/** Banner da Home: aparece enquanto este aparelho não ativou as notificações. */
export function PushBanner() {
  const { showToast } = useConfirmToast();
  const { state, busy, error, enable } = usePush();
  const [hidden, setHidden] = useState(() => typeof window !== "undefined" && dismissedRecently(BANNER_KEY, 7));

  if (hidden || state.kind !== "off") return null;
  return (
    <section aria-labelledby="push-banner-title" className="flex flex-wrap items-center gap-3 rounded-3xl glass p-4 pr-3 sm:flex-nowrap sm:p-5">
      <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-white">
        <IconBell size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id="push-banner-title" className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
          Ative as notificações
        </h2>
        <p className="text-[13px] text-muted-foreground">{error ?? "Convites da Resenha, Pix e liberações direto no seu celular."}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button size="sm" onClick={() => void enable().then((ok) => ok && showToast("success", "Notificações ativadas neste celular."))} disabled={busy}>
          {busy ? "Ativando…" : "Ativar"}
        </Button>
        <button
          type="button"
          aria-label="Dispensar aviso de notificações"
          onClick={() => {
            rememberDismiss(BANNER_KEY);
            setHidden(true);
          }}
          className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface hover:text-ink"
        >
          <IconClose size={18} />
        </button>
      </div>
    </section>
  );
}

/**
 * Pop-up que convida a ativar as notificações alguns segundos depois de abrir
 * o app. Não aparece junto com o convite de instalação nem para quem dispensou
 * nos últimos 3 dias. O "Ativar" é o toque que o navegador exige para pedir a permissão.
 */
export function PushPrompt() {
  const { showToast } = useConfirmToast();
  const { state, busy, enable } = usePush();
  const install = usePwaInstall();
  const [ready, setReady] = useState(false);
  const [closed, setClosed] = useState(false);
  const installShowing = install.visible && (install.canPrompt || install.platform === "ios" || install.platform === "android");

  useEffect(() => {
    if (dismissedRecently(POPUP_KEY, 3)) return;
    const timer = window.setTimeout(() => setReady(true), POPUP_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const show = ready && !closed && !installShowing && state.kind === "off";
  const close = () => {
    rememberDismiss(POPUP_KEY);
    setClosed(true);
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.section
          role="dialog"
          aria-modal="false"
          aria-labelledby="push-prompt-title"
          aria-describedby="push-prompt-sub"
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
          className="glass-strong fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-[60] rounded-[24px] p-4 sm:inset-x-auto sm:bottom-auto sm:right-6 sm:top-24 sm:w-[420px] sm:p-5"
        >
          <div className="flex items-start gap-3.5 pr-9">
            <span aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[16px] bg-primary text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_8px_20px_-10px_rgba(108,12,240,0.65)]">
              <IconBell size={26} />
            </span>
            <div className="min-w-0 pt-0.5">
              <h2 id="push-prompt-title" className="text-[16px] font-semibold leading-snug tracking-[-0.01em] text-ink">
                Não perca nenhum convite
              </h2>
              <p id="push-prompt-sub" className="mt-1 text-[13.5px] leading-snug text-muted-foreground">
                Ative as notificações e saiba na hora quando um Insider te chamar para a Resenha, quando cair um Pix ou quando sua entrada for liberada.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Fechar"
            className="absolute right-2 top-2 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface hover:text-ink"
          >
            <IconClose size={18} />
          </button>
          <div className="mt-4 flex gap-2">
            <Button
              block
              onClick={() =>
                void enable().then((ok) => {
                  setClosed(true);
                  if (ok) showToast("success", "Notificações ativadas neste celular.");
                })
              }
              disabled={busy}
            >
              {busy ? "Ativando…" : "Ativar notificações"}
            </Button>
            <Button variant="secondary" className="shrink-0 whitespace-nowrap" onClick={close}>
              Agora não
            </Button>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
