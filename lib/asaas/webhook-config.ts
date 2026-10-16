// Hello World
import { z } from "zod";
import type { AsaasClient } from "@/lib/asaas/client";
import type { SubaccountWebhook } from "@/lib/asaas/accounts";

/**
 * Configuração dos webhooks de uma subconta, com a chave dela:
 * GET /v3/webhooks, POST /v3/webhooks e PUT /v3/webhooks/{id}
 * (docs: /reference/listar-webhooks, /reference/criar-novo-webhook,
 * /reference/atualizar-webhook-existente). Serve para subcontas criadas antes
 * de uma mudança (token rotacionado, eventos novos) e para ver se a fila do
 * Asaas está interrompida (15 falhas seguidas param o envio).
 */

const text = z.string().nullish().transform((v) => v ?? null);

const webhookSchema = z
  .object({
    id: z.string().min(1),
    name: text,
    url: text,
    email: text,
    enabled: z.boolean().nullish().transform((v) => v ?? false),
    interrupted: z.boolean().nullish().transform((v) => v ?? false),
    hasAuthToken: z.boolean().nullish().transform((v) => v ?? false),
    sendType: text,
    penalizedRequestsCount: z.number().nullish().transform((v) => v ?? 0),
    events: z
      .array(z.string())
      .nullish()
      .transform((v) => v ?? []),
  })
  .loose();
export type WebhookConfig = z.output<typeof webhookSchema>;

const listSchema = z.object({
  data: z
    .array(webhookSchema)
    .nullish()
    .transform((v) => v ?? []),
});

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export async function listWebhooks(client: AsaasClient, apiKey: string): Promise<WebhookConfig[]> {
  return (await client.get("/webhooks", { apiKey, query: { limit: 20 } }, listSchema)).data;
}

export function createWebhook(client: AsaasClient, apiKey: string, config: SubaccountWebhook): Promise<WebhookConfig> {
  return client.post("/webhooks", config, { apiKey }, webhookSchema);
}

/**
 * Atualiza só o que a PRX controla: URL, eventos, token e ativo. `reactivate`
 * manda interrupted = false, o que faz o Asaas reenviar a fila parada: só usar
 * depois de corrigir a causa (token, URL ou erro na PRX).
 */
export function updateWebhook(client: AsaasClient, apiKey: string, id: string, config: SubaccountWebhook, reactivate: boolean): Promise<WebhookConfig> {
  if (!SAFE_ID.test(id)) throw new Error("[asaas] webhook inválido.");
  const body = { url: config.url, events: config.events, authToken: config.authToken, enabled: true, sendType: config.sendType, ...(reactivate ? { interrupted: false } : {}) };
  return client.put(`/webhooks/${id}`, body, { apiKey }, webhookSchema);
}
