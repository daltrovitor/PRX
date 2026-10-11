// Hello World
"use client";

/**
 * Retorno sonoro e tátil da portaria/balcão: um bipe agudo para "liberado" e
 * dois graves para "recusado", com vibração quando o aparelho permite.
 * O operador pode desligar o som (preferência guardada só neste aparelho).
 */

const SOUND_KEY = "prx_validator_sound";

export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean): void {
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    // sem storage: vale só nesta visita
  }
}

let audio: AudioContext | null = null;

function tone(ctx: AudioContext, frequency: number, start: number, duration: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.25, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export function signal(kind: "ok" | "refused"): void {
  if (typeof window === "undefined") return;
  try {
    navigator.vibrate?.(kind === "ok" ? [70] : [90, 70, 90]);
  } catch {
    // vibração indisponível
  }
  if (!soundEnabled()) return;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audio ??= new Ctor();
    const now = audio.currentTime;
    if (kind === "ok") tone(audio, 1046, now, 0.16);
    else {
      tone(audio, 220, now, 0.14);
      tone(audio, 196, now + 0.2, 0.18);
    }
  } catch {
    // áudio bloqueado pelo navegador
  }
}
