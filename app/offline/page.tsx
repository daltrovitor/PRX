// Hello World
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ThemeToggle } from "@/components/theme-toggle";
import { IconRefresh } from "@/components/icons/prx-icons";
import { PRX_GRADIENTS, PRX_LAYOUT, PRX_PATHS } from "@/lib/brand/prx-logo-data";

gsap.registerPlugin(useGSAP);

export default function OfflinePage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const logoStageRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  const [retrying, setRetrying] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [statusText, setStatusText] = useState("Aguardando sinal para reconectar automaticamente...");

  useGSAP(
    () => {
      const q = gsap.utils.selector(containerRef);
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const SYMBOL_CENTER_OFFSET = 263;

      const transitionToTop = () => {
        if (!logoStageRef.current) return;
        const targetTop = "4.5rem";
        const targetWidth = Math.min(window.innerWidth * 0.76, 400);

        if (reduceMotion) {
          gsap.set(logoStageRef.current, { top: targetTop, y: 0, xPercent: -50, width: targetWidth });
          gsap.set(panelRef.current, { autoAlpha: 1, y: 0 });
          gsap.set(headerRef.current, { autoAlpha: 1 });
          return;
        }

        const transTl = gsap.timeline();
        transTl
          .to(logoStageRef.current, {
            top: targetTop,
            yPercent: 0,
            y: 0,
            transform: "translate(-50%, 0)",
            width: targetWidth,
            duration: 0.95,
            ease: "power3.inOut",
          })
          .fromTo(
            panelRef.current,
            { autoAlpha: 0, y: 35 },
            { autoAlpha: 1, y: 0, duration: 0.75, ease: "power3.out" },
            "-=0.4"
          )
          .to(
            headerRef.current,
            { autoAlpha: 1, duration: 0.45, ease: "power2.out" },
            "-=0.5"
          );
      };

      if (reduceMotion) {
        gsap.set(q("[data-tag-clip]"), { attr: { width: PRX_LAYOUT.viewBox.full[2] } });
        gsap.set(q("[data-piece='white'], [data-piece='color'], [data-piece='x-arm']"), { autoAlpha: 1, x: 0, y: 0 });
        gsap.set(q("[data-letter]"), { y: 0 });
        gsap.set(q("[data-logo]"), { autoAlpha: 1 });
        transitionToTop();
        return;
      }

      const tl = gsap.timeline({
        paused: true,
        defaults: { ease: "expo.out" },
        onComplete: () => {
          setTimeout(transitionToTop, 200);
        },
      });

      gsap.set(q("[data-symbol-group]"), { x: SYMBOL_CENTER_OFFSET });
      tl.from(q("[data-piece='white']"), { x: -90, y: -20, autoAlpha: 0, duration: 0.85 }, 0.1)
        .from(q("[data-piece='color']"), { x: 90, y: 20, autoAlpha: 0, duration: 0.85 }, 0.18)
        .to(q("[data-symbol-group]"), { x: 0, duration: 0.85, ease: "expo.inOut" }, 0.8)
        .from(q("[data-letter]"), { y: 130, duration: 0.9, stagger: 0.09 }, 1.38)
        .from(q("[data-piece='x-arm']"), { x: 46, y: -46, autoAlpha: 0, duration: 0.7, ease: "back.out(2)" }, 1.78)
        .to(q("[data-tag-clip]"), { attr: { width: PRX_LAYOUT.viewBox.full[2] }, duration: 0.9, ease: "power3.inOut" }, 2.0)
        .to({}, { duration: 0.7 }, 2.35) // a barra saiu da marca; o tempo da sequência segue igual ao do PrxLoader online
        .to({}, { duration: 0.35 });

      // Estados iniciais já aplicados pelos .from(): agora o SVG pode aparecer sem "piscar" montado.
      gsap.set(q("[data-logo]"), { autoAlpha: 1 });

      let elapsed = 0;
      let last = performance.now();
      let frame = 0;
      const step = (now: number) => {
        elapsed += Math.min(now - last, 1000 / 30) / 1000;
        last = now;
        tl.time(elapsed);
        if (tl.progress() < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame((now) => {
        last = now;
        frame = requestAnimationFrame(step);
      });

      return () => cancelAnimationFrame(frame);
    },
    { scope: containerRef }
  );

  const handleRetry = (manual = true) => {
    if (retrying) return;
    setRetrying(true);
    setStatusText("Testando conexão...");

    fetch(`/manifest.json?_t=${Date.now()}`, { method: "HEAD", cache: "no-store" })
      .then((res) => {
        if (res.ok || res.status < 500) {
          setIsOnline(true);
          setStatusText("Conexão restabelecida! Recarregando...");
          setTimeout(() => {
            window.location.reload();
          }, 400);
        } else {
          throw new Error("Offline");
        }
      })
      .catch(() => {
        setRetrying(false);
        setIsOnline(false);
        setStatusText(
          manual
            ? "Sem conexão no momento. Tente novamente em instantes."
            : "Aguardando sinal para reconectar automaticamente..."
        );
      });
  };

  useEffect(() => {
    const onOnline = () => handleRetry(false);
    window.addEventListener("online", onOnline);

    const interval = setInterval(() => {
      if (typeof navigator !== "undefined" && navigator.onLine && !retrying) {
        handleRetry(false);
      }
    }, 3500);

    return () => {
      window.removeEventListener("online", onOnline);
      clearInterval(interval);
    };
  }, [retrying]);

  const [vx, vy, vw, vh] = PRX_LAYOUT.viewBox.full;
  const { symbol: sg, x: xg } = PRX_GRADIENTS;

  return (
    <div ref={containerRef} className="min-h-screen w-full bg-background text-foreground transition-colors overflow-x-hidden relative">
      {/* Header com o ThemeToggle oficial */}
      <header
        ref={headerRef}
        className="fixed top-0 left-0 right-0 h-18 px-6 flex items-center justify-end z-50 opacity-0 pointer-events-none transition-opacity"
        style={{ pointerEvents: "auto" }}
      >
        <ThemeToggle variant="header" showLabel={false} />
      </header>

      {/* Estágio do Logo no Centro que sobre para o Topo */}
      <div
        ref={logoStageRef}
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(82vw,520px)] z-40 pointer-events-none flex items-center justify-center will-change-transform"
      >
        <svg
          data-logo
          viewBox={`${vx} ${vy} ${vw} ${vh}`}
          className="w-full h-auto overflow-visible text-foreground drop-shadow-[0_0_24px_rgba(108,12,240,0.22)]"
          style={{ visibility: "hidden" }}
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <radialGradient id="app-offline-s" gradientUnits="userSpaceOnUse" cx={sg.cx} cy={sg.cy} r={sg.r}>
              {sg.stops.map(([offset, color]) => (
                <stop key={offset} offset={offset} stopColor={color} />
              ))}
            </radialGradient>
            <linearGradient id="app-offline-x" gradientUnits="userSpaceOnUse" x1={xg.x1} y1={xg.y1} x2={xg.x2} y2={xg.y2}>
              {xg.stops.map(([offset, color]) => (
                <stop key={offset} offset={offset} stopColor={color} />
              ))}
            </linearGradient>

            <clipPath id="app-offline-wc">
              <rect x={90} y={296} width={500} height={112} />
            </clipPath>
            <clipPath id="app-offline-tc">
              <rect data-tag-clip x={0} y={0} width={0} height={vh} />
            </clipPath>
          </defs>

          <g data-symbol-group>
            <g transform={PRX_LAYOUT.symbol}>
              <path data-piece="white" fill="currentColor" d={PRX_PATHS.symbolWhite} />
              <path data-piece="color" fill="url(#app-offline-s)" d={PRX_PATHS.symbolColor} />
            </g>
          </g>

          <g transform={PRX_LAYOUT.wordFull}>
            <g clipPath="url(#app-offline-wc)" style={{ clipPath: "url(#app-offline-wc)" }}>
              <path data-letter fill="currentColor" fillRule="evenodd" d={PRX_PATHS.p} />
              <path data-letter fill="currentColor" fillRule="evenodd" d={PRX_PATHS.r} />
              <path data-letter fill="url(#app-offline-x)" d={PRX_PATHS.xMain} />
            </g>
            <path data-piece="x-arm" fill="url(#app-offline-x)" d={PRX_PATHS.xArm} />
          </g>

          <g clipPath="url(#app-offline-tc)" style={{ clipPath: "url(#app-offline-tc)" }}>
            <text
              x={549}
              y={153}
              textAnchor="middle"
              fill="currentColor"
              style={{ fontFamily: "var(--font-sans, system-ui, sans-serif)", fontSize: "28px", fontWeight: 400, letterSpacing: "0.6em" }}
            >
              NEXT IS YOURS
            </text>
          </g>
        </svg>
      </div>

      {/* Conteúdo principal */}
      <main className="min-h-screen w-full flex flex-col items-center justify-center px-6 py-12">
        <div className="w-[min(76vw,400px)] h-20 mb-6 invisible" aria-hidden="true" />

        {/* Card Offline */}
        <div
          ref={panelRef}
          className="w-full max-w-[480px] bg-card border border-border rounded-2xl p-7 sm:p-8 shadow-sm opacity-0 will-change-transform"
        >
          {/* Badge */}
          <div
            className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-semibold uppercase tracking-wider mb-5 transition-colors ${
              isOnline
                ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-500"
                : "bg-amber-500/10 border border-amber-500/30 text-amber-500"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isOnline ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" : "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]"
              }`}
            />
            <span>{isOnline ? "Conectado" : "Sem Conexão"}</span>
          </div>

          {/* Ícone Wi-Fi off geométrico */}
          <div className="w-14 h-14 mx-auto mb-5 rounded-xl bg-background border border-border flex items-center justify-center text-primary">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="square"
              strokeLinejoin="miter"
              aria-hidden="true"
            >
              <path d="M1 1l22 22" />
              <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
              <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
              <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
              <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <path d="M12 20h.01" />
            </svg>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-3">
            Você está offline
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed mb-6">
            Não foi possível carregar a página solicitada porque o dispositivo está sem conexão com a internet. Verifique seu Wi-Fi ou dados móveis.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 w-full">
            <button
              type="button"
              onClick={() => handleRetry(true)}
              disabled={retrying}
              className="flex-1 inline-flex items-center justify-center gap-2 py-3.5 px-5 min-h-[48px] bg-primary text-primary-foreground font-semibold text-sm rounded-xl shadow-md hover:bg-primary/90 transition-all cursor-pointer active:scale-[0.98] disabled:opacity-75 disabled:pointer-events-none"
            >
              <IconRefresh size={18} className={retrying ? "animate-spin" : ""} />
              <span>{retrying ? "Verificando..." : "Tentar novamente"}</span>
            </button>

            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 py-3.5 px-5 min-h-[48px] bg-transparent text-foreground border border-border font-medium text-sm rounded-xl hover:bg-muted/50 transition-colors cursor-pointer"
            >
              Início
            </Link>
          </div>

          <div className="mt-5 text-xs font-mono text-muted-foreground flex items-center justify-center gap-2">
            <span>{statusText}</span>
          </div>
        </div>
      </main>
    </div>
  );
}
