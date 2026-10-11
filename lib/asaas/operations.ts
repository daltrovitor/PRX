// Hello World

/**
 * Catálogo das chamadas que o PRX faz ao Asaas: nome lógico, o que a chamada
 * pede e o que um sucesso HTTP significa (e não significa) para o negócio.
 * Fonte: https://docs.asaas.com (referências citadas em `doc`). Sem dependência
 * de servidor: o painel admin usa o mesmo texto.
 */

export interface AsaasOperation {
  name: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  /** Caminho relativo a /v3, com {id} no lugar dos identificadores. */
  template: string;
  label: string;
  /** O que o PRX tentou fazer. */
  intent: string;
  /** O que uma resposta 200 quer dizer segundo a documentação. */
  successMeaning: string;
  /** Pode mover dinheiro ou criar cadastro: um resultado incerto nunca é repetido às cegas. */
  sensitive: boolean;
  doc: string;
}

const REF = "https://docs.asaas.com/reference/";

export const ASAAS_OPERATIONS: readonly AsaasOperation[] = [
  { name: "account.create", method: "POST", template: "/accounts", label: "Criar subconta", intent: "Abrir a conta de pagamento do membro (subconta BaaS) com os dados do cadastro e o webhook do PRX.", successMeaning: "A subconta foi criada. Ela ainda NÃO está aprovada: falta o envio dos documentos e a análise do Asaas (até 48 h). A aprovação chega pelo evento ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED.", sensitive: true, doc: `${REF}criar-subconta` },
  { name: "account.find", method: "GET", template: "/accounts", label: "Procurar subconta", intent: "Procurar, pelo CPF, uma subconta já criada (para não abrir outra quando uma resposta anterior se perdeu).", successMeaning: "Lista das subcontas da conta-pai com o filtro informado. Lista vazia: nenhuma subconta com esse CPF.", sensitive: false, doc: `${REF}listar-subcontas` },
  { name: "account.accessToken.create", method: "POST", template: "/accounts/{id}/accessTokens", label: "Gerar chave da subconta", intent: "Gerar uma nova chave de API para uma subconta cuja chave se perdeu.", successMeaning: "Nova chave criada (ela só aparece nesta resposta). Exige o gerenciamento de chaves liberado no painel do Asaas por 2 h e o IP do servidor na whitelist.", sensitive: true, doc: `${REF}criar-chave-de-api-para-uma-subconta` },
  { name: "account.status", method: "GET", template: "/myAccount/status", label: "Situação cadastral", intent: "Consultar a situação da subconta: dados comerciais, conta bancária, documentação e aprovação geral.", successMeaning: "A conta só está aprovada quando general = APPROVED. PENDING ou AWAITING_APPROVAL: ainda em análise ou com pendência.", sensitive: false, doc: `${REF}consultar-situacao-cadastral-da-conta` },
  { name: "documents.list", method: "GET", template: "/myAccount/documents", label: "Documentos pendentes", intent: "Listar os documentos que o Asaas pede para aprovar a subconta e como enviar cada um.", successMeaning: "Grupo com onboardingUrl: o titular envia pelo link do Asaas (documento e selfie). Sem link: o PRX envia pela API. Consultar antes de 15 s da criação pode trazer pedidos que deixam de valer.", sensitive: false, doc: `${REF}verificar-documentos-pendentes` },
  { name: "documents.upload", method: "POST", template: "/myAccount/documents/{id}", label: "Enviar documento", intent: "Enviar um arquivo para um grupo de documentos da subconta.", successMeaning: "Arquivo recebido para análise. Cada grupo aceita um arquivo por vez: um novo envio substitui o anterior.", sensitive: false, doc: `${REF}enviar-documentos` },
  { name: "sandbox.approve", method: "POST", template: "/sandbox/myAccount/approve", label: "Aprovar conta (sandbox)", intent: "Simular a aprovação cadastral no sandbox.", successMeaning: "Só existe no sandbox; não representa aprovação em produção.", sensitive: false, doc: `${REF}aprovar-conta` },
  { name: "webhooks.list", method: "GET", template: "/webhooks", label: "Webhooks da subconta", intent: "Ler a configuração do webhook da subconta (eventos, fila interrompida, penalizações).", successMeaning: "Configuração atual. interrupted = true: o Asaas parou de enviar eventos até a fila ser reativada.", sensitive: false, doc: `${REF}listar-webhooks` },
  { name: "webhooks.create", method: "POST", template: "/webhooks", label: "Criar webhook", intent: "Registrar o webhook do PRX na subconta.", successMeaning: "Webhook criado; os próximos eventos seguem para a URL informada.", sensitive: false, doc: `${REF}criar-novo-webhook` },
  { name: "webhooks.update", method: "PUT", template: "/webhooks/{id}", label: "Atualizar webhook", intent: "Atualizar eventos, token e fila do webhook da subconta.", successMeaning: "Configuração salva. Com interrupted = false, os eventos parados voltam a ser enviados.", sensitive: false, doc: `${REF}atualizar-webhook-existente` },
  { name: "pix.keys.list", method: "GET", template: "/pix/addressKeys", label: "Listar chaves Pix", intent: "Listar as chaves Pix da subconta e o estado de cada uma.", successMeaning: "Só a chave ACTIVE recebe Pix. AWAITING_ACTIVATION ainda está sendo registrada no DICT.", sensitive: false, doc: `${REF}listar-chaves` },
  { name: "pix.keys.create", method: "POST", template: "/pix/addressKeys", label: "Criar chave Pix", intent: "Criar uma chave aleatória (EVP) na subconta.", successMeaning: "Pedido aceito; a chave pode nascer AWAITING_ACTIVATION. Exige conta aprovada e prova de vida; 1 min entre criações; até 5 chaves (PF).", sensitive: false, doc: `${REF}criar-uma-chave` },
  { name: "pix.keys.delete", method: "DELETE", template: "/pix/addressKeys/{id}", label: "Excluir chave Pix", intent: "Excluir uma chave Pix da subconta.", successMeaning: "Exclusão pedida; a chave passa por AWAITING_DELETION antes de DELETED.", sensitive: false, doc: `${REF}remover-chave` },
  { name: "customers.create", method: "POST", template: "/customers", label: "Criar cliente", intent: "Criar o cliente que representa o titular nas cobranças Pix.", successMeaning: "Cliente criado na subconta.", sensitive: false, doc: `${REF}criar-novo-cliente` },
  { name: "customers.get", method: "GET", template: "/customers/{id}", label: "Consultar cliente", intent: "Ler o nome de quem pagou um Pix.", successMeaning: "Dados do cliente.", sensitive: false, doc: `${REF}recuperar-um-unico-cliente` },
  { name: "payments.create", method: "POST", template: "/payments", label: "Criar cobrança Pix", intent: "Gerar uma cobrança Pix (depósito ou cobrar alguém).", successMeaning: "Cobrança criada, ainda não paga. O pagamento chega pelo evento PAYMENT_RECEIVED.", sensitive: false, doc: `${REF}criar-nova-cobranca` },
  { name: "payments.qrcode", method: "GET", template: "/payments/{id}/pixQrCode", label: "QR Code da cobrança", intent: "Obter o QR Code e o Copia e Cola da cobrança.", successMeaning: "QR Code gerado.", sensitive: false, doc: `${REF}obter-qr-code-para-pagamentos-via-pix` },
  { name: "payments.receiveInCash", method: "POST", template: "/payments/{id}/receiveInCash", label: "Baixa manual (sandbox)", intent: "Confirmar uma cobrança de teste no sandbox.", successMeaning: "Cobrança marcada como recebida em dinheiro.", sensitive: true, doc: `${REF}confirmar-recebimento-em-dinheiro` },
  { name: "transfers.create", method: "POST", template: "/transfers", label: "Enviar Pix por chave", intent: "Transferir saldo da subconta para uma chave Pix.", successMeaning: "Transferência criada, NÃO concluída. O resultado chega por TRANSFER_DONE / TRANSFER_FAILED / TRANSFER_CANCELLED.", sensitive: true, doc: `${REF}transferir-para-conta-de-outra-instituicao-ou-chave-pix` },
  { name: "transfers.get", method: "GET", template: "/transfers/{id}", label: "Consultar transferência", intent: "Conferir o estado atual de uma transferência (conciliação).", successMeaning: "Estados: PENDING, BANK_PROCESSING, DONE, FAILED, CANCELLED.", sensitive: false, doc: `${REF}recuperar-uma-unica-transferencia` },
  { name: "transfers.list", method: "GET", template: "/transfers", label: "Listar transferências", intent: "Procurar uma transferência cujo id se perdeu (resposta que não chegou), pelo externalReference.", successMeaning: "Transferências do período.", sensitive: false, doc: `${REF}listar-transferencias` },
  { name: "pix.qr.decode", method: "POST", template: "/pix/qrCodes/decode", label: "Ler QR Code Pix", intent: "Ler valor e recebedor de um Pix Copia e Cola antes de pagar.", successMeaning: "Dados do QR Code; nada foi pago.", sensitive: false, doc: `${REF}decodificar-um-qrcode-para-pagamento` },
  { name: "pix.qr.pay", method: "POST", template: "/pix/qrCodes/pay", label: "Pagar QR Code Pix", intent: "Pagar um Pix Copia e Cola com o saldo da subconta.", successMeaning: "Transação criada, NÃO concluída: o estado final vem em GET /pix/transactions/{id} ou pelos eventos.", sensitive: true, doc: `${REF}pagar-um-qrcode` },
  { name: "pix.transactions.get", method: "GET", template: "/pix/transactions/{id}", label: "Consultar transação Pix", intent: "Conferir o estado de um pagamento de QR Code (conciliação).", successMeaning: "DONE concluída; REFUSED ou CANCELLED não saiu; os demais estados ainda estão em processamento.", sensitive: false, doc: `${REF}recuperar-uma-unica-transacao` },
  { name: "bill.simulate", method: "POST", template: "/bill/simulate", label: "Simular pagamento de conta", intent: "Ler valor, vencimento e taxa de um boleto antes de pagar.", successMeaning: "Simulação; nada foi pago.", sensitive: false, doc: `${REF}simular-um-pagamento-de-conta` },
  { name: "bill.create", method: "POST", template: "/bill", label: "Pagar conta", intent: "Pagar um boleto com o saldo da subconta.", successMeaning: "Pagamento criado, NÃO concluído. O resultado chega por BILL_PAID / BILL_FAILED.", sensitive: true, doc: `${REF}criar-um-pagamento-de-conta` },
  { name: "bill.get", method: "GET", template: "/bill/{id}", label: "Consultar pagamento de conta", intent: "Conferir o estado de um pagamento de conta (conciliação).", successMeaning: "Estados: PENDING, BANK_PROCESSING, PAID, FAILED, CANCELLED, REFUNDED.", sensitive: false, doc: `${REF}recuperar-um-unico-pagamento-de-conta` },
  { name: "finance.balance", method: "GET", template: "/finance/balance", label: "Saldo", intent: "Consultar o saldo da conta.", successMeaning: "Saldo disponível no Asaas (fonte oficial).", sensitive: false, doc: `${REF}recuperar-saldo-da-conta` },
  { name: "finance.statement", method: "GET", template: "/financialTransactions", label: "Extrato", intent: "Ler o extrato oficial da subconta.", successMeaning: "Lançamentos do período.", sensitive: false, doc: `${REF}recuperar-extrato` },
];

const compiled = ASAAS_OPERATIONS.map((op) => ({
  op,
  regex: new RegExp(`^${op.template.replace(/\{id\}/g, "[^/]+")}/?$`),
}));

/** Operação pelo método e caminho (sem query). Desconhecida vira "outra" com o próprio caminho. */
export function findOperation(method: string, path: string): AsaasOperation | null {
  const clean = path.split("?")[0];
  return compiled.find((c) => c.op.method === method.toUpperCase() && c.regex.test(clean))?.op ?? null;
}

export function operationName(method: string, path: string): string {
  return findOperation(method, path)?.name ?? `${method.toUpperCase()} ${path.split("?")[0].replace(/\/[A-Za-z0-9_-]{8,}(?=\/|$)/g, "/{id}")}`;
}

export function operationByName(name: string): AsaasOperation | null {
  return ASAAS_OPERATIONS.find((op) => op.name === name) ?? null;
}
