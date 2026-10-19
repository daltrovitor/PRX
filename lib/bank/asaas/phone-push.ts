// Hello World
import { sendPushToUser } from "@/lib/push/send";
import type { AsaasBankStore, NewNotification } from "@/lib/bank/asaas/types";

/**
 * Todo aviso novo do PRX BANK (Pix recebido e enviado, contas pagas, aprovação
 * da conta, revisão de identidade) também vai para o celular. Aviso repetido
 * (mesmo evento do webhook) não gera notificação de novo.
 */
export function withPhonePush(store: AsaasBankStore): AsaasBankStore {
  return new Proxy(store, {
    get(target, prop, receiver) {
      if (prop === "insertNotification") {
        return async (input: NewNotification) => {
          const fresh = await target.insertNotification(input);
          if (fresh) await sendPushToUser(input.userId, { title: input.title, body: input.body, url: "/#bank", tag: `bank-${input.eventId}` });
          return fresh;
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
