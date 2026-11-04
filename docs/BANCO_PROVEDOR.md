# Ligando um novo banco parceiro (BaaS) e provedor de pagamentos

Em 04/11/2026 a integração com o Asaas (banco e cobranças) e a conferência de CPF no Serpro foram removidas. Este guia lista o que ficou pronto para reaproveitar e o que o provedor novo precisa implementar. Enquanto não houver provedor, o app roda assim:

- **PRX BANK**: a conta existe, em ativação, e a abertura (KYC) fica em análise pela PRX. Sem sandbox, nada movimenta dinheiro.
- **Ingressos e assinaturas**: a compra online responde "Pagamento online indisponível agora" (503). Reservas sem valor a pagar e ingressos de teste seguem normais.
- **Cadastro**: CPF e nascimento são autodeclarados. Só o KYC aprovado marca a data de nascimento como verificada.

## O que já está pronto

| Peça | Onde | Observação |
| --- | --- | --- |
| Domínio do banco (conta, chaves Pix, extrato local, sandbox) | `lib/bank/repository.ts`, `lib/bank/service.ts` | Independe de provedor. |
| Etapas da abertura | `lib/bank/activation.ts` (+ teste) | `bankOnline` e `provider` entram quando houver provedor. |
| Abertura (KYC) com análise da PRX, selfie, reenvio por documento | `lib/kyc/*`, `app/api/bank/kyc`, `app/api/admin/bank/identity` | A aprovação da identidade é o gatilho para abrir a conta no banco (comentário em `lib/kyc/service.ts`). |
| Liberação +29 anos | `lib/bank/access.ts`, `app/api/admin/bank/access` | |
| PDF único a partir de fotos/PDFs | `lib/kyc/document-file.ts` (+ teste) | Para enviar documentos ao banco. |
| Confirmação de saída de dinheiro (biometria ou senha) | `lib/bank/confirmation.ts` | Usada pela rota de saída. |
| Limite noturno de Pix (BCB 142/2021) | `lib/bank/limits.ts` (+ teste) | |
| Avisos do PRX BANK (sino, toast, push) | `lib/bank/notifications.ts` (+ teste), `lib/bank/messages.ts` | Tabela `bank_notifications`. |
| Cifra de chaves de API, log estruturado, máscara de dados pessoais | `lib/bank/secrets.ts`, `lib/bank/log.ts`, `lib/bank/sanitize.ts` (+ teste) | O build apaga `console.*`; `bankLog` escreve direto em stdout/stderr. |
| Webhook de Pix liquidado (HMAC) | `app/api/bank/webhooks/pix`, `lib/bank/pix-events.ts` | Compras em parceiros (coins e XP). |
| Telas do app | `components/app/bank/*`, `components/app/screens/bank-screen.tsx` | Mostram a etapa decidida pelo servidor. |
| Cobranças de ingressos e assinaturas | `lib/checkout/*`, `lib/subscriptions/*`, `lib/billing/*` | Só falam com a interface `PaymentGateway`. |
| Comportamentos verificáveis | `lib/behaviors/*` | Só falam com `EvaluationDeps`. |

## O que o provedor novo implementa

### 1. Pagamentos (ingressos e assinaturas)

1. Implemente `PaymentGateway` (`lib/billing/gateway.ts`): cliente, cobrança, assinatura, estorno e QR Pix.
2. Devolva o adaptador em `getPaymentGateway()` (hoje devolve `null`).
3. Crie a rota de webhook do provedor: valide a autenticação dele, normalize o evento (status no vocabulário `PAID_STATUSES` / `REVERSED_STATUSES`, `externalReference` `ord:<pedido>` ou `sub:<id>`) e chame `dispatchBillingEvent` (`lib/billing/webhook.ts`).
4. Para testar, use `fakeGateway` (`lib/billing/__tests__/fake-gateway.ts`).

As colunas `asaas_payment_id`, `asaas_subscription_id` (`live_orders`, `member_subscriptions`, `subscription_payments`) e `asaas_customer_id` (`billing_customers`) guardam o id no provedor; o nome é histórico. O código TypeScript usa `gatewayPaymentId` / `gatewaySubscriptionId` e mapeia para elas. Renomeie por migração só junto com o deploy do código que usa o novo nome.

### 2. Banco (conta, Pix, extrato)

1. Em `accountView` (`lib/bank/service.ts`), devolva o `BankProviderView` do membro (estado da conta, saldo, chaves oficiais) e passe `bankOnline: true` a `bankActivation`.
2. Ligue a abertura da conta ao gatilho da aprovação de identidade (`lib/kyc/service.ts`, `reviewBankKyc`).
3. Recrie as rotas que o app já chama e hoje não existem:
   - `GET/POST /api/bank/accounts` (abrir conta, consultar aprovação);
   - `GET/POST /api/bank/accounts/documents` (documentos que o banco pede);
   - `GET /api/bank/statement` e `GET /api/bank/balance` (extrato e saldo oficiais);
   - `POST /api/bank/outgoing` (Pix e contas: preparar, confirmar com `lib/bank/confirmation.ts`, executar).
4. Webhooks do banco: grave avisos em `getBankNotificationStore()` e, para Pix enviado, reaproveite `handlePixSettled`.
5. Defina `BANK_ENVIRONMENT=production` na produção: desliga o sandbox e só considera ativa a conta ligada ao banco parceiro (`providerAccountId`).

### 3. Comportamentos verificáveis

Implemente `EvaluationDeps` (`lib/behaviors/service.ts`): `listAccounts` (contas PRX BANK e desde quando estão ativas) e `listPayments` (Pix e contas pagos no período). Devolva em `evaluationDeps()` (hoje `null`: as regras ficam "não verificável").

### 4. Cron

`/api/cron/bank-maintenance` (diário, `vercel.json`) faz a retenção de documentos de aberturas recusadas e avalia os comportamentos. A conciliação com o banco entra aqui.

## Dados que ficaram no Supabase

As migrações antigas continuam no repositório e as tabelas não foram apagadas (têm histórico de contas, avisos e pedidos): `bank_subaccounts`, `bank_subaccount_vault`, `bank_webhooks_log`, `bank_outgoing_requests`, `bank_provisioning_log`, `asaas_api_requests`, `cpf_verification_log`. Nada no código as usa mais. Quando o provedor novo estiver no ar, decida o que migrar e o que descartar (por migração própria).

## Variáveis de ambiente

Deixaram de ser lidas: `ASAAS_*`, `SERPRO_CPF_*` e `BANK_PROVIDER=asaas`. Podem ser removidas da Vercel. Continuam valendo: `BANK_ENCRYPTION_KEY`, `BANK_ENVIRONMENT`, `BANK_PROVIDER=sandbox` e `PRX_BAAS_MODE=sandbox` (só fora da produção), `PRX_BAAS_WEBHOOK_SECRET` e `CRON_SECRET`.
