// Hello World
import type { AuditRecord } from "@/lib/asaas/audit";
import { operationByName } from "@/lib/asaas/operations";

/**
 * Leitura de uma chamada ao Asaas para o painel admin: o que a PRX tentou, o
 * que o Asaas respondeu, o que isso quer dizer pela documentação e o que fazer.
 * A causa vem marcada: "confirmado" quando é o próprio registro que diz (ex.:
 * a PRX nem enviou, o Asaas não respondeu); "hipótese" quando é uma leitura
 * provável do código ou da mensagem de erro.
 */

export type HttpState = "ok" | "erro" | "sem resposta" | "não enviado" | "em andamento";

export interface Diagnosis {
  attempt: string;
  endpoint: string;
  answer: string;
  meaning: string;
  httpState: HttpState;
  cause: { text: string; certainty: "confirmado" | "hipótese" } | null;
  next: string | null;
  doc: string | null;
}

const HTTP_STATE: Record<AuditRecord["outcome"], HttpState> = {
  pending: "em andamento",
  success: "ok",
  http_error: "erro",
  rate_limited: "erro",
  timeout: "sem resposta",
  network_error: "sem resposta",
  invalid_response: "erro",
  not_sent: "não enviado",
};

const hypothesis = (text: string) => ({ text, certainty: "hipótese" as const });
const confirmed = (text: string) => ({ text, certainty: "confirmado" as const });

function causeOf400(record: AuditRecord): Diagnosis["cause"] {
  const text = `${record.errorCode ?? ""} ${record.errorDescription ?? ""}`.toLowerCase();
  if (record.operation === "account.create") {
    if (/cep|postal/.test(text)) return hypothesis("O Asaas não localizou o CEP do cadastro (ele usa o CEP para achar a cidade).");
    if (/e-?mail/.test(text)) return hypothesis("E-mail já usado em outra conta do Asaas ou inválido.");
    if (/cpf|cnpj/.test(text)) return hypothesis("CPF inválido para a Receita ou já ligado a outra conta.");
    if (/limite|subconta|avalia/.test(text)) return hypothesis("Limite do período de avaliação regulatória (até 10 subcontas e 60 dias em produção) ou BaaS não habilitado: fale com o gerente de contas do Asaas.");
    if (/renda|income/.test(text)) return hypothesis("Renda/faturamento (incomeValue) ausente ou fora do aceito.");
  }
  if (record.operation === "pix.keys.create") return hypothesis("Chave Pix só com a conta aprovada e a prova de vida feita; 1 minuto entre criações; até 5 chaves (pessoa física).");
  if (record.operation === "documents.upload") {
    // "Esse tipo de documento não pode ser enviado via API": o canal, não o arquivo (a PRX já manda JPEG ou PDF).
    if (/via api/.test(text)) {
      return hypothesis(
        "O Asaas não aceita este tipo de documento pela API nesta conta. Se o grupo não traz onboardingUrl, o envio de documentos por API (BaaS) provavelmente não está liberado na conta-pai: confirme com o gerente de contas do Asaas."
      );
    }
    return hypothesis("Grupo que exige o link seguro (onboardingUrl), arquivo em formato não aceito ou grupo já resolvido.");
  }
  if (record.operation === "transfers.create" || record.operation === "pix.qr.pay" || record.operation === "bill.create") return hypothesis("Recusa de negócio do Asaas (saldo, limite, chave/código inválido ou validação de saque). A mensagem acima é a do Asaas.");
  return hypothesis("Dados recusados pelo Asaas; a descrição do erro acima diz qual campo.");
}

function causeOf(record: AuditRecord): Diagnosis["cause"] {
  const op = operationByName(record.operation);
  switch (record.outcome) {
    case "success":
    case "pending":
      return null;
    case "not_sent":
      return confirmed(`A PRX não chamou o Asaas: ${record.errorDescription ?? "regra ou configuração"}`);
    case "timeout":
    case "network_error":
      return op?.sensitive && record.method !== "GET"
        ? confirmed("O Asaas não respondeu. A operação PODE ter sido processada do lado dele: o resultado é desconhecido até a conciliação.")
        : confirmed("O Asaas não respondeu (tempo esgotado ou rede).");
    case "invalid_response":
      return confirmed(`O Asaas respondeu ${record.httpStatus ?? "2xx"}, mas num formato que a PRX não reconheceu (${record.errorDescription ?? "formato"}).${record.method !== "GET" ? " A operação provavelmente aconteceu no Asaas." : ""}`);
    case "rate_limited":
      return confirmed("Limite de requisições do Asaas atingido (429), mesmo depois das novas tentativas.");
    case "http_error":
      break;
  }
  const status = record.httpStatus ?? 0;
  if (status === 401) return hypothesis(record.auth === "subaccount" ? "Chave da subconta recusada (inválida, expirada por falta de uso ou removida). Gere uma nova chave." : "Chave da conta-pai recusada: confira ASAAS_API_KEY e se é do mesmo ambiente.");
  if (status === 403) return hypothesis(record.operation === "account.accessToken.create" ? "Gerenciamento de chaves de subcontas não liberado no painel do Asaas (vale 2 h) ou IP fora da whitelist." : "Acesso negado pelo Asaas (permissão da conta ou recurso não habilitado).");
  if (status === 404) return hypothesis("O recurso não existe (id antigo, de outro ambiente ou de outra subconta).");
  if (status === 400 || status === 422) return causeOf400(record);
  if (status >= 500) return hypothesis("Instabilidade do lado do Asaas.");
  return null;
}

function nextStep(record: AuditRecord): string | null {
  const unanswered = record.outcome === "timeout" || record.outcome === "network_error" || record.outcome === "invalid_response";
  if (record.operation === "account.create") {
    if (record.outcome === "success") return "Aguardar 15 s, enviar os documentos (link seguro ou API) e acompanhar os eventos ACCOUNT_STATUS_*. A conta só movimenta dinheiro com general = APPROVED.";
    if (unanswered) return "Não criar de novo: a próxima tentativa (ou “Procurar pelo CPF” no admin) acha a subconta no Asaas e religa ao membro.";
  }
  if (["transfers.create", "pix.qr.pay", "bill.create"].includes(record.operation)) {
    if (record.outcome === "success") return "Aguardar o desfecho (webhook) ou usar Conciliar, que consulta o estado no Asaas.";
    if (unanswered) return "Nunca repetir a operação: usar Conciliar, que procura pelo id ou pelo externalReference antes de qualquer decisão.";
  }
  if (record.operation === "documents.list" && record.outcome === "success") return "Grupos com link seguro: o membro envia pelo link (documento e selfie). Sem link: a PRX envia pela API.";
  if (record.outcome === "http_error" && record.httpStatus === 401 && record.auth === "subaccount") return "Gerar nova chave da subconta (Admin → Asaas → membro).";
  return null;
}

export function diagnose(record: AuditRecord): Diagnosis {
  const op = operationByName(record.operation);
  const answer =
    record.outcome === "not_sent"
      ? "Nada foi enviado ao Asaas."
      : record.responseReceived
        ? `HTTP ${record.httpStatus}${record.errorCode ? ` · ${record.errorCode}` : ""}${record.errorDescription ? ` · ${record.errorDescription}` : ""}`
        : record.outcome === "pending"
          ? "Ainda sem resposta registrada (em andamento ou o processo foi interrompido)."
          : "Sem resposta do Asaas.";
  return {
    attempt: op?.intent ?? `Chamada ${record.method} ${record.path}.`,
    endpoint: `${record.method} /v3${record.path}`,
    answer,
    meaning: record.outcome === "success" ? (op?.successMeaning ?? "Resposta de sucesso.") : HTTP_STATE[record.outcome] === "sem resposta" ? "Sem resposta não é recusa: o resultado é desconhecido." : "A operação não foi concluída por este pedido.",
    httpState: HTTP_STATE[record.outcome],
    cause: causeOf(record),
    next: nextStep(record),
    doc: op?.doc ?? null,
  };
}
