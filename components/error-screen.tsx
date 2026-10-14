// Hello World
"use client";

import { useEffect, useState } from "react";
import { reportClientIncident } from "@/lib/client-errors";

/**
 * Tela quebrou: frase simples, código para o suporte e "Tentar de novo". O
 * motivo técnico nunca aparece; vai para o registro com o código.
 */
export function ErrorScreen({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void reportClientIncident({ kind: "render", path: window.location.pathname, digest: error.digest, message: error.message.slice(0, 300) }).then((text) => {
      if (alive) setMessage(text);
    });
    return () => {
      alive = false;
    };
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">Deu um erro ao abrir esta tela.</h1>
      <p className="text-[15px] leading-relaxed text-muted-foreground">{message ?? "Estamos registrando o erro…"}</p>
      <button type="button" onClick={() => retry()} className="mx-auto min-h-12 cursor-pointer rounded-md bg-foreground px-6 text-[15px] font-medium text-background">
        Tentar de novo
      </button>
    </main>
  );
}
