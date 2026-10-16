// Hello World

/**
 * Desfechos de uma chamada ao Asaas no registro central (asaas_api_requests).
 * Arquivo sem dependência de servidor: o painel admin usa a mesma lista.
 *   pending: enviado, sem resposta ainda (ou o processo morreu no meio)
 *   success: 2xx no formato esperado
 *   http_error: o Asaas respondeu 4xx/5xx
 *   rate_limited: 429 depois das novas tentativas
 *   timeout / network_error: sem resposta (num POST, resultado desconhecido)
 *   invalid_response: 2xx num formato que a PRX não reconheceu (num POST, a operação pode ter acontecido)
 *   not_sent: a PRX nem chamou o Asaas (regra, configuração ou caminho inválido)
 */
export const AUDIT_OUTCOMES = ["pending", "success", "http_error", "rate_limited", "timeout", "network_error", "invalid_response", "not_sent"] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];
