// Hello World
"use client";

import { useEffect, useId, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { PrxRevealMark, addPrxRevealTweens, showPrxRevealFinal } from "@/components/brand/prx-logo-reveal";

gsap.registerPlugin(useGSAP);

const SESSION_KEY = "prx_intro_seen";

/**
 * Abertura completa na primeira visita da sessão, versão curta nas seguintes.
 * Decidido uma única vez por carregamento de página: em desenvolvimento o
 * StrictMode executa os efeitos duas vezes e não pode transformar a primeira
 * visita em "já vista".
 */
let introMode: "full" | "quick" | null = null;

function resolveIntroMode(): "full" | "quick" {
  if (introMode) return introMode;
  try {
    introMode = sessionStorage.getItem(SESSION_KEY) === "true" ? "quick" : "full";
    sessionStorage.setItem(SESSION_KEY, "true");
  } catch {
    // Storage bloqueado (aba privada): segue com a abertura completa.
    introMode = "full";
  }
  return introMode;
}

interface PrxLoaderProps {
  /** Quando false, a animação segura o logo montado até os dados ficarem prontos. */
  ready: boolean;
  percent?: number;
  error?: string;
  onComplete: () => void;
}

/**
 * Abertura breve da marca PRX; a permanência depende dos dados iniciais.
 * 1. As duas peças do símbolo deslizam e se encaixam no centro.
 * 2. O símbolo desliza para a esquerda enquanto P, R e X sobem de uma máscara.
 * 3. A assinatura é revelada da esquerda para a direita e a barra se abre do centro.
 * 4. A tela é recolhida para cima, revelando o app.
 */
export function PrxLoader({ ready, percent = ready ? 100 : 0, error, onComplete }: PrxLoaderProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/:/g, "");
  const [hydrated, setHydrated] = useState(false);
  const [slow, setSlow] = useState(false);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    setHydrated(true);
    const sync = () => setOffline(!navigator.onLine);
    sync();
    const timer = window.setTimeout(() => setSlow(true), 8000);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => { clearTimeout(timer); window.removeEventListener("online", sync); window.removeEventListener("offline", sync); };
  }, []);
  const [introFinished, setIntroFinished] = useState(false);
  const exitStarted = useRef(false);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useGSAP(
    () => {
      const q = gsap.utils.selector(rootRef);
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const seen = resolveIntroMode() === "quick";

      if (reduceMotion) {
        showPrxRevealFinal(q, gsap);
        gsap.fromTo(
          q("[data-logo]"),
          { autoAlpha: 0 },
          { autoAlpha: 1, duration: 0.2, onComplete: () => setIntroFinished(true) }
        );
        return;
      }

      const speed = seen ? 0.12 : 0.28;
      const tl = gsap.timeline({
        paused: true,
        defaults: { ease: "expo.out" },
        onComplete: () => setIntroFinished(true),
      });

      addPrxRevealTweens(tl, q, gsap)
        .to({}, { duration: 0.3 });

      // Estados iniciais já aplicados pelos .from(): agora o SVG pode aparecer sem "piscar" montado.
      gsap.set(q("[data-logo]"), { autoAlpha: 1 });

      // Relógio próprio da abertura: o app usa lagSmoothing(0) para sincronizar o Lenis,
      // o que faria a animação "pular" quadros enquanto a página ainda carrega (3D, hidratação).
      // Aqui cada quadro avança no máximo 1/30s: a animação nunca salta, só desacelera.
      let elapsed = 0;
      let last = performance.now();
      let frame = 0;
      const step = (now: number) => {
        elapsed += Math.min(now - last, 1000 / 30) / 1000;
        last = now;
        tl.time(elapsed / speed);
        if (tl.progress() < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame((now) => {
        last = now;
        frame = requestAnimationFrame(step);
      });

      return () => cancelAnimationFrame(frame);
    },
    { scope: rootRef }
  );

  useEffect(() => {
    if (!introFinished || !ready || exitStarted.current || !rootRef.current) return;
    exitStarted.current = true;
    const root = rootRef.current;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const logo = root.querySelector("[data-logo]");

    const exit = gsap.timeline({ onComplete: () => onCompleteRef.current() });
    if (reduceMotion) {
      exit.to(root, { autoAlpha: 0, duration: 0.15 });
    } else {
      exit
        .to(logo, { y: -36, autoAlpha: 0, duration: 0.2, ease: "power3.in" }, 0)
        .to(root, { clipPath: "inset(0% 0% 100% 0%)", duration: 0.3, ease: "power4.inOut" }, 0.05);
    }
    return () => {
      exit.kill();
      exitStarted.current = false;
      gsap.set(root, { autoAlpha: 1, clipPath: "inset(0% 0% 0% 0%)" });
      gsap.set(logo, { y: 0, autoAlpha: 1 });
    };
  }, [introFinished, ready]);

  return (
    <div
      ref={rootRef}
      role="status"
      aria-live="polite"
      aria-label="Carregando PRX"
      className="prx-loader fixed inset-0 z-[100] flex flex-col items-center justify-center gap-8 bg-white text-[#0b0b10]"
      style={{ clipPath: "inset(0% 0% 0% 0%)" }}
    >
      <PrxRevealMark style={{ visibility: "visible" }} uid={uid} className="w-[min(78vw,540px)] h-auto overflow-visible" />
      <div className="w-[min(78vw,360px)] space-y-3 text-center">
        <p className="text-sm font-semibold tabular-nums">Carregando PRX · {ready ? 100 : Math.min(99, percent)}%</p>
        <progress aria-label="Etapas da tela inicial concluídas" max={100} value={ready ? 100 : Math.min(99, percent)} className="h-2 w-full accent-[#6c0cf0]" />
        <p className="text-xs text-[#5b5b66]">Preparando dados e imagens da tela inicial</p>
        {!hydrated && (
          <div className="prx-early-slow space-y-3 rounded-xl bg-[#f4efff] p-4">
            <style>{`@keyframes prx-slow-appear{to{visibility:visible}}.prx-early-slow{visibility:hidden;animation:prx-slow-appear 0s 8s forwards}`}</style>
            <p className="text-sm font-semibold">O carregamento está demorando</p>
            <p className="text-xs text-[#5b5b66]">O carregamento está demorando. Confira o Wi-Fi ou os dados móveis.</p>
            <a href="/" className="inline-block rounded-full bg-[#6c0cf0] px-5 py-3 text-sm text-white">Tentar novamente</a>
          </div>
        )}
        {(offline || slow || error) && !ready && (
          <div className="space-y-3 rounded-xl bg-[#f4efff] p-4">
            <span aria-hidden className="inline-block h-6 w-6 animate-pulse rounded-full border-4 border-[#6c0cf0]/30 border-t-[#6c0cf0] motion-reduce:animate-none" />
            <p className="text-sm font-semibold">{offline ? "Sem internet" : error ? "Não foi possível concluir o carregamento" : "O carregamento está demorando"}</p>
            <p className="text-xs text-[#5b5b66]">{offline ? "Reconecte o Wi-Fi ou os dados móveis para continuar." : error || "Estamos aguardando a resposta dos serviços. Isso também pode acontecer com a internet funcionando."}</p>
            <button type="button" className="rounded-full bg-[#6c0cf0] px-5 py-3 text-sm font-medium text-white" onClick={() => window.location.reload()}>Tentar novamente</button>
          </div>
        )}
      </div>
    </div>
  );
}
