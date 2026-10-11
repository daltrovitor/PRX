// Hello World
import { PartnerError } from "@/lib/partners/errors";
import type { AsaasClient } from "@/lib/asaas/client";
import { createCustomer } from "@/lib/asaas/pix";

export interface SandboxChecklistResult {
  customer: { id: string };
  payment: { id: string; value: number };
  confirmed: boolean;
}

/**
 * Executa as 3 ações exigidas pelo checklist do painel Asaas Sandbox:
 * 1. Criar um cliente via API (/v3/customers)
 * 2. Criar uma cobrança via API (/v3/payments)
 * 3. Confirmar um pagamento via API (/v3/payments/{id}/receiveInCash)
 */
export async function completeAsaasSandboxChecklist(client: AsaasClient): Promise<SandboxChecklistResult> {
  // Em produção isso criaria cliente e cobrança reais e daria baixa em dinheiro.
  if (client.environment !== "sandbox") throw new PartnerError("O checklist de homologação só roda no sandbox do Asaas.", 409);
  const customer = await createCustomer(client, undefined, {
    name: "PRX Homologação Sandbox",
    cpfCnpj: "52998224725",
    email: "sandbox@prx.app.br",
    mobilePhone: "11987654321",
  });

  const today = new Date().toISOString().slice(0, 10);
  const payment = await client.post<{ id: string; value: number }>("/payments", {
    customer: customer.id,
    billingType: "PIX",
    value: 5.0,
    dueDate: today,
    description: "Homologação API Asaas PRX",
  });

  let confirmed = false;
  try {
    await client.post(`/payments/${payment.id}/receiveInCash`, {
      paymentDate: today,
      value: 5.0,
    });
    confirmed = true;
  } catch (err) {
    console.warn("[asaas] Aviso ao confirmar pagamento de teste no sandbox:", err instanceof Error ? err.message : err);
  }

  return { customer: { id: customer.id }, payment: { id: payment.id, value: 5.0 }, confirmed };
}
