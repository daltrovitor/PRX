<!-- Hello World -->
# PRX BANK × Asaas (BaaS)

O PRX BANK opera contas de pagamento individualizadas como subcontas white label do Asaas: Asaas Gestão Financeira Instituição de Pagamento S.A., Código Bacen 461. O navegador nunca fala com o Asaas. Todas as chamadas saem de `lib/asaas/*`, com a chave da conta mãe ou com a apiKey da subconta, guardada cifrada.

## Ligar em um ambiente

1. Aplique `supabase/migrations/20261001_prx_asaas_baas.sql`.
2. Configure as variáveis (Vercel → Environment Variables):
   - `BANK_PROVIDER=asaas`, `ASAAS_ENVIRONMENT` (`sandbox` ou `production`) e `ASAAS_API_KEY`. A chave precisa ser do mesmo ambiente: `$aact_hmlg_` no sandbox e `$aact_prod_` em produção. Se não for, a integração fica desligada. No `.env.local`, escreva `\$aact_...`, porque o Next expande o `$`.
   - `ASAAS_API_URL` (opcional): só aceita hosts oficiais do Asaas e caminho terminando em `/v3`.
   - `ASAAS_WEBHOOK_AUTH_TOKEN`: 32+ caracteres. É conferido em tempo constante no header `asaas-access-token`.
   - `ASAAS_WEBHOOK_URL_EVENTS` e `ASAAS_WEBHOOK_URL_VALIDATE_WITHDRAW` (ou `NEXT_PUBLIC_APP_URL`; pode ser `https://prx.app.br`, porque o `/api/*` responde em todos os domínios da PRX), mais `ASAAS_WEBHOOK_EMAIL` (ou o e-mail de resposta, `suporte@prx.app.br`; nunca o `noreply`).
   - `BANK_ENCRYPTION_KEY`: 32+ caracteres. Cifra as apiKeys das subcontas (AES-256-GCM). Depois de abrir contas, não troque a chave. O texto cifrado guarda qual chave foi usada.
3. No painel do Asaas, em Integrações → Mecanismos de segurança, ligue a validação de saque apontando para `/api/bank/webhooks/validate-withdraw` com o mesmo token. Em subcontas, confirme com o gerente de contas como a configuração é replicada.

Sem essas condições, o app segue no modo de pré-ativação (ou sandbox em memória no desenvolvimento), sem nenhuma chamada ao Asaas.

### Produção

| Variável | Valor |
|---|---|
| `BANK_PROVIDER` | `asaas` |
| `ASAAS_ENVIRONMENT` | `production` |
| `ASAAS_API_URL` | `https://api.asaas.com/v3` (ou deixe vazia) |
| `ASAAS_API_KEY` | `$aact_prod_...` (na Vercel, sem a barra) |
| `ASAAS_WEBHOOK_AUTH_TOKEN` | novo, 32+ caracteres (`openssl rand -hex 24`) |
| `BANK_ENCRYPTION_KEY` | 32+ caracteres (`openssl rand -base64 48`), definitivo |
| `PRX_BAAS_MODE` | apague |

Com `ASAAS_ENVIRONMENT=production`, o modo sandbox não liga, mesmo que `PRX_BAAS_MODE=sandbox` tenha ficado para trás. O KYC volta a ser obrigatório, a subconta só fica ativa pelo webhook de aprovação do Asaas, o ajuste manual de saldo no admin responde 403 e o checklist de homologação responde 409. Uma chave `$aact_hmlg_` ou uma URL de sandbox com `ASAAS_ENVIRONMENT=production` desliga a integração.

## Fluxo

| Etapa | PRX | Asaas |
|---|---|---|
| KYC | `POST /api/bank/kyc`: regras automáticas (CPF único, idade, documentos da própria pasta) e aprovação na hora, **sem análise do PRX**. Menor espera o responsável aceitar o vínculo | — |
| Abertura | na mesma chamada do KYC (ou na próxima visita ao PRX BANK, se o Asaas falhar). Idempotente, com trava contra conta dupla | `POST /v3/accounts` com webhook + authToken |
| Documentos | frente e verso do KYC seguem sozinhos logo após a abertura; o que faltar, o membro envia em `/api/bank/accounts/documents` | `GET/POST /v3/myAccount/documents` |
| Aprovação | webhook `ACCOUNT_STATUS_GENERAL_APPROVAL_*` ativa a conta e cria uma chave EVP | — |
| Pix entrada | chaves e cobrança em `/api/bank` (`add_pix_key`, `create_charge`) | `/v3/pix/addressKeys`, `/v3/payments` + `pixQrCode` |
| Pix saída e contas | `POST /api/bank/outgoing` (preparar, depois confirmar com biometria ou senha) | `/v3/transfers`, `/v3/pix/qrCodes/decode` e `/pay`, `/v3/bill/simulate` e `/v3/bill` |
| Validação de saque | `POST /api/bank/webhooks/validate-withdraw`: só aprova pedido confirmado no app, mesmo valor e tipo | chamado ~5 s após cada saída |
| Saldo e extrato | `GET /api/bank/balance`, `GET /api/bank/statement` | `/v3/finance/balance`, `/v3/financialTransactions` |
| Avisos | webhook `POST /api/bank/webhooks/asaas` → `bank_notifications` → sino e toast no app | eventos `PAYMENT_*`, `TRANSFER_*`, `BILL_*` |

## Menores de idade e emancipação

O banco parceiro tem o tipo de documento `EMANCIPATION_OF_MINORS` e só abre conta de menor emancipado (16 e 17 anos). Não há caminho documentado para conta de menor mantida pelo responsável.

- Menor emancipado: a abertura é aprovada na hora (sem análise do PRX), a subconta abre com a certidão de emancipação enviada ao grupo `EMANCIPATION_OF_MINORS` e, quando o banco parceiro aprova, a conta vira comum no PRX (sem limites de menor).
- Menor vinculado ao responsável (Conta Família) ou com menos de 16 anos: `openSubaccount` responde 409 e a conta fica em ativação. Nada é enviado ao banco parceiro.
- A Conta Pai e as mesadas com dinheiro real dependem dessa regra: confirme com o banco parceiro antes de prometer Conta Família.

## Desativar as contas existentes

Aplique `supabase/migrations/20261004_prx_bank_deactivate_sandbox_accounts.sql` (depois da `20261001_prx_asaas_baas.sql`). Ela volta para "em ativação" toda conta que não esteja ligada a uma subconta de produção (saldo, agência, número e cartão do sandbox são zerados). Contas bloqueadas ficam como estão e nada é apagado. O admin mostra em Financeiro quantas contas já foram abertas no banco parceiro.

## Contas criadas antes da produção

Ao abrir o PRX BANK com `ASAAS_ENVIRONMENT=production`:

- Pedido de abertura que ficou "em análise" é aprovado e vai para o Asaas.
- Subconta aberta no sandbox não vale: o membro abre outra em produção, no mesmo registro.
- Saldo, cartão, agência e data de ativação fictícios do sandbox voltam a "em ativação". A conta só fica ativa quando o Asaas aprova a subconta real.
- Extrato e cobranças mostram só lançamentos vindos do Asaas (`provider_ref`). Os do sandbox continuam no banco, mas não aparecem nem contam nos limites.
- Avisos do sino e o limite noturno de Pix só consideram o que aconteceu depois da subconta de produção existir.
- Chaves Pix locais do sandbox não aparecem: valem só as registradas no Pix pela subconta.
- Quem nunca enviou a abertura preenche o formulário. Nenhum dado é inventado.

## Garantias

- **Idempotência**: cada evento entra em `bank_webhooks_log` (único por `event_id`). Um evento já processado volta 200 sem efeito. Lançamentos usam `provider_ref` único.
- **Nada sai duas vezes**: o pedido passa de `awaiting_confirmation` para `requested` numa troca atômica. 429 é repetido. 5xx ou timeout num POST nunca é repetido: o pedido fica em aberto até o webhook decidir.
- **Limites**: Pix noturno de R$ 1.000 entre 20h e 6h de Brasília (Res. BCB 142/2021), limites da Conta Família para menores e saldo do Asaas, conferidos no preparo e na confirmação.
- **Transparência** (Res. Conjunta nº 16/2025): a chancela do Asaas aparece na aba PRX BANK, nos termos da abertura, na confirmação de Pix e contas e no extrato oficial.

## Pendências fora do código

- **Rotacionar `ASAAS_WEBHOOK_AUTH_TOKEN`**: o valor antigo foi publicado no repositório público, no commit `249d8f0`. Gere outro com `openssl rand -hex 24` e atualize o `.env.local`, a Vercel e os webhooks já criados no Asaas.
- **Nome comercial**: a Res. Conjunta nº 16/2025 veda "banco/bank" para instituição não autorizada (ver `docs/PLANO_BAAS.md`, seção 2).
- **Menores de idade**: confirme com o Asaas a regra de subconta para menores antes de abrir para a Conta Família.
- **Chaves Pix por CPF, e-mail ou celular**: pela API, o Asaas cria só chave aleatória (EVP). O app cria e exclui chaves só com a conta aprovada no Asaas; não existe mais pré-cadastro local.
- **Cartões**: virtual e físico ainda não são emitidos. A aba Cartões e o cartão da Home mostram "Em breve", e `request_card` / `toggle_lock` respondem 409.
- **Saldo**: vem só do Asaas. O ajuste manual de saldo pelo painel admin foi removido.
