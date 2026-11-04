// Hello World
import type { PaymentGateway } from "@/lib/billing/gateway";

/**
 * Gateway de pagamento falso para os testes: cada método da interface responde
 * com o que o teste informar (ou falha, "não simulado") e todas as chamadas
 * ficam registradas em `calls`.
 */

type Method = Exclude<keyof PaymentGateway, "environment">;
type Impl = { [K in Method]?: PaymentGateway[K] };

export interface GatewayCall {
  method: Method;
  args: unknown[];
}

const METHODS: Method[] = [
  "findCustomerByReference",
  "createCustomer",
  "createSubscription",
  "getSubscription",
  "updateSubscriptionValue",
  "deleteSubscription",
  "listSubscriptionPayments",
  "createPayment",
  "getPayment",
  "cancelPayment",
  "refundPayment",
  "getPaymentPixQr",
];

export function fakeGateway(impl: Impl = {}) {
  const calls: GatewayCall[] = [];
  const target: Record<string, unknown> = { environment: "sandbox" };
  for (const name of METHODS) {
    target[name] = async (...args: unknown[]) => {
      calls.push({ method: name, args });
      const fn = impl[name] as ((...a: unknown[]) => unknown) | undefined;
      if (!fn) throw new Error(`gateway não simulado: ${name}`);
      return fn(...args);
    };
  }
  return {
    gateway: target as unknown as PaymentGateway,
    calls,
    /** Chamadas feitas a um método, na ordem. */
    called: (name: Method) => calls.filter((c) => c.method === name),
  };
}
