// Hello World

/**
 * Textos de erro da PRX, iguais no servidor e nas telas. Regra:
 *   - erro que a pessoa resolve na própria tela: frase simples dizendo o que fazer;
 *   - erro técnico (ela não tem como resolver): "Deu um erro ao fazer isso" com um
 *     código, que o suporte usa para achar o detalhe (logs e app_incidents).
 * O motivo técnico nunca aparece na tela.
 */

export const OFFLINE_MESSAGE = "Sem internet agora. Confira sua conexão e tente de novo.";

export function technicalErrorMessage(code: string): string {
  return `Deu um erro ao fazer isso. Fale com o suporte e informe o código ${code}.`;
}

/** Mensagem padrão do zod (em inglês): só aparece quando o app manda dado errado, nunca por culpa da pessoa. */
const ZOD_DEFAULT = /^(Invalid|Expected|Too (small|big)|Unrecognized|Required)\b|\b(expected|received)\b/;

/**
 * Frase de validação para a tela. As nossas (em português) a pessoa resolve; a
 * padrão do zod vira erro técnico, com código, e o campo vai para o registro.
 */
export function userValidationMessage(issue: { message: string; path?: ReadonlyArray<PropertyKey> } | undefined): string {
  const message = issue?.message ?? "";
  if (!message || ZOD_DEFAULT.test(message)) {
    throw new TechnicalError(`Validação sem frase para a tela em "${(issue?.path ?? []).map(String).join(".")}": ${message || "sem mensagem"}`, 400);
  }
  return message;
}

/**
 * Erro técnico: o `detail` vai só para os logs (nunca para a tela). As rotas
 * transformam em "Deu um erro ao fazer isso" com código (lib/incidents.ts).
 */
export class TechnicalError extends Error {
  constructor(
    readonly detail: string,
    readonly status: 400 | 409 | 500 | 502 | 503 = 500
  ) {
    super(detail);
    this.name = "TechnicalError";
  }
}
