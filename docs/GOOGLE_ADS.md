<!-- Hello World -->
# Google Ads — preparação da PRX

Estrutura pronta para configurar. **Nada foi publicado e nenhum orçamento foi usado**: não há conta do Google Ads ligada a este projeto. Nenhuma posição é garantida: a ordem dos anúncios depende do leilão (lance × qualidade do anúncio × experiência da página), da concorrência e do orçamento.

## 1. Situação do site (11/10/2026)

| Item | Situação | O que fazer |
|---|---|---|
| Página de destino | `prx.app.br` é o teaser com **Lista de Espera VIP** (título e descrição próprios). O app completo está em `teste.prx.app.br`. | Enquanto o app não estiver no domínio principal, anunciar **só para a Lista de Espera** em `prx.app.br`. |
| Indexação | `robots.txt` e `sitemap.xml` criados nesta entrega; portais (admin, parceiro, equipe, insider) com `noindex`. | Cadastrar `prx.app.br` no Google Search Console e enviar o sitemap. |
| Mensuração | **Não há** Google Analytics, tag do Google Ads nem banner de consentimento. | Criar GA4 + conversões no Ads e um banner de cookies (LGPD) antes de anunciar. Sem isso, não dá para otimizar por conversão. |
| Conversões possíveis | Inscrição na Lista de Espera (`POST /api/waitlist`) e cadastro concluído (`POST /api/auth/signup`). | Disparar o evento de conversão no sucesso de cada um (só com consentimento). |
| Celular | A landing é mobile-first; o app bloqueia zoom (decisão de produto). | Rodar Lighthouse mobile na URL de destino antes de publicar (não executado nesta entrega). |
| Política de privacidade | `/privacidade` existe. | Incluir cookies de publicidade/mensuração quando a tag entrar. |

## 2. Antes de definir a estratégia final: decisões suas

1. **O que anunciar primeiro.** Recomendação: Lista de Espera (benefícios + eventos), sem prometer conta ou cartão. O PRX BANK depende do banco parceiro e o cartão está "em breve".
2. **Regiões.** A empresa está em Goiânia — GO. Defina se a primeira fase é Goiânia/região metropolitana, Goiás, capitais ou Brasil inteiro (muda orçamento e lances).
3. **Público.** O app aceita contas a partir de 12 anos, mas o Google **não permite segmentação por idade, gênero ou interesses para menores de 18** e restringe anúncios para esse público. Os anúncios devem mirar maiores de 18 (e responsáveis, para a Conta Pai).
4. **Conta, faturamento e orçamento** — e quem aprova cada publicação.

## 3. Políticas que se aplicam

- **Serviços financeiros** (PRX BANK, Pix, cartão): o Google exige informações e, em alguns países, verificação do anunciante para serviços financeiros. **Confirmar na conta se a verificação vale para o Brasil** antes de qualquer anúncio que fale de conta, Pix ou cartão. Até lá, não anunciar o BANK.
- **Afirmações não comprovadas**: nada de "sem taxas" ou "cashback" sem a regra publicada na página de destino.
- **Menores**: nada de criativo voltado a crianças/adolescentes; eventos 18+ (como a Resenha) **não** devem ser anunciados (a Resenha é por lista, fora da agenda pública).
- **Marca**: verificar se "PRX" tem conflito de marca registrada nos termos de pesquisa.

## 4. Estrutura de campanhas (proposta)

**Campanha 1 — Pesquisa · Lista de Espera** (objetivo: leads; conversão: inscrição na Lista de Espera)

| Grupo | Palavras-chave (correspondência de frase/exata) | Página |
|---|---|---|
| Marca | "prx app", "prx the next pays", [prx app br] | `prx.app.br` |
| Benefícios jovens | "descontos para jovens", "clube de benefícios jovem", "app de descontos universitário", "benefícios para estudantes" | `prx.app.br` |
| Eventos e experiências | "eventos para jovens [cidade]", "agenda de eventos jovens [cidade]", "ingressos com desconto [cidade]" | `prx.app.br` |
| Founders (após definir o programa) | "programa para startups [cidade]", "pitch de startup", "mentoria para startups" | `prx.app.br` (ou página própria quando existir) |

**Palavras-chave negativas** (lista compartilhada): grátis dinheiro, empréstimo, consignado, aposta, bet, cassino, pirâmide, renda extra, vaga de emprego, login, senha, reclame aqui, golpe, telefone, 0800, prx (outros produtos/fabricantes com a mesma sigla, revisar no relatório de termos).

**Anúncios (RSA, 3 por grupo)** — exemplos de títulos (até 30 caracteres): "PRX: benefícios para você", "Entre na Lista de Espera VIP", "Descontos em parceiros", "Eventos PRX LIVE", "Seja avisado primeiro", "O futuro se constrói". Descrições (até 90): "Benefícios em parceiros, eventos e comunidade em um só app. Entre na Lista de Espera." / "Cadastre seu e-mail e seja avisado primeiro do lançamento do PRX." Sem promessas de conta, cartão ou rendimento.

**Extensões**: sitelinks (Termos, Privacidade, Sou Pai), frase de destaque ("Lista de Espera VIP", "Benefícios em parceiros"), local (Goiânia, se a região for local).

## 5. Orçamento inicial e lances (a aprovar)

- Fase de aprendizado de 2 a 4 semanas com **Maximizar conversões** (sem CPA alvo) e orçamento diário pequeno e fixo definido por você; depois, CPA alvo com base no custo por inscrição observado.
- Começar só em Pesquisa; Performance Max/Display/YouTube depois que houver conversões medidas e criativos aprovados.

## 6. Métricas e otimização

- Acompanhar: impressões, CTR, CPC, **custo por inscrição**, taxa de conversão da página, parcela de impressões perdida (orçamento × classificação) e Índice de Qualidade por palavra-chave.
- Semanalmente: termos de pesquisa (incluir negativas), pausar palavras sem conversão após volume mínimo, testar títulos, revisar horário/dispositivo/região.
- Mensalmente: comparar custo por inscrição com a meta e decidir ampliar regiões ou produtos.

## 7. Pendências externas

Conta do Google Ads, faturamento, GA4 + conversões, banner de consentimento, Search Console, decisão de regiões/produtos/orçamento e a sua aprovação expressa para publicar.
