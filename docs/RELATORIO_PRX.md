# Relatório: rebrand PRX, Modelo Padrão e setores PASS, BANK e LIVE

Data: 24/09/2026 · Repositório: `prx` (antigo `nxtgen`)

---

## 1. O que foi entregue

### Marca
- Logo PRX **vetorizada** a partir do arquivo mestre (672×582). A geometria do símbolo, do P, do R e do X foi traçada ponto a ponto e conferida por sobreposição com o original (diferença apenas de antisserrilhado nas bordas).
- A assinatura "EXPERIÊNCIAS QUE CONECTAM GERAÇÕES" foi convertida em contorno com fonte DIN (Barlow), cada letra na posição medida no original.
- **Versão horizontal** (símbolo | PRX + assinatura + barra em degradê), como a logo NXTGEN anterior, sem fundo.
- Arquivos em `public/brand/`: `prx-full-*`, `prx-compact-*` e `prx-symbol-*`, cada um em versão para fundo escuro e para fundo claro, mais os ícones do app (192 e 512) e o favicon.
- Componente `PrxLogo` com `currentColor`: a parte branca vira grafite automaticamente no fundo branco.
- Gerador reprodutível: `scripts/generate-prx-logo.py`.

### Abertura animada (substitui o loading antigo)
- Primeira visita da sessão (cerca de 3,5s de animação mais a saída): as duas peças do símbolo deslizam e se encaixam no centro, o símbolo vai para a esquerda, P, R e X sobem de uma máscara, o braço do X encaixa, a assinatura é desenhada e a barra abre do centro. A tela então sobe e revela o app.
- Visitas seguintes na mesma sessão: versão curta (cerca de 1,3s).
- A animação tem relógio próprio e não "pula" quadros quando o 3D da landing está carregando. Com `prefers-reduced-motion` ela vira um fade simples. Se o JavaScript falhar, a tela some sozinha em 9s.

### Rebrand NXTGEN/NXT/NG → PRX
- Todos os textos, metadados, manifest, e-mails de exemplo, chaves de armazenamento, cookie de sessão (`prx_session`), prefixos de voucher (`PRX-`) e payloads de QR (`PRX_PASS::`).
- Compatibilidade com dados antigos: vouchers `NXTGEN_PASS::` e o marcador `nxt-meta` das missões continuam sendo lidos.
- As **colunas do banco `nxt_score`, `nxt_level` e `min_nxt_level` foram mantidas**. Renomear exige migração no banco em produção (fica como próximo passo opcional).
- Os painéis têm subdomínio próprio no roteamento (hoje `admin.`, `partner.` e `staff.` em `prx.app.br`; ver `docs/DOMINIOS.md`). Os rótulos antigos (`adminprx.`, `partnerprx.`, `staffprx.`, `adminng.`, `partnerng.`) continuam aceitos até o DNS ser trocado.

### Modelo Padrão aplicado (tudo, menos o design da landing)
- Fundo branco puro, grafite `#0b0b10`, **uma única cor de destaque** (violeta `#6c0cf0` extraído da logo), `::selection` na cor da marca e `cursor-pointer` em todos os controles.
- Cantos de 2 a 4px, sem pílulas, sem neon, sem degradês na interface (o degradê existe só dentro da logo), sem pontos piscando (removidos inclusive da landing) e sem eyebrows antes dos títulos.
- **Composição escolhida:** Pirâmide Invertida e Dashboard Gestalt nos dashboards (KPIs no topo, ação no meio, detalhe na base), com tipografia editorial assimétrica e proporção áurea (38,2/61,8) nas telas de login.
- Tipografia: Bricolage Grotesque (títulos), Inter (texto, números tabulares) e JetBrains Mono (códigos). Nada de Space Grotesk genérico no app.
- **Ícones próprios** (`components/icons/prx-icons.tsx`): traço reto e diagonais de 45°, a mesma gramática do símbolo. Substituem o lucide dentro do app e são usados com parcimônia.
- Lenis + GSAP sincronizados no mesmo RAF, springs do Motion (`stiffness 300 / damping 28`) e `layoutId` no indicador das abas.
- Responsivo de 320px a 4K: sem rolagem horizontal (testado em 320 e 390px) e áreas de toque ≥ 48px.
- `// Hello World` na primeira linha de todas as páginas e componentes novos. `suppressHydrationWarning` no `html` e no `body`.

### App (área logada)
- **Barra de abas inferior** no mobile (estilo Instagram: Início, Pass, Bank, Live, Perfil) e trilho lateral no desktop.
- Navegação por hash (`#bank/pix`, `#live/run`): o botão voltar do celular funciona e links diretos também.
- **Início (Carteira Central PRX):** saldo, vouchers, PRX Score com barra de nível, ingressos, próximo evento, missões, benefícios em destaque e movimentações.
- **PRX PASS:** catálogo com busca e categorias, detalhe do benefício, voucher com QR, missões (aceitar e verificar) e convites.
- **PRX BANK (modo demonstração):**
  - extrato com filtro de período e tipo;
  - Pix por chave (CPF validado, e-mail, celular, CNPJ e aleatória);
  - Pix Copia e Cola **no padrão EMV/BR Code com CRC16 real**, leitura de QR pela câmera e cobrança com QR;
  - chaves Pix;
  - cartão virtual (ver dados, bloquear e desbloquear) e pedido de cartão físico com rastreio.
- **PRX LIVE:**
  - agenda (Founders, Session, Ctrl + PRX, Talks);
  - **PRX UP**: compra por lote pagando com saldo PRX, Pix ou cartão, e ingresso com QR na carteira;
  - **PRX RUN**: inscrição com modalidade, categoria, camiseta e termo de responsabilidade, QR de retirada do kit e resultados;
  - **PRX FOUNDERS**: submissão com pitch deck e vídeo, e acompanhamento Enviada → Em análise → Selecionada.
- **Perfil:** métricas, progresso, atalhos e saída.

### Painéis
- **Admin** (`admin.`): KPIs no topo e tabelas de membros, benefícios, missões e vouchers, com edição em painéis laterais. A sessão é verificada no servidor (sem piscar tela de login).
- **Parceiro** (`partner.`): validador por câmera ou código, histórico e baixa com confirmação.
- **Página 404** em perspectiva central.

---

## 2. Segurança: falhas encontradas e corrigidas

| Gravidade | Falha | Correção |
|---|---|---|
| **Crítica** | O segredo que assina as sessões caía num valor fixo publicado no repositório público (a Vercel não tinha `JWT_SECRET_OR_HMAC_KEY`). Qualquer pessoa podia forjar sessão de admin | Segredo resolvido em `lib/server-secrets.ts`: env dedicada ou derivado do service role key. Em produção, sem nenhum dos dois, o sistema recusa assinar |
| **Crítica** | `POST /api/auth/google` logava em **qualquer conta** pelo e-mail enviado no corpo, sem prova de identidade (inclusive nos e-mails de admin) | A rota agora só funciona em desenvolvimento. Produção usa o OAuth real do Supabase |
| **Crítica** | Senhas das contas demo (inclusive admin) publicadas no código e ativas em produção | Contas demo só existem fora de produção, com e-mails `@prx.dev` |
| Alta | Papel de admin/parceiro lido de `user_metadata`, que o próprio usuário edita pela API pública | Papel só vem de `profiles.role` ou `app_metadata` (escrita exclusiva da service role) |
| Alta | Cadastro público permitia criar conta com um e-mail da lista de admins (sem confirmação de e-mail, isso dava acesso admin) | E-mails reservados bloqueados no cadastro |
| Alta | Login Google em produção nunca usava o Supabase: as variáveis públicas não chegavam ao navegador | `next.config.ts` expõe URL e anon key (públicas por design) |
| Alta | Resgate de voucher funcionava sem login (em nome de um usuário demo) | Retorna 401 sem sessão |
| Alta | Código de indicação "rafael" dava +100 XP para qualquer um | Removido |
| Média | Validação no balcão sujeita a baixa dupla em caixas simultâneos | Baixa condicional no banco (`status <> used`) |
| Média | Entrada do usuário interpolada no filtro `.or()` do PostgREST. Também **quebrava a busca por código em produção** (comparava texto com a coluna uuid) | Consultas separadas por coluna |
| Média | Parceiro via o e-mail completo de todos os clientes no histórico | E-mail mascarado (LGPD) |
| Média | Usuário podia editar o próprio `nxt_score`, `nxt_level` e `wallet_balance` direto no Supabase (política RLS de update) | Migração `20260924_prx_security_hardening.sql` pronta (ver pendências) |
| Baixa | Sem headers de segurança | HSTS, `nosniff`, `Referrer-Policy`, `X-Frame-Options` e `Permissions-Policy` |

---

## 3. Verificação

- `tsc --noEmit`: **0 erros**.
- ESLint: **0 erros** (30 avisos, todos em código legado da landing e de rotas antigas). Os `any` foram eliminados.
- `next build`: ok.
- **Teste ponta a ponta com Playwright: 30 de 30 passaram.** Cobre admin (login, criar benefício e missão), membro (resgatar voucher com QR, aceitar e verificar missão, Pix por CPF, chave aleatória, cobrança BR Code com CRC válido, Copia e Cola, cartão ver/bloquear/desbloquear, cartão físico, ingresso pago com saldo, inscrição RUN, submissão Founders), parceiro (consultar, dar baixa, bloquear baixa dupla) e segurança (resgate anônimo 401, admin anônimo 401, e-mail reservado bloqueado). Em mobile (320 e 390px): sem rolagem horizontal nas 5 abas e toque ≥ 48px.
- Console do navegador: sem erros.

### Lighthouse (build de produção, local)

| Página | Mobile (P/A/BP/SEO) | Desktop (P/A/BP/SEO) |
|---|---|---|
| Painel admin | 85 / 100 / 100 / 100 | 99 / 100 / 100 / 100 |
| Portal do parceiro | 82 / 100 / 100 / 100 | 97 / 100 / 100 / 100 |
| Landing (design mantido) | 54 / 100 / 100 / 100 | 81 / 100 / 100 / 100 |

Leitura honesta:
- Acessibilidade, Boas Práticas e SEO estão em 100 em todas as páginas.
- A performance mobile da landing é limitada pelo celular 3D em Three.js e pelas animações de rolagem. O 3D agora carrega depois que a página fica interativa (a nota subiu de 43 para 54). Chegar a 100 exigiria mudar o design da landing, que foi pedido para manter.
- Nos painéis, o que resta é CSS bloqueante e a fonte do título no mobile simulado.

---

## 4. Pendências (em ordem de prioridade)

1. **Aplicar a migração de segurança** `supabase/migrations/20260924_prx_security_hardening.sql` no Supabase (SQL Editor). Depois, revisar parceiros que só tinham o papel em `user_metadata` e promovê-los pelo admin.
2. **Missões e indicações fora da memória do servidor** (`lib/pass-store.ts` → tabelas `user_missions` e `referrals`). Na Vercel, a memória não é compartilhada entre instâncias.
3. **Nome "PRX BANK"**: a Res. Conjunta 16/2025 proíbe "bank"/"banco" para quem não é autorizado pelo BC. Definir PRX PAY, PRX Conta ou similar antes do lançamento (ver `docs/PLANO_BAAS.md`).
4. **Planos pagos**: Vercel Pro (o Hobby proíbe uso comercial) e Supabase Pro. Ver `docs/INFRA_ESCALA.md`.
5. Adicionar `JWT_SECRET_OR_HMAC_KEY` (32+ caracteres aleatórios) na Vercel. Hoje o segredo é derivado do service role, o que é seguro, mas uma chave dedicada permite rotacionar sem trocar o service role.
6. Supabase Auth: incluir `https://teste.prx.app.br/**` nas Redirect URLs (e como Site URL) e confirmar que o provedor Google está configurado. Ver `docs/DOMINIOS.md`.
7. DNS: criar `teste`, `admin`, `partner`, `staff`, `insider` e `show` em `prx.app.br` (ver `docs/DOMINIOS.md`) e depois remover os endereços antigos.
8. Parceiro ↔ estabelecimento: hoje qualquer conta de parceiro valida vouchers de qualquer parceiro. Ligar o usuário parceiro ao `partner_id` e filtrar.
9. PRX LIVE e FOUNDERS com backend: tabelas de eventos, ingressos e submissões, painel do organizador (portaria) e upload real do pitch deck no Storage.
10. Rate limiting (Firewall da Vercel ou Upstash) e Sentry.
