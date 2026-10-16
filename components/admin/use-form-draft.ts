// Hello World
"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

/*
 * Rascunho de formulário do admin guardado neste navegador: fechar o painel
 * sem querer, um erro ou uma recarga não apagam o que já foi digitado. O
 * rascunho só vale para a mesma versão do registro (`base`) e some quando o
 * formulário é salvo.
 */

interface Stored<T> {
  base: string;
  value: T;
}

function read<T extends object>(key: string, base: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Partial<Stored<T>>;
    return stored.base === base && stored.value && typeof stored.value === "object" ? stored.value : null;
  } catch {
    return null;
  }
}

export function useFormDraft<T extends object>(key: string, base: string, initial: () => T) {
  const [state, setState] = useState(() => {
    const saved = read<T>(key, base);
    // dirty: só vira rascunho depois que alguém mexe no formulário (abrir e fechar não grava nada).
    return { value: saved ? { ...initial(), ...saved } : initial(), restored: Boolean(saved), dirty: Boolean(saved) };
  });
  const done = useRef(false);

  useEffect(() => {
    if (done.current || !state.dirty) return;
    try {
      localStorage.setItem(key, JSON.stringify({ base, value: state.value } satisfies Stored<T>));
    } catch {
      // sem storage (aba privada): o formulário funciona, só não guarda o rascunho
    }
  }, [key, base, state.value, state.dirty]);

  const setValue: Dispatch<SetStateAction<T>> = useCallback((next) => {
    setState((s) => ({ ...s, dirty: true, value: typeof next === "function" ? (next as (prev: T) => T)(s.value) : next }));
  }, []);

  /** Depois de salvar: o rascunho deixa de existir. */
  const clear = useCallback(() => {
    done.current = true;
    try {
      localStorage.removeItem(key);
    } catch {}
  }, [key]);

  /** "Descartar rascunho": volta aos dados salvos. */
  const discard = useCallback(() => {
    try {
      localStorage.removeItem(key);
    } catch {}
    setState({ value: initial(), restored: false, dirty: false });
    // initial é recriado a cada render; a versão atual basta para o descarte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, base]);

  return { value: state.value, setValue, restored: state.restored, clear, discard };
}
