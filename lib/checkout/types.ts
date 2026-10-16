// Hello World
import type { AppliedDiscount, CheckoutMethod } from "@/lib/live/promo";

/** Pedido do checkout (tipos e rótulos, sem acesso ao banco: servem também às telas). */

export const ORDER_STATUSES = ["awaiting_payment", "paid", "paid_needs_review", "cancelled", "expired", "refunded"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  awaiting_payment: "Aguardando pagamento",
  paid: "Pago",
  paid_needs_review: "Pago, precisa de revisão",
  cancelled: "Cancelado",
  expired: "Expirado",
  refunded: "Estornado",
};

export interface LiveOrder {
  id: string;
  userId: string;
  ticketId: string;
  eventId: string;
  paymentMethod: CheckoutMethod;
  amountOriginal: number;
  discountTotal: number;
  amountTotal: number;
  discounts: AppliedDiscount[];
  status: OrderStatus;
  environment: "sandbox" | "production";
  asaasPaymentId: string | null;
  invoiceUrl: string | null;
  paidAt: string | null;
  reviewNote: string;
  createdAt: string;
  updatedAt: string;
}
