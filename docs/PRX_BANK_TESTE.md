# PRX BANK — abertura com análise da PRX e roteiro de teste (16/10/2026)

## O que mudou

1. **Análise de identidade da PRX** (Admin → PRX BANK → Identidade). A abertura não é mais aprovada sozinha:
   - o membro envia dados, frente e verso do documento e a selfie da câmera → fica **Em análise pela PRX**;
   - o admin confere cada documento (abre por link assinado de 60 s, cada abertura fica no histórico), aprova ou recusa com motivo;
   - com algum recusado, **Pedir reenvio**: o membro vê o motivo e troca só aquele arquivo (não refaz a abertura);
   - **Aprovar identidade** só funciona com todos os documentos aprovados. Aí a subconta é criada no Asaas e os documentos seguem para a análise dele. A conta só fica ativa com a aprovação do Asaas (general = APPROVED).
2. **Cofre da subconta**: excluir o cadastro não perde mais a chave da subconta do Asaas. O novo cadastro com o mesmo CPF religa a mesma subconta **com a chave** e confere a situação no Asaas (nada de conta nova, nada de "Gerar chave", que pela Vercel não funciona).
3. **Liberação +29** (Admin → PRX BANK → Liberação +29): quem tem mais de 29 anos só abre a conta com a liberação. Conferida no envio, na aprovação e na criação da conta no Asaas.
4. **Retenção**: arquivos de aberturas recusadas há mais de 180 dias são apagados pelo cron diário; a decisão e o histórico ficam. O prazo das aprovadas depende do jurídico (não é apagado).

## Antes do teste (uma vez)

1. Aplicar no Supabase, nesta ordem, as migrações que ainda faltarem: `20261008`, `20261010`, `20261011`, `20261012_*`, `20261013`, **`20261015_prx_bank_identity.sql`**.
   - Sem a `20261015`, excluir o usuário pelo painel do Supabase **perde a chave da subconta** (e o cadastro novo fica preso em "Conta em análise").
2. Vercel (Production): `BANK_PROVIDER=asaas`, `ASAAS_ENVIRONMENT=production`, `ASAAS_API_KEY` de produção (`$aact_prod_…`), `BANK_ENCRYPTION_KEY`, `ASAAS_WEBHOOK_AUTH_TOKEN`, `ASAAS_WEBHOOK_URL_EVENTS`, `ASAAS_WEBHOOK_URL_VALIDATE_WITHDRAW`, `CRON_SECRET`. Depois de mudar variáveis, **Redeploy**.
3. Admin → PRX BANK → Asaas: o cartão de diagnóstico precisa mostrar chave de produção, webhooks respondendo e migrações aplicadas.

## Excluir o usuário de teste

1. Supabase → Authentication → Users → excluir o usuário.
   - Com a `20261015` aplicada, a linha da subconta sai junto e a chave vai para `bank_subaccount_vault` (confira: `select asaas_account_id, archived_at from bank_subaccount_vault;`).
   - Se der "Database error deleting user": o usuário tem pedidos Pix (`bank_outgoing_requests`). Movimentação financeira não é apagada; use outro e-mail/CPF ou fale comigo.

## Roteiro do novo cadastro

| # | Onde | O que fazer | O que deve acontecer |
|---|------|-------------|----------------------|
| 1 | App | Criar conta (e-mail ou Google) com CPF, celular e nascimento | Entra no app; boas-vindas por e-mail |
| 2 | App → PRX BANK | Preencher dados, endereço, perfil; frente, verso e selfie pela câmera; aceitar termos | Tela **"Conta em análise"** com as etapas e cada documento "Em análise" |
| 3 | App | Fechar e abrir o app de novo | Continua na mesma tela (nada volta ao formulário) |
| 4 | Admin → PRX BANK → Identidade | Abrir a ficha, "Mostrar aqui" em cada documento, recusar o verso com motivo, "Pedir reenvio" | No app: aviso no sino e a tela pede só o verso, com o motivo |
| 5 | App | Enviar o verso de novo | Verso volta a "Em análise"; o resto continua aprovado/recebido |
| 6 | Admin | Aprovar os documentos e **Aprovar identidade** | Toast "Identidade aprovada"; no histórico: aprovado por você |
| 7 | Admin → PRX BANK → Asaas | Ver o registro do membro | `recovered` "religada ao membro com a chave guardada no cofre" (ou `sent` se a subconta for nova) |
| 8 | App → PRX BANK | Aguardar ou "Verificar aprovação" | "Conta em análise" do banco; se o Asaas pedir algo, aparece o link seguro |
| 9 | Asaas aprova | — | App mostra a conta ativa, agência/conta, aviso "Sua conta bancária foi aprovada" |
| 10 | App → Pix → Chaves | Criar chave aleatória (EVP) | Chave aparece como ativa (máx. 5, 1 por minuto) |
| 11 | App → Pix | Receber um Pix de R$ 1,00 de outra conta | Saldo e extrato atualizam; aviso "Pix recebido" |
| 12 | App → Pix | Enviar R$ 1,00 para uma chave sua | Confirmação, depois "Pix enviado"; extrato com a saída |

Transferências reais (passos 11 e 12) movimentam dinheiro de verdade: faça você, com valores mínimos. Eu não executei nenhuma operação real.

## Onde olhar quando algo der errado

- Código "Deu um erro… BNK-XXXXXX": Admin → `GET /api/admin/incidents?code=BNK-XXXXXX`.
- Abertura no Asaas: Admin → PRX BANK → Asaas (registro do membro e chamadas à API).
- Histórico da análise: ficha do membro em Admin → PRX BANK → Identidade.
