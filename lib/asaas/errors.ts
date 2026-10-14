// Hello World
import { PartnerError } from "@/lib/partners/errors";
import { TechnicalError } from "@/lib/error-messages";

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
 * Recusas do Asaas que a pessoa resolve na própria tela, em frase simples. A
 * descrição do Asaas nunca vai para a tela: o que não está aqui é técnico.
 */
const USER_FIXABLE: ReadonlyArray<readonly [RegExp, string]> = [
  [/saldo/i, "Saldo insuficiente para esta operação."],
  [/chave pix|chave (informada |de destino )?(não encontrada|inexistente|inválida)/i, "Não encontramos essa chave Pix. Confira e tente de novo."],
  [/qr ?code|copia e cola|br ?code|payload/i, "Esse código Pix não vale mais ou está errado. Peça um novo para quem vai receber."],
  [/linha digitável|código de barras|boleto/i, "Não conseguimos ler esse boleto. Confira o código e tente de novo."],
  [/limite/i, "Essa operação passa do seu limite. Tente um valor menor."],
  [/\bcep\b|postal/i, "Não encontramos esse CEP. Confira e tente de novo."],
];

/**
 * Converte um erro do Asaas no erro que as rotas do PRX respondem. Recusa que a
 * pessoa resolve vira frase simples (PartnerError); resultado incerto pede para
 * conferir o extrato antes de repetir (dinheiro); o resto é técnico: a tela
 * mostra "Deu um erro ao fazer isso" com código e o motivo fica nos logs.
 */
export function toPartnerError(error: unknown, fallback = "Não foi possível concluir a operação agora."): PartnerError | TechnicalError {
  if (error instanceof PartnerError || error instanceof TechnicalError) return error;
  if (!(error instanceof AsaasError)) return new TechnicalError(`${fallback} ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`);
  if (error.ambiguous) return new PartnerError("Não tivemos a confirmação a tempo. Confira o extrato antes de tentar de novo.", 409);
  if (error.status === 429) return new PartnerError("Muitas operações seguidas. Espere alguns segundos e tente de novo.", 429);
  if (error.status === 400 || error.status === 422) {
    const fixable = USER_FIXABLE.find(([pattern]) => pattern.test(error.message));
    if (fixable) return new PartnerError(fixable[1], 422);
  }
  return new TechnicalError(`Asaas ${error.status}${error.code ? ` ${error.code}` : ""}: ${error.message} (${fallback})`, error.status >= 500 ? 502 : 500);
}
