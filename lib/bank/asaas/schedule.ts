// Hello World
import { after } from "next/server";
import { asaasDeps } from "@/lib/bank/asaas/deps";
import { syncOnboardingDocuments } from "@/lib/bank/asaas/documents";
import { describeError } from "@/lib/bank/asaas/provisioning-log";

/**
 * Envio dos documentos depois da resposta ao membro (next/server `after`): o
 * Asaas pede 15 s entre a criação da subconta e a consulta dos documentos, e o
 * membro não precisa esperar por isso. Se o processo acabar antes, a aba PRX
 * BANK e a conciliação enviam depois. Só pode ser chamado dentro de uma rota.
 */
export function scheduleDocumentSync(userId: string): void {
  after(async () => {
    try {
      const deps = asaasDeps();
      const first = await syncOnboardingDocuments(userId, deps);
      if (first.state === "wait") {
        await new Promise((resolve) => setTimeout(resolve, first.retryInMs + 1_000));
        await syncOnboardingDocuments(userId, deps);
      }
    } catch (err) {
      console.warn("[prx-bank:abertura] documentos adiados para a próxima visita ou conciliação:", describeError(err));
    }
  });
}
