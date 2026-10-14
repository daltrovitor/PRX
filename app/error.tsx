// Hello World
"use client";

import { ErrorScreen } from "@/components/error-screen";

/** Qualquer tela que quebrar: frase simples com código para o suporte (components/error-screen.tsx). */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorScreen error={error} retry={retry} />;
}
