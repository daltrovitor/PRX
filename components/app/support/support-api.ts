// Hello World
import type { SupportTicket } from "@/lib/support/types";

/** Chamadas do SAC no app. Erro vira Error com a frase da API (já pronta para a tela). */

export const supportWhen = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

export async function fetchSupport(): Promise<{ available: boolean; tickets: SupportTicket[] }> {
  const res = await fetch("/api/support", { cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as { available?: boolean; tickets?: SupportTicket[]; error?: string };
  if (!res.ok || !json.tickets) throw new Error(json.error || "Não foi possível carregar o atendimento.");
  return { available: json.available !== false, tickets: json.tickets };
}

type Action =
  | { action: "open"; ticket: { topic: string; subject: string; message: string } }
  | { action: "reply"; id: string; message: string }
  | { action: "resolve"; id: string };

export async function sendSupport(body: Action): Promise<SupportTicket> {
  let res: Response;
  try {
    res = await fetch("/api/support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Sem internet agora. Confira sua conexão e tente de novo.");
  }
  const json = (await res.json().catch(() => ({}))) as { ticket?: SupportTicket; error?: string };
  if (!res.ok || !json.ticket) throw new Error(json.error || "Não foi possível enviar.");
  return json.ticket;
}
