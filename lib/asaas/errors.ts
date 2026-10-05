// Hello World
import { PartnerError } from "@/lib/partners/errors";

/** Item do array `errors` que o Asaas devolve em toda resposta de erro. */
export interface AsaasErrorItem {
  code: string;
  description: string;
}

/**
 * Erro normalizado do Asaas. `ambiguous` marca falhas em que não dá para saber
 * se a operação foi processada (timeout, queda de rede ou 5xx num POST): quem
 * chamou não pode repetir às cegas, e sim conciliar pelo webhook ou consulta.
 */
export class AsaasError extends Error {
  constructor(
    readonly status: number,
    readonly errors: AsaasErrorItem[],
    readonly ambiguous = false
  ) {
    super(errors.map((e) => e.description).filter(Boolean).join(" ") || `Asaas respondeu ${status}.`);
    this.name = "AsaasError";
  }

  get code(): string | null {
    return this.errors[0]?.code ?? null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Extrai `errors: [{ code, description }]` de qualquer corpo, tolerando formatos inesperados. */
export function parseErrorItems(body: unknown): AsaasErrorItem[] {
  if (!isRecord(body) || !Array.isArray(body.errors)) return [];
  return body.errors.filter(isRecord).map((item) => ({
    code: typeof item.code === "string" ? item.code : "unknown",
    description: typeof item.description === "string" ? item.description.slice(0, 500) : "",
  }));
}

/** O membro não vê o nome do parceiro: textos que vêm do provedor trocam o nome por "banco parceiro". */
export function hideProviderName(text: string): string {
  return text.replace(/\basaas(?:\s+gest[aã]o\s+financeira(?:\s+institui[cç][aã]o\s+de\s+pagamento(?:\s+s\.?a\.?)?)?)?/gi, "PRX BANK");
}

/**
 * Converte um erro do Asaas no erro de regra que as rotas do PRX já sabem
 * responder. Recusas de negócio (400) chegam ao membro com a descrição do
 * Asaas; falha de credencial ou do provedor vira 503 genérico, sem detalhes.
 */
export function toPartnerError(error: unknown, fallback = "Não foi possível concluir a operação agora."): PartnerError {
  if (error instanceof PartnerError) return error;
  if (!(error instanceof AsaasError)) return new PartnerError(fallback, 500);
  if (error.ambiguous) return new PartnerError("A operação demorou para responder. Confira o extrato antes de tentar de novo.", 503);
  if (error.status === 400) return new PartnerError(hideProviderName(error.message) || fallback, 422);
  if (error.status === 404) return new PartnerError("Registro não encontrado.", 404);
  if (error.status === 429) return new PartnerError("Muitas operações em sequência. Aguarde alguns segundos.", 429);
  if (error.status === 401 || error.status === 403) console.warn("[asaas] credencial recusada:", error.status, error.code);
  return new PartnerError("O PRX BANK está indisponível no momento. Tente de novo em instantes.", 503);
}
