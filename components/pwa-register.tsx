// Hello World
"use client";

import { useEffect } from "react";
import { startInstallCapture } from "@/lib/pwa-install";

/**
 * Registrador do Service Worker PWA para PRX.
 * Compatível com iOS (Safari e Home Screen standalone PWA),
 * Android (Chrome e WebAPK) e Desktop.
 */
export function PwaRegister() {
  useEffect(() => {
    // Guarda o convite de instalação desde a primeira página (o card da Home usa depois).
    startInstallCapture();

    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const registerWorker = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((registration) => {
          // Checa atualizações periodicamente
          registration.onupdatefound = () => {
            const installingWorker = registration.installing;
            if (!installingWorker) return;

            installingWorker.onstatechange = () => {
              if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
                // Nova versão instalada em background
              }
            };
          };
        })
        .catch(() => {
          // Erro de registro silenciosamente tratado
        });
    };

    // Register as soon as hydration finishes; a slow image must not postpone
    // installation of the connection fallback until the window load event.
    registerWorker();
  }, []);

  return null;
}
