# PRX BANK: plano de Banking as a Service (BaaS)

Documento de decisão para colocar o PRX BANK em produção: conta digital, Pix, cartões e a Carteira Central PRX, conforme a Fase 1 da proposta PRX × ViraWeb.

Data: 24/09/2026.

> **Atualização (04/11/2026):** a integração com o Asaas (BaaS e cobranças) foi removida para trocar de provedor. O que ficou pronto para reaproveitar e como ligar o provedor novo estão em [BANCO_PROVEDOR.md](BANCO_PROVEDOR.md). As seções abaixo ficam como registro da análise.

---

## 1. Resumo da recomendação

| Decisão | Recomendação |
|---|---|
| Provedor principal | **Celcoin** (BaaS completo: conta de pagamento, Pix, TED, boleto, emissão de cartão pré-pago, sandbox e cobrança por transação) |
| Alternativa forte | **Dock** (melhor em processamento de cartões e multi-saldos; mais indicada se cartão for o centro do produto) |
| Plano B para pagamentos do PASS e do LIVE (orquestrador) | Pagar.me ou Mercado Pago para checkout com split, independente do BaaS |
| Modelo | PRX como **tomadora de BaaS** (sem licença própria), com contas **individualizadas** em nome de cada cliente |
| Bloqueio antes de lançar | **Trocar o nome "PRX BANK"** (ver seção 2) e fechar a regra para menores de idade |

Por que Celcoin como primeira opção:
- cobre sozinho todo o escopo da Fase 1 (conta, extrato, Pix por chave, Copia e Cola e QR, cartão virtual e físico, bloqueio e desbloqueio);
- cobrança principalmente por transação, com pouco custo fixo de entrada, o que combina com uma base que entra de graça e só gera receita depois;
- tem sandbox e APIs REST documentadas: a integração pode começar em paralelo à negociação comercial;
- é full stack (BaaS com migração posterior para core próprio), então não obriga a trocar de fornecedor se o PRX crescer.

Referência de mercado: uma operação básica white label (conta + cartão + Pix) costuma custar **de R$ 200 mil a R$ 600 mil no primeiro ano**, conforme o volume. O número vem de material do próprio fornecedor e deve ser confirmado em proposta comercial.

---

## 2. Regulação: o que muda com a Resolução Conjunta nº 16/2025

Publicada em **28/11/2025** pelo CMN e pelo Banco Central, a resolução regula o BaaS. O prazo para adequar contratos que já existiam é **31/12/2026**; contratos novos já nascem sob a regra.

Pontos que afetam diretamente o PRX:

1. **Nome do produto.** A norma proíbe que empresas não autorizadas pelo BC usem termos que indiquem ser banco ou instituição financeira, **como "banco" ou "bank"**. Por isso "PRX BANK" **não pode ser o nome comercial** enquanto a PRX não for instituição autorizada. Sugestões: **PRX PAY**, **PRX Conta** ou **PRX Wallet**. No app, o rótulo "Bank" está isolado na barra de navegação e nos títulos da tela, então a troca é simples quando o nome for decidido.
2. **Identificação do prestador.** A instituição que presta o BaaS precisa aparecer de forma visível para o cliente: no app, nos contratos, nos comprovantes e no cartão. Exemplo: "Conta de pagamento oferecida por [Instituição], instituição de pagamento autorizada pelo Banco Central".
3. **Sem conta bolsão.** Cada cliente precisa de uma conta individualizada em seu nome. A PRX não pode movimentar dinheiro de clientes em conta própria.
4. **Um único prestador por modalidade.** Não dá para ter dois BaaS para o mesmo tipo de conta. A escolha precisa ser definitiva.
5. **Responsabilidade.** O prestador regulado responde por KYC, prevenção à lavagem de dinheiro e fraude. A PRX responde pela qualidade dos dados que repassa e pelas obrigações do contrato.

### Menores de idade (Geração Alpha)

O público inclui menores de 18 anos. As instituições em geral abrem conta a partir de 12 ou 13 anos, **com autorização de um responsável legal**, que responde pelas movimentações. Antes de assinar, confirmar com o provedor:
- se oferece conta de menor com vínculo ao responsável e fluxo de consentimento pelo app;
- limites por idade e controle parental (limite diário, bloqueio noturno, notificações ao responsável);
- regras de cartão para menores (normalmente só pré-pago).

Enquanto isso não estiver fechado, a recomendação é lançar o PRX BANK **só para maiores de 18** e manter PASS e LIVE abertos para todas as idades permitidas.

---

## 3. Comparativo de provedores

| Critério | Celcoin | Dock | QI Tech | Swap | Zoop | Asaas |
|---|---|---|---|---|---|---|
| Conta de pagamento PF | Sim | Sim | Sim | Sim | Sim | Foco PJ |
| Pix (chave, Copia e Cola, QR) | Sim | Sim | Sim | Sim | Sim | Sim |
| Emissão de cartão (virtual e físico) | Sim | Forte (core de cartões) | Limitado | Sim (ponta a ponta) | Pré-pago | Limitado |
| Foco | BaaS full stack | Cartões e contas em escala | Crédito | Embedded finance | Varejo e marketplaces | Cobrança para PMEs |
| Sandbox | Sim | Sim | Sim | Sim | Sim | Sim |
| Modelo de preço | Por transação, baixo setup | Setup e mínimo mensal mais altos | Por operação de crédito | Por conta e transação | Por transação | Tarifas públicas |
| Aderência ao PRX | **Alta** | Alta | Média (se o foco for crédito) | Média | Média | Baixa (PF jovem) |

Fontes de apoio: comparativos de mercado e a documentação pública dos fornecedores. Parte do material é produzida pelos próprios fornecedores, então os números comerciais devem vir de cotação formal.

---

## 4. Arquitetura da integração no código

O app já está preparado para trocar a demonstração pelo provedor real sem mexer na interface:

```
Tela (components/app/screens/bank-screen.tsx)
   └── lib/prx/bank.ts        ← funções de domínio: sendPix, addCharge, setCardLocked…
          └── hoje: estado local (BANK_MODE = "sandbox")
          └── amanhã: rotas /api/bank/* → adaptador do provedor (Celcoin/Dock)
```

Passos técnicos:

1. **Adaptador `BankingProvider`** em `lib/prx/providers/celcoin.ts`, implementando o contrato das funções de `lib/prx/bank.ts` (saldo, extrato paginado, Pix por chave com consulta ao DICT, Pix Copia e Cola, cobrança com QR dinâmico, cartões, bloqueio, 2ª via, rastreio).
2. **Rotas do servidor** `app/api/bank/*`: o navegador nunca fala com o provedor. Credenciais ficam só no servidor (Vercel env), com mTLS quando o provedor exigir.
3. **Webhooks** `app/api/bank/webhooks/*`: Pix recebido, Pix devolvido, compra no cartão, mudança de status do cartão. Validar a assinatura e registrar idempotência por `endToEndId`.
4. **Tabelas no Supabase** (espelho, não fonte da verdade): `bank_accounts` (id da conta no provedor por usuário), `bank_events` (log de webhooks, único por id externo) e `pix_keys` (cache). O saldo oficial sempre vem do provedor.
5. **Onboarding/KYC**: fluxo no app com CPF, dados, selfie e documento, usando o KYC do provedor. Só depois disso a conta é criada.
6. **Segurança transacional**: confirmação com senha de transação ou biometria do aparelho para Pix acima de um limite, limites noturnos (exigência do BC) e alerta de dispositivo novo.
7. **Troca de modo**: `BANK_MODE` passa para `"live"` e o aviso de demonstração some automaticamente.

---

## 5. Cronograma sugerido

| Semana | Entrega |
|---|---|
| 1–2 | RFP para Celcoin e Dock (volume estimado, público jovem, menores, cartões), due diligence e escolha |
| 2–3 | Contrato, credenciais de sandbox, definição do nome (sem "Bank") |
| 3–6 | Adaptador, rotas, webhooks, KYC e onboarding no sandbox |
| 6–7 | Homologação com o provedor, testes de carga e de segurança (pentest) |
| 8 | Lançamento controlado (lista de espera, 500 contas) e depois abertura gradual |

---

## 6. Perguntas para a cotação (checklist)

- Custo por conta ativa/mês, por Pix enviado e recebido, por TED, por boleto e por cartão emitido (virtual e físico, com frete).
- Setup, mensalidade mínima e fidelidade.
- Suporte a conta de menor com responsável legal e controle parental.
- SLA de disponibilidade, janela de manutenção e status page.
- Webhooks: retentativas, assinatura, ordem de entrega.
- Como o prestador aparece no app e nos comprovantes (exigência da Res. Conjunta 16/2025).
- Plano de adequação à Res. Conjunta 16/2025 até 31/12/2026.
- Limites de Pix e regras de prevenção a fraude aplicadas pelo prestador.
