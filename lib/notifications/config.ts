// Hello World

/*
 * Configuração dos canais de notificação, lida do ambiente sob demanda (as
 * variáveis podem existir só em runtime na hospedagem). Sem provedor
 * configurado, o desenvolvimento simula o envio e a produção registra
 * "skipped" — notificação nunca derruba cadastro nem login.
 */

import { COMPANY } from "@/lib/company";
import { APP_URL } from "@/lib/domains";

export const DEFAULT_SITE_URL = APP_URL;
export const DEFAULT_EMAIL_FROM = "PRX <noreply@prx.app.br>";

const clean = (value: string | undefined): string => (value ?? "").trim();
const stripSlash = (url: string): string => url.replace(/\/+$/, "");

function httpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? stripSlash(url.origin + url.pathname) : null;
  } catch {
    return null;
  }
}

/** Endereço público do app (links e imagens do e-mail). */
export function publicSiteUrl(): string {
  return httpUrl(clean(process.env.NEXT_PUBLIC_SITE_URL)) ?? httpUrl(clean(process.env.NEXT_PUBLIC_APP_URL)) ?? DEFAULT_SITE_URL;
}

/**
 * De onde o e-mail carrega as imagens (public/email). Separado do app para o
 * desenvolvimento local enviar e-mails com imagens servidas pela produção.
 */
export function emailAssetsUrl(): string {
  return httpUrl(clean(process.env.PRX_EMAIL_ASSETS_URL)) ?? publicSiteUrl();
}

/** Simular envio (e mostrar o código na tela) só fora de produção. */
export function canSimulateDelivery(): boolean {
  return process.env.NODE_ENV !== "production";
}

export interface EmailConfig {
  /** Chave da API do Resend (https://resend.com). */
  apiKey: string;
  /** Remetente com domínio verificado no Resend, ex.: "PRX <noreply@prx.app.br>". */
  from: string;
  /** Para onde vão as respostas: o noreply não lê caixa de entrada, o suporte lê. */
  replyTo: string;
}

export function emailConfig(): EmailConfig {
  return {
    apiKey: clean(process.env.RESEND_API_KEY),
    from: clean(process.env.PRX_EMAIL_FROM) || DEFAULT_EMAIL_FROM,
    replyTo: clean(process.env.PRX_EMAIL_REPLY_TO) || COMPANY.supportEmail,
  };
}

export interface WhatsAppConfig {
  /** Token permanente de um usuário de sistema da conta WhatsApp Business (Meta). */
  accessToken: string;
  /** Phone Number ID do número remetente (não é o número em si). */
  phoneNumberId: string;
  /** Template de autenticação aprovado pela Meta, com botão "Copiar código". */
  otpTemplate: string;
  language: string;
  apiVersion: string;
}

export function whatsappConfig(): WhatsAppConfig {
  return {
    accessToken: clean(process.env.WHATSAPP_ACCESS_TOKEN),
    phoneNumberId: clean(process.env.WHATSAPP_PHONE_NUMBER_ID),
    otpTemplate: clean(process.env.WHATSAPP_OTP_TEMPLATE) || "prx_codigo_verificacao",
    language: clean(process.env.WHATSAPP_TEMPLATE_LANG) || "pt_BR",
    apiVersion: clean(process.env.WHATSAPP_API_VERSION) || "v23.0",
  };
}
