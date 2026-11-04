<!-- Hello World -->
# Lançamento PRX — o que mudou, como publicar e o que falta

Entrega de 11/10/2026 (commit `ae5313a` e seguintes). Tudo foi feito no código existente, sem reescrever módulos e sem dados fictícios em produção.

## 1. Antes de qualquer coisa: banco

Aplique **`supabase/migrations/20261011_prx_launch.sql`** no Supabase (SQL Editor). Ela só **adiciona** colunas, tabelas, índices e uma view; nada é apagado. O app funciona antes e depois dela:

- antes: compras, portaria e Resenha seguem como hoje; telas novas (cupons, simulação, auditoria, Founders) avisam "Falta aplicar a migração";
- depois: tudo liga sozinho (o app detecta a migração em até 1 minuto).

| Tabela / coluna nova | Para quê |
|---|---|
| `live_events.min_age`, `id_check_required`, `entry_requirements`, `cancellation_policy`, `organizer_name`, `door_test_verified_at/by` | Regras de entrada por evento e prontidão |
| `live_tickets.is_test`, `original_price`, `discount`, `promo_code_id` | Ingresso de teste e desconto (constraint: teste nunca tem pagamento confirmado) |
| `live_promo_codes` | Cupons e links de divulgação |
| `validation_log` | Toda leitura da portaria/balcão, aceita ou recusada |
| `admin_audit_log` | Ações críticas do admin |
| `profiles.birth_date_source`, `birth_date_verified` | Origem da data de nascimento (cadastro, confirmada, KYC) |
| `founders_meetings`, `founders_startups`, `founders_updates` | Conteúdo do PRX Founders |
| view `admin_member_directory` + índices trigram | Busca e filtros de membros no banco |

Todas com RLS ligada e sem acesso de `anon`/`authenticated` (só a service role, pelas rotas `/api`).

### Menores de 18 anos: liberação do responsável (12/10/2026)

Aplique também **`supabase/migrations/20261012_prx_guardian_consent.sql`** (adiciona `live_tickets.guardian_consent` e o modelo de e-mail `minor_event_authorization` ao registro de envios). Sem ela, maiores de idade compram normalmente e **menores recebem o aviso "Falta aplicar a migração"** (nada é perdido nem gravado pela metade).

Regra implementada (`lib/live/age.ts`, `lib/live/service.ts`):

- **Menor de 12 anos**: não tem conta nem compra.
- **12 a 17 anos**, evento abaixo de 18: informa o **e-mail do responsável** na compra (ou na inscrição da RUN). O responsável recebe um link (`/autorizacao/<token>`) e **libera ou recusa aquele ingresso** informando nome, CPF e parentesco. Até a liberação, o ingresso mostra "Aguardando responsável", o QR Code não aparece e a **portaria recusa a entrada**. Recusado, também não entra.
- **Evento 18+**: continua fechado para menores, **mesmo com a liberação** (decisão conservadora; para mudar, `checkAgeEligibility` em `lib/live/age.ts`).
- Qualquer evento pede a **data de nascimento** quando a conta ainda não tem (é ela que diz se a pessoa é menor).
- O **token do link só existe no servidor e no e-mail do responsável**: o app do menor recebe apenas o estado e o e-mail parcial. O admin vê status, nome e CPF parcial, sem token nem IP.
- Fica guardado em `guardian_consent`: e-mail, status, token, nome, CPF, parentesco, telefone, data/hora, IP e navegador da resposta. O link não expira por tempo: vale até o evento terminar ou o ingresso ser cancelado. O membro pode reenviar o e-mail (3 vezes por hora por ingresso).

### Banner de parceiro na Home (12/10/2026)

O banner logo abaixo de "Próximos eventos" é um **Destaque de imagem**, cadastrado no mesmo lugar dos vídeos: **Admin → Marketing → Destaques → "Novo banner da Home"**. Escolha o parceiro (o nome e a imagem de banner que ele já tem cadastrados vêm preenchidos), envie a imagem (JPG, PNG ou WEBP, até 8 MB; quase quadrada funciona melhor no celular), defina o botão (benefício, catálogo ou loja) e a ordem.

- Aparece como os vídeos da aba Destaques: a marca com "Parceiro PRX" e o botão de ação. Até 5 banners ativos (um só ocupa a largura toda; vários viram carrossel, na ordem do admin).
- Não depende do catálogo: é um destaque, não um benefício. Visualizações (uma por membro a cada 30 min) e cliques no botão entram nas métricas do destaque, na mesma tabela dos vídeos.
- Pausar, editar ou excluir é pela mesma lista. Parceiro suspenso ou bloqueado deixa de aparecer sozinho.
- Aplique **`supabase/migrations/20261012_prx_home_banner.sql`** (acrescenta `partner_reels.placement` e deixa o vídeo opcional para o banner). Sem ela, os vídeos seguem normais e o admin recebe "Falta aplicar a migração" ao criar um banner.

## 2. Admin (admin.prx.app.br)

Navegação em módulos: **Visão geral · Usuários · PRX LIVE · PRX PASS · PRX Founders · Financeiro · Marketing · Equipe e permissões · Configurações e auditoria**.

- **Visão geral**: indicadores contados no banco (membros, novos em 7/30 dias, eventos, ingressos e receita confirmada em 30 dias, parceiros, vouchers, lista de espera). Testes e simulações nunca entram nos números.
- **Usuários → Membros**: busca com debounce, filtros (papel, situação bancária), ordenação e paginação no servidor (`GET /api/admin/members`). O painel não carrega mais a base inteira ao abrir. "Histórico" mostra ingressos e vouchers da conta.
- **Configurações → Auditoria**: quem fez o quê (eventos, pagamentos, cupons, equipe, papéis, Founders). **Validações**: toda leitura da portaria e do balcão, com operador, horário e motivo da recusa.
- **Permissões** (sem mudança de modelo): admin geral faz tudo; **Equipe PRX** (operador de portaria) só valida, conforme o cadastro (ingressos e/ou benefícios), nunca vê valores, preços nem configurações. Toda permissão é conferida no servidor; o roteiro de teste confirma que operador e membro recebem 403 no admin.

## 3. PRX LIVE

### Idade por evento
- A idade mínima **da conta** continua 12 anos. A **do evento** é definida no evento (Livre, 10, 12, 14, 16, 18) e aparece antes da compra, no ingresso e na portaria.
- A data de nascimento informada no cadastro (autodeclarada; só o KYC aprovado marca como verificada) agora é **gravada**. Contas antigas confirmam a data uma única vez na primeira compra de evento com idade mínima; a data não muda depois pelo app.
- O servidor recusa a compra de quem não terá a idade no dia do evento (horário de Brasília). Convite também respeita a idade.
- Evento com idade mínima precisa exigir **documento com foto** na portaria; o operador vê o aviso ao validar.
- Não há exceção (acompanhante, autorização) implementada por mim: depende de parecer jurídico. Outra sessão está adicionando a autorização do responsável para menores que **já têm** a idade do evento (`lib/live/guardian*.ts`).

### Publicar e operar
Publicar exige: local e cidade, classificação, documento (quando há idade mínima), organizador, política de cancelamento (20+ caracteres), lotes e quem valida na portaria. "Pronto para operar" exige também o **teste de portaria**: um ingresso de teste lido uma vez (entrada) e de novo (bloqueio). A aba do evento mostra a lista do que falta.

### Cupons e links (Marketing → Cupons e links)
Por evento: código, % ou valor fixo, lotes, validade, limite total e por pessoa, ativar/desativar, e métricas (usos, conversões, receita atribuída, descontos). O desconto é calculado **só no servidor**; o navegador manda apenas o código; um cupom por ingresso. O cupom nasce **inativo**: use "Pré-visualizar compra" e só depois ative.
Link: `https://teste.prx.app.br/?evento=<id>&cupom=<CÓDIGO>` (gerado pelo admin a partir do domínio configurado em `lib/domains.ts`). O link sobrevive ao login, inclusive com o Google.

### Simulação e teste de portaria (PRX LIVE → Simulação e portaria)
Evento → lote → cupom → resumo (servidor) → **pagamento simulado** → ingresso de **TESTE** com QR → validar → ler de novo. Sem cobrança, sem pagamento confirmado, fora de receita/lotação/métricas, fora da carteira do membro, marcado "TESTE · não libera entrada" no ingresso e na portaria. Não há gateway de pagamento online no projeto; a compra real continua "reserva + confirmação pelo admin".

### Portaria (staff.prx.app.br)
Login individual, escolha do evento (ingresso de outro evento é recusado), câmera ou código, retorno visual + som/vibração, aviso de idade/documento, histórico. Baixa **atômica** (atualização condicional no banco). Recusa cancelado, não pago, de outro evento, fora da janela e já usado; tudo vai para `validation_log`.

### Ingresso
Novo visual (obsidiana, geometria, azul/violeta): evento, data, horário, local, categoria, participante, código da compra (`PED-…`), código do ingresso, organização, classificação, avisos e QR. O **modelo ilustrativo** (admin) usa dados fictícios, códigos que o sistema nunca gera e um QR que nenhuma portaria aceita.

## 4. PRX PASS

- **QR dinâmico**: HMAC-SHA256 do voucher + titular + janela de 60 s, segredo só no servidor (`PRX_PASS_QR_SECRET` opcional; sem ela, derivado do segredo da sessão). Tolerância de ±1 janela. Sem câmera: código do voucher + 6 dígitos do momento.
- **Baixa** só com a prova do momento; código estático/print antigo não dá baixa. Limites: 60 leituras/min por operador e 8 provas inválidas por voucher a cada 10 min. Uso único garantido pela baixa atômica (um QR copiado dentro da janela não passa duas vezes).
- Tela do voucher: estados válido / expirado / sem conexão / já utilizado, contagem regressiva e o link **"Ao utilizar este QR Code, você concorda com nossos Termos de Uso"** → `/termos-qrcode`.
- **`/termos-qrcode`**: versão **preliminar**, marcada como sujeita a revisão jurídica. Não foi revisada por advogado.
- Limitação: o limite de tentativas é por instância (memória); em várias instâncias da Vercel ele é aproximado. Para rigor total, mover para Redis/Upstash.

## 5. App

- **PRX FOUNDERS** virou aba própria (dock e menu lateral): início, encontros com programação, startups, novidades/oportunidades/materiais e inscrição da startup (saiu do PRX LIVE; `#live/founders` redireciona). Tudo vem do admin (PRX Founders → Conteúdo); sem dado real, estados vazios. "Oportunidades" mostram aviso de que não é oferta pública (CVM): valide com o jurídico antes de publicar.
- **Cartão**: selo **EM BREVE** no cartão da Home, da aba Cartões e no celular da landing (sem número nem limite que pareçam cartão ativo).
- **PWA**: o convite aparece também onde não há instalação de um toque (iPhone, Firefox…), com passo a passo por aparelho/navegador e animação leve (desligada com "reduzir movimento"). Reabrível em Perfil → "App na tela inicial". Nenhuma métrica de instalação foi adicionada (não há analytics nem política para isso).
- **Indexação**: `robots.txt`, `sitemap.xml` e `noindex` nos portais.

## 6. Resenha de 21/11/2026 — situação

O cadastro **não foi feito no banco de produção**: a chave do Supabase deste computador é de exemplo, então não há acesso, e faltam dados obrigatórios que não podem ser inventados.

| Campo | Situação |
|---|---|
| Nome/data/horário/local | Resenha · 21/11/2026 · 22h · Antonieta (fornecidos) |
| Host (dá nome à edição: "Resenha da/do …") | **Falta** |
| Cidade | **Falta** (obrigatória) |
| Endereço | Falta (opcional; só quem está na lista vê) |
| Lotação | Falta (opcional; sem ela, ilimitada) |
| Classificação | 18+ com documento (regra de toda Resenha) |
| Preço | Gratuito por lista (regra da Resenha) |
| Organizador | **Falta** (obrigatório para abrir a lista) |
| Política de cancelamento | **Falta** (obrigatória para abrir a lista) |
| Insider (1 pessoa) | **Falta** nome e e-mail da pessoa real e a autorização dela |

Passo a passo quando tiver os dados: Admin → PRX LIVE → **Resenha** → Nova edição (preencha tudo) → Adicionar Insider → PRX LIVE → **Simulação e portaria** → escolha a Resenha, lote "Lista", titular "Insider de teste" → simular → validar duas vezes (ou ler o QR no celular da portaria) → volte à Resenha: deve aparecer **"Pronto para operar"** → mude para **Lista aberta**. A edição nasce em rascunho e só publica o evento ao abrir a lista, se estiver completa.

## 7. Testes executados (resultados reais, 11/10/2026)

- `npm run typecheck`: sem erros. `npm run lint`: sem erros novos (2 erros antigos, em `components/app/ui.tsx` e `lib/media/use-decompressed-image.ts`, que já existiam).
- `npm test`: **44 arquivos, 418 testes passando**. Novos: `lib/live/__tests__/launch-rules.test.ts`, `lib/live/__tests__/purchase-flow.test.ts`, `lib/pass/__tests__/dynamic-qr.test.ts`; Resenha e CPF atualizados. Corrigido um teste antigo contraditório em `lib/__tests__/domains.test.ts`.
- `node scripts/e2e-launch.mjs` (dev em memória): **44 PASS, 0 FAIL, 1 SKIP** — publicação exige dados; cupom inativo/ativo, limite por pessoa, preço forjado ignorado; 16 anos não compra 18+; ingresso de teste fora da receita/lotação; portaria recusa outro evento, não pago e 2ª leitura; prontidão "pronto para operar"; portaria sem valores; registros de validação e auditoria; QR dinâmico do PASS (baixa única, estático recusado, voucher alheio 404); Founders rascunho/publicado; diretório paginado; `/termos-qrcode`. O SKIP é o caso "conta sem data de nascimento" com o membro demo (coberto nos testes unitários).
- Verificação visual (Playwright, celular e desktop): visão geral, prontidão do evento, cupons, simulação completa com 2 leituras, modelos, validações, membros, compra pelo link com cupom, Founders, convite de instalação no iPhone, `/termos-qrcode`, seletor de evento da portaria.
- **Não testado**: com o Supabase real (sem credenciais aqui), câmera física lendo o QR, iPhone/Android reais instalando o app, Lighthouse.

## 8. O que depende de você

1. Aplicar as migrações `20261011_prx_launch.sql`, `20261012_prx_guardian_consent.sql` **e** `20261012_prx_home_banner.sql`.
2. Dados da Resenha (tabela da seção 6) e o Insider real com autorização.
3. Revisão jurídica: `/termos-qrcode`, política de cancelamento, regras de idade (a liberação do responsável para menores e o texto do termo em `/autorizacao/<token>`; evento 18+ fechado a menores) e qualquer "oportunidade de investimento" no Founders.
4. Opcional: `PRX_PASS_QR_SECRET` (32+ caracteres aleatórios) na Vercel; Upstash/Redis para limite de tentativas global.
5. **CI e AZ**: as siglas não aparecem no código, nos documentos nem nos PDFs do projeto. Nada foi criado; diga o que significam (e se são campanhas em alguma plataforma) para eu configurar.
6. Google Ads: ver [GOOGLE_ADS.md](GOOGLE_ADS.md) — nada foi publicado e nenhum orçamento foi usado.

## 9. Riscos antes de publicar

- Sem pagamento online: ingressos pagos dependem de confirmação manual no admin.
- O app bloqueia zoom (decisão de produto); o Lighthouse penaliza acessibilidade por isso.
- O painel ainda carrega a lista completa de vouchers/benefícios ao abrir (vouchers devem ganhar paginação quando o volume crescer).
- Contas criadas antes desta entrega não têm data de nascimento gravada: confirmam na primeira compra 18+ (autodeclarada; a portaria confere o documento).
