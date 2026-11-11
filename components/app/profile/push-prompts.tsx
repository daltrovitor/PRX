"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useBootVisible } from "@/components/brand/boot-boundary";
import { useConfirmToast } from "@/components/ui/confirm-toast";
import { IconBell, IconClose } from "@/components/icons/prx-icons";
import { usePwaInstall } from "@/lib/pwa-install";
import { usePush } from "@/components/app/profile/use-push";
import { hasSeenPushPrompt, markPushPromptSeen } from "@/lib/push-prompt-policy";

/** One invitation per device, after the app is visible. Settings remain in Profile. */
export function PushPrompt() {
  const { showToast } = useConfirmToast();
  const { state, busy, error, enable } = usePush();
  const visible = useBootVisible();
  const install = usePwaInstall();
  const [ready, setReady] = useState(false);
  const [closed, setClosed] = useState(false);
  const installShowing = install.visible && (install.canPrompt || install.platform === "ios" || install.platform === "android");

  useEffect(() => {
    if (!visible || installShowing || state.kind !== "off" || hasSeenPushPrompt()) return;
    const timer = window.setTimeout(() => setReady(true), 4000);
    return () => window.clearTimeout(timer);
  }, [visible, installShowing, state.kind]);
  const show = visible && ready && !closed && !installShowing && state.kind === "off";
  useEffect(() => { if (show) markPushPromptSeen(); }, [show]);
  const close = () => { markPushPromptSeen(); setClosed(true); };

  return (
    <AnimatePresence>
      {show && (
        <motion.section role="dialog" aria-modal="false" aria-labelledby="push-prompt-title" aria-describedby="push-prompt-sub"
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.2 }}
          className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+6rem)] z-[60] rounded-2xl border border-line bg-card p-5 shadow-lg sm:inset-x-auto sm:bottom-8 sm:right-6 sm:w-[430px]">
          <button type="button" disabled={busy} onClick={close} aria-label="Dispensar notificações" className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-foreground"><IconClose size={18} /></button>
          <div className="flex items-center gap-4 pr-5">
            <span aria-hidden className="shrink-0 text-primary"><IconBell size={28} /></span>
            <div className="border-l border-line pl-4">
              <h2 id="push-prompt-title" className="text-[12px] font-medium uppercase tracking-[0.16em] text-foreground">Notificações PRX</h2>
              <p id="push-prompt-sub" className="mt-2 text-[13px] leading-relaxed text-muted-foreground">Fique por dentro de convites exclusivos, movimentações da sua conta e liberações de acesso.</p>
            </div>
          </div>
          {error && <p role="alert" className="mt-3 text-xs text-muted-foreground">{error}</p>}
          <div className="mt-5 grid grid-cols-[1.5fr_1fr] gap-3">
            <button type="button" disabled={busy} onClick={() => void enable().then((ok) => { if (ok) { close(); showToast("success", "Notificações ativadas neste aparelho."); } })} className="min-h-11 rounded-full bg-primary px-3 py-3 text-[10px] font-medium uppercase tracking-[0.08em] text-primary-foreground disabled:opacity-50">{busy ? "Ativando…" : "Ativar notificações"}</button>
            <button type="button" disabled={busy} onClick={close} className="min-h-11 rounded-full border border-line px-3 py-3 text-[10px] font-medium uppercase tracking-[0.08em] text-foreground">Agora não</button>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
