// Hello World
import { ageRatingLabel } from "@/lib/live/age";
import type { LiveEvent } from "@/lib/live/types";

/**
 * Prontidão de um evento (função pura). "Publicável" exige os dados que o
 * comprador precisa ver antes de pagar; "pronto para operar" exige também o
 * teste de portaria feito com um ingresso de teste (entrada + bloqueio da
 * segunda leitura). Nada aqui inventa valor: o que falta aparece como pendência.
 */

export interface ReadinessItem {
  key: string;
  label: string;
  ok: boolean;
  /** Bloqueia a publicação quando não está ok. */
  blocking: boolean;
  detail: string;
}

export interface EventReadiness {
  items: ReadinessItem[];
  publishable: boolean;
  operational: boolean;
  missing: string[];
}

type ReadinessEvent = Pick<
  LiveEvent,
  | "venue"
  | "city"
  | "address"
  | "capacity"
  | "minAge"
  | "idCheckRequired"
  | "organizerName"
  | "cancellationPolicy"
  | "batches"
  | "staffCheckin"
  | "partnerId"
  | "status"
  | "doorTestVerifiedAt"
>;

export function eventReadiness(event: ReadinessEvent): EventReadiness {
  const paid = event.batches.some((b) => b.price > 0);
  const items: ReadinessItem[] = [
    { key: "venue", label: "Local e cidade", ok: event.venue.trim().length >= 2 && event.city.trim().length >= 2, blocking: true, detail: event.venue && event.city ? `${event.venue}, ${event.city}` : "Informe o local e a cidade." },
    { key: "address", label: "Endereço", ok: event.address.trim().length > 0, blocking: false, detail: event.address || "Sem endereço: o comprador vê só o local e a cidade." },
    { key: "age", label: "Classificação etária", ok: event.minAge !== null, blocking: true, detail: event.minAge === null ? "Defina a idade mínima (ou Livre)." : ageRatingLabel(event.minAge) },
    {
      key: "document",
      label: "Documento na portaria",
      ok: event.minAge === null || event.minAge === 0 || event.idCheckRequired,
      blocking: true,
      detail: event.minAge && event.minAge > 0 ? (event.idCheckRequired ? "Documento com foto conferido na entrada." : "Evento com idade mínima precisa exigir documento na entrada.") : "Não exigido.",
    },
    { key: "organizer", label: "Organizador", ok: event.organizerName.trim().length >= 2, blocking: true, detail: event.organizerName || "Informe quem organiza o evento." },
    {
      key: "cancellation",
      label: "Política de cancelamento",
      ok: event.cancellationPolicy.trim().length >= 20,
      blocking: true,
      detail: event.cancellationPolicy ? "Definida." : "Escreva a política de cancelamento e reembolso.",
    },
    {
      key: "batches",
      label: "Lotes e preços",
      ok: event.batches.length > 0,
      blocking: true,
      detail: event.batches.map((b) => `${b.name}: ${b.price === 0 ? "grátis" : b.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`).join(" · ") || "Crie ao menos um lote.",
    },
    { key: "capacity", label: "Lotação", ok: event.capacity !== null, blocking: false, detail: event.capacity === null ? "Sem limite de lotação definido." : `${event.capacity} pessoas` },
    {
      key: "door",
      label: "Quem valida na portaria",
      ok: event.staffCheckin || Boolean(event.partnerId),
      blocking: true,
      detail: event.staffCheckin ? "Equipe PRX" : event.partnerId ? "Parceiro do evento" : "Ninguém pode validar os ingressos.",
    },
  ];
  if (paid) {
    items.push({ key: "payment", label: "Pagamento", ok: true, blocking: false, detail: "Sem pagamento online: a reserva é confirmada pela equipe PRX no admin." });
  }
  const publishable = items.every((i) => i.ok || !i.blocking);
  const doorTested = Boolean(event.doorTestVerifiedAt);
  items.push({
    key: "door-test",
    label: "Teste de portaria",
    ok: doorTested,
    blocking: false,
    detail: doorTested ? "Ingresso de teste validado e segunda leitura bloqueada." : "Emita um ingresso de teste, valide na portaria e leia o mesmo QR de novo.",
  });
  return {
    items,
    publishable,
    operational: publishable && event.status === "published" && doorTested,
    missing: items.filter((i) => !i.ok && i.blocking).map((i) => i.label),
  };
}
