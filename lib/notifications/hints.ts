// Hello World

/**
 * Da falha de um envio ao "o que fazer". O texto do provedor continua visível no painel; a
 * dica só diz o próximo passo. Casa com o que lib/notifications/email.ts grava em `error`
 * ("<status> <nome> <mensagem>" do Resend) e com as frases do próprio app.
 * Resposta real do Resend para chave inválida: 401 validation_error "API key is invalid"
 * (o nome é genérico, por isso a dica casa pela mensagem). Lista de erros:
 * https://resend.com/docs/api-reference/errors
 */

/** Domínio do remetente: "PRX <noreply@prx.app.br>" → "prx.app.br". */
export function senderDomain(from: string): string | null {
  const match = from.match(/@([^\s>]+)\s*>?\s*$/);
  return match ? match[1].toLowerCase() : null;
}

export function emailErrorHint(error: string | null | undefined, from: string): string | null {
  const text = (error ?? "").toLowerCase();
  if (!text) return null;
  const domain = senderDomain(from) ?? "do remetente";

  if (/resend_api_key|missing_api_key/.test(text)) {
    return 'O servidor não tem a chave do Resend. No Resend, abra API Keys → Create API Key (permissão "Sending access"), salve o valor como RESEND_API_KEY na Vercel (Settings → Environment Variables) e faça um novo deploy.';
  }
  if (/api key is (invalid|not active|suspended)|suspended_api_key|restricted_api_key|^401\b/.test(text)) {
    return "O Resend recusou a chave (apagada, inativa, suspensa ou copiada errada). Crie outra em API Keys, troque RESEND_API_KEY na Vercel e faça um novo deploy.";
  }
  if (/domain is not verified/.test(text)) {
    return `O domínio ${domain} não está verificado no Resend. Em Domains ele precisa estar "Verified". Se você verificou outro domínio ou subdomínio, defina PRX_EMAIL_FROM com um endereço dele.`;
  }
  if (/testing emails to your own/.test(text)) {
    return "O Resend só envia e-mails de teste para o dono da conta. Use um remetente de um domínio verificado em Domains (PRX_EMAIL_FROM).";
  }
  if (/invalid.{0,12}from|from.{0,24}(invalid|format)/.test(text)) {
    return 'O remetente (PRX_EMAIL_FROM) está em formato inválido. Use "Nome <email@dominio.com>".';
  }
  if (/quota_exceeded/.test(text)) {
    return "O limite de envios do plano do Resend acabou (diário ou mensal). Veja o uso na conta do Resend ou mude de plano.";
  }
  if (/rate_limit_exceeded/.test(text)) {
    return "O Resend limitou a velocidade dos envios. Tente de novo em instantes.";
  }
  if (/destinatário inválido/.test(text)) {
    return "O e-mail do destinatário é inválido, então o envio nem foi tentado.";
  }
  if (/^5\d\d\b|application_error|service_unavailable/.test(text)) {
    return "O Resend está instável agora. Tente de novo em alguns minutos.";
  }
  if (/sem resposta|timeout|timed out|aborted|fetch failed|econnreset|enotfound/.test(text)) {
    return "O servidor não conseguiu falar com o Resend (rede ou instabilidade). Tente de novo.";
  }
  return null;
}
