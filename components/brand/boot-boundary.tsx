"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { summarizeBootTasks, type BootTask as Task } from "@/lib/boot-progress";
const BootContext = createContext<((name: string, task: Task) => void) | null>(null);

/** Register actual data milestones; no timer pretends that a request finished. */
export function useBootTask(name: string, ready: boolean, error?: string | null) {
  const report = useContext(BootContext);
  useEffect(() => { report?.(name, { ready: ready && !error, error }); }, [report, name, ready, error]);
}

export function BootBoundary({ children, onProgress }: { children: ReactNode; onProgress: (percent: number, ready: boolean, error?: string) => void }) {
  const [tasks, setTasks] = useState<Record<string, Task>>({ screen: { ready: false } });
  const root = useRef<HTMLDivElement>(null);
  const report = useCallback((name: string, task: Task) => setTasks((current) => {
    if (current[name]?.ready === task.ready && current[name]?.error === task.error) return current;
    return { ...current, [name]: task };
  }), []);
  const dataReady = Object.entries(tasks).filter(([name]) => name !== "screen").every(([, task]) => task.ready);
  useEffect(() => {
    if (!dataReady) return;
    let alive = true;
    let frame = 0;
    const cleanups: (() => void)[] = [];
    report("screen", { ready: false });
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const images = Array.from(root.current?.querySelectorAll("img") ?? []).filter((img) => {
          const box = img.getBoundingClientRect();
          return box.width > 0 && box.height > 0 && box.top < window.innerHeight && box.bottom > 0;
        });
        const waitImage = (img: HTMLImageElement) => new Promise<void>((resolve, reject) => {
          if (img.complete) { img.naturalWidth ? resolve() : reject(new Error("Uma imagem da tela inicial não carregou.")); return; }
          const done = () => { cleanup(); resolve(); };
          const fail = () => { cleanup(); reject(new Error("Uma imagem da tela inicial não carregou.")); };
          const cleanup = () => { img.removeEventListener("load", done); img.removeEventListener("error", fail); };
          cleanups.push(cleanup);
          img.addEventListener("load", done);
          img.addEventListener("error", fail);
        });
        void Promise.all([document.fonts?.ready, ...images.map(waitImage)]).then(() => {
          if (alive) report("screen", { ready: true });
        }).catch((error: Error) => { if (alive) report("screen", { ready: false, error: error.message }); });
      });
    });
    return () => { alive = false; cancelAnimationFrame(frame); cleanups.forEach((cleanup) => cleanup()); };
  }, [dataReady, report]);
  const summary = useMemo(() => summarizeBootTasks(tasks), [tasks]);
  useEffect(() => { onProgress(summary.percent, summary.ready, summary.error); }, [summary, onProgress]);
  return <BootContext.Provider value={report}><div ref={root}>{children}</div></BootContext.Provider>;
}
