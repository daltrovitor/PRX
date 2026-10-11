// Hello World

/**
 * Textos dos avisos do PRX BANK disparados pelos eventos do Asaas. Título e
 * corpo juntos formam a frase completa mostrada no sino e no toast.
 */

export type BankNoticeKind =
  | "pix_received"
  | "pix_sent"
  | "transfer_failed"
  | "bill_paid"
  | "bill_failed"
  | "account_approved"
  | "account_rejected"
  | "onboarding_pending";

export interface BankMessage {
  title: string;
  body: string;
}

export const brl = (value: number): string => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const clean = (name: string | null | undefined, fallback: string) => (name ?? "").replace(/\s+/g, " ").trim().slice(0, 60) || fallback;

export function bankMessage(kind: BankNoticeKind, data: { amount?: number; counterparty?: string | null; reason?: string | null } = {}): BankMessage {
  const value = brl(data.amount ?? 0);
  switch (kind) {
    case "pix_received":
      return { title: `Pix recebido! ${value} de ${clean(data.counterparty, "um pagador")}.`, body: "O valor já está no seu saldo." };
    case "pix_sent":
      return { title: `Pix enviado com sucesso! ${value} para ${clean(data.counterparty, "o favorecido")}.`, body: "O comprovante está no extrato." };
    case "transfer_failed":
      return { title: `Falha na transferência de ${value}.`, body: "O valor foi estornado ao seu saldo." };
    case "bill_paid":
      return { title: "Boleto pago com sucesso!", body: `Pagamento de ${value} compensado.` };
    case "bill_failed":
      return { title: "Falha no pagamento de conta.", body: "O saldo foi liberado." };
    case "account_approved":
      return { title: "Sua conta bancária foi aprovada! 🎉", body: "Você já pode enviar e receber Pix." };
    case "account_rejected":
      return {
        title: "Atenção aos seus documentos",
        body: data.reason ? `Refaça o envio para ativar sua conta. Motivo: ${data.reason.slice(0, 180)}` : "Refaça o envio para ativar sua conta.",
      };
    case "onboarding_pending":
      return { title: "Falta um passo para liberar sua conta", body: "Abra a aba PRX BANK e envie o documento e a selfie pelo link seguro." };
  }
}
