// Hello World
"use client";

import { useSyncExternalStore } from "react";

/*
 * Instalação da PRX como app (PWA). O navegador dispara `beforeinstallprompt`
 * uma única vez por carregamento; guardamos o evento aqui (módulo global) para o
 * card da Home usar quando o membro tocar em "Instalar". Sem o evento (Firefox,
 * Safari, prompt já consumido), a tela mostra o passo a passo do sistema.
 */

export type InstallPlatform = "android" | "windows" | "ios" | "macos" | "linux" | "other";
export type InstallBrowser = "chrome" | "edge" | "samsung" | "firefox" | "safari" | "opera" | "other";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const STORAGE_KEY = "prx_pwa_card";
/** "Agora não" esconde o card por 30 dias; "Já instalei" e a instalação escondem de vez. */
const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

let deferred: BeforeInstallPromptEvent | null = null;
let installedNow = false;
let version = 0;
const listeners = new Set<() => void>();
const emit = () => {
  version += 1;
  listeners.forEach((l) => l());
};

let started = false;
type InstallWindow = Window & { __prxInstallPrompt?: BeforeInstallPromptEvent | null };

/** Começa a escutar os eventos de instalação. Chamado pelo registro do Service Worker, em todas as páginas. */
export function startInstallCapture(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  const win = window as InstallWindow;
  // O script do <head> (app/layout.tsx) pega o evento antes do React; aqui só o recolhemos.
  const adopt = () => {
    if (!win.__prxInstallPrompt) return;
    deferred = win.__prxInstallPrompt;
    win.__prxInstallPrompt = null;
    emit();
  };
  adopt();
  window.addEventListener("prx-installprompt", adopt);
  window.addEventListener("beforeinstallprompt", (event) => {
    // Sem a mini-barra automática do Chrome: o convite é o diálogo do próprio app.
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installedNow = true;
    remember("installed");
    emit();
  });
}

export function detectPlatform(ua: string, maxTouchPoints = 0): InstallPlatform {
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1)) return "ios";
  if (/Windows NT/i.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "macos";
  if (/Linux|CrOS/i.test(ua)) return "linux";
  return "other";
}

export function detectBrowser(ua: string): InstallBrowser {
  if (/SamsungBrowser/i.test(ua)) return "samsung";
  if (/Edg(e|A|iOS)?\//i.test(ua)) return "edge";
  if (/OPR\/|Opera/i.test(ua)) return "opera";
  if (/Firefox|FxiOS/i.test(ua)) return "firefox";
  if (/Chrome|CriOS|Chromium/i.test(ua)) return "chrome";
  if (/Safari/i.test(ua)) return "safari";
  return "other";
}

/** Já aberto como app instalado (janela própria, sem barra do navegador). */
function isStandalone(): boolean {
  try {
    const nav = navigator as Navigator & { standalone?: boolean };
    return window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: window-controls-overlay)").matches || nav.standalone === true;
  } catch {
    return false;
  }
}

type Remembered = { state: "dismissed" | "installed"; at: number };

function readRemembered(): Remembered | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<Remembered>;
    if ((value.state === "dismissed" || value.state === "installed") && typeof value.at === "number") return { state: value.state, at: value.at };
  } catch {
    // storage indisponível (aba privada): o card simplesmente volta a aparecer
  }
  return null;
}

function remember(state: Remembered["state"]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state, at: Date.now() }));
  } catch {
    // sem storage, a preferência vale só nesta visita
  }
}

export function dismissInstallCard(state: Remembered["state"]): void {
  remember(state);
  emit();
}

/** Uma conta nova recebe seu próprio convite, sem herdar o descarte de outra conta. */
export function offerInstallAfterSignup(): void {
  if (typeof window === "undefined" || installedNow || isStandalone()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Mesmo sem armazenamento, atualiza a oferta desta visita.
  }
  emit();
}

export interface InstallSnapshot {
  /** O card deve aparecer (não instalado, não dispensado, fora do modo app). */
  visible: boolean;
  /** O navegador oferece o prompt nativo de instalação agora. */
  canPrompt: boolean;
  /** Já instalado ou aberto como app (o Perfil esconde o "Instalar o app"). */
  installed: boolean;
  platform: InstallPlatform;
  browser: InstallBrowser;
}

const SERVER_SNAPSHOT: InstallSnapshot = { visible: false, canPrompt: false, installed: false, platform: "other", browser: "other" };
let cached: { version: number; snapshot: InstallSnapshot } | null = null;

function getSnapshot(): InstallSnapshot {
  if (cached && cached.version === version) return cached.snapshot;
  const ua = navigator.userAgent;
  const remembered = readRemembered();
  const installed = installedNow || isStandalone() || remembered?.state === "installed";
  const hidden = installed || (remembered?.state === "dismissed" && Date.now() - remembered.at < SNOOZE_MS);
  const snapshot: InstallSnapshot = {
    visible: !hidden,
    canPrompt: deferred !== null,
    installed,
    platform: detectPlatform(ua, navigator.maxTouchPoints || 0),
    browser: detectBrowser(ua),
  };
  cached = { version, snapshot };
  return snapshot;
}

function subscribe(listener: () => void) {
  startInstallCapture();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePwaInstall(): InstallSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);
}

/** Abre o prompt nativo (Android: WebAPK na tela inicial; Windows: app de desktop). */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const event = deferred;
  if (!event) return "unavailable";
  // O evento só pode ser usado uma vez.
  deferred = null;
  emit();
  try {
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === "accepted") {
      installedNow = true;
      remember("installed");
      emit();
    }
    return choice.outcome;
  } catch {
    return "unavailable";
  }
}
