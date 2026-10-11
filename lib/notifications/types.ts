// Hello World

/** Canais de notificação do PRX. Push e SMS entram aqui quando existirem. */
export const NOTIFICATION_CHANNELS = ["email", "whatsapp"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** Modelos enviados hoje. Cada novo modelo ganha nome próprio para o registro de envios. */
export const NOTIFICATION_TEMPLATES = ["welcome_email", "phone_code", "resenha_list", "minor_event_authorization"] as const;
export type NotificationTemplate = (typeof NOTIFICATION_TEMPLATES)[number];

export type EmailProvider = "resend";
export type WhatsAppProvider = "whatsapp_cloud";
export type NotificationProvider = EmailProvider | WhatsAppProvider;

/**
 * Resultado de um envio:
 *   sent      → o provedor aceitou a mensagem;
 *   simulated → desenvolvimento sem provedor (nada saiu do servidor);
 *   skipped   → produção sem provedor configurado ou destinatário inválido;
 *   failed    → o provedor recusou ou não respondeu.
 */
export type DeliveryResult =
  | { status: "sent"; provider: NotificationProvider; providerId: string | null }
  | { status: "simulated" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; provider: NotificationProvider; error: string };

export type DeliveryStatus = DeliveryResult["status"];

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  template: NotificationTemplate;
  /** Evita e-mail duplicado quando a mesma chamada é repetida (Resend guarda por 24h). */
  idempotencyKey?: string;
}

/** Linha do registro de envios (auditoria; nunca guarda o conteúdo nem o código). */
export interface DeliveryRecord {
  id: string;
  userId: string | null;
  channel: NotificationChannel;
  template: NotificationTemplate;
  /** Destinatário mascarado, ex.: g***@gmail.com ou (11) *****-7777. */
  recipient: string;
  status: DeliveryStatus;
  provider: NotificationProvider | null;
  providerId: string | null;
  error: string | null;
  createdAt: string;
}
