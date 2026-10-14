// Hello World
"use client";

import { installApiErrorGuard } from "@/lib/client-errors";

// Instalado ao carregar o módulo, antes dos efeitos das telas (que já chamam a API).
installApiErrorGuard();

/** Liga o guarda de erros da API no navegador (lib/client-errors.ts). Não desenha nada. */
export function ApiErrorGuard() {
  return null;
}
