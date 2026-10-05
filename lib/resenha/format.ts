// Hello World

/** "sábado, 14 de novembro, 23:00" em horário de Brasília (a festa é no fuso do local, não no do servidor). */
export function formatPartyDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

/** "14/11 23:00": hora do pedido na lista do Insider. */
export function formatShort(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Só a primeira letra maiúscula (o `capitalize` do CSS põe maiúscula em todas as palavras: "19 De Outubro Às"). */
export const sentence = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
