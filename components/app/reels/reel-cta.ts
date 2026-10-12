// Hello World
import type { AppTab } from "@/components/app/app-nav";
import type { ReelCtaKind } from "@/lib/reels/types";

/**
 * Botão de um Destaque (vídeo do feed ou banner da Home): leva ao benefício do
 * PASS, à loja do parceiro (https, em outra aba) ou ao catálogo.
 */
export function runReelCta(reel: { ctaKind: ReelCtaKind; ctaTarget: string }, go: (tab: AppTab, sub?: string | null) => void): void {
  if (reel.ctaKind === "benefit" && reel.ctaTarget) go("pass", `beneficio:${reel.ctaTarget}`);
  else if (reel.ctaKind === "external" && /^https:\/\//i.test(reel.ctaTarget)) window.open(reel.ctaTarget, "_blank", "noopener,noreferrer");
  else go("pass");
}

/** Conta a visualização ou o clique de um Destaque (o servidor conta 1 visualização por membro a cada 30 min). */
export function trackReel(action: "view" | "cta", reelId: string): void {
  void fetch("/api/reels", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, reelId }), keepalive: true }).catch(() => undefined);
}
