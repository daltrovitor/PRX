// Hello World
"use client";

import "./globals.css";
import { ErrorScreen } from "@/components/error-screen";

/** Erro no próprio layout raiz: mesma tela simples com código, dentro de um html próprio. */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body suppressHydrationWarning className="min-h-full bg-background text-foreground">
        <ErrorScreen error={error} retry={retry} />
      </body>
    </html>
  );
}
