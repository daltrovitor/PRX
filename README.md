<!-- Hello World -->
# PRX

PRX — the next pays. App de benefícios (PRX PASS), conta digital (PRX BANK) e eventos (PRX LIVE) para as gerações Z e Alpha.

## Rodar localmente

```bash
npm install
npm run dev
```

- App: <http://localhost:3000>
- Painel admin: <http://adminprx.localhost:3000>
- Portal do parceiro: <http://partnerprx.localhost:3000>
- Apresentação do ecossistema: <http://show.localhost:3000> (em produção, `show.viraweb.online`)

Sem variáveis do Supabase o app roda com contas de demonstração, que só existem em desenvolvimento:

| Papel | E-mail | Senha |
|---|---|---|
| Membro | `membro@prx.dev` | `Prx2026!` |
| Admin | `admin@prx.dev` | `AdminPrx2026!` |
| Parceiro | `parceiro@prx.dev` | `PartnerPrx2026!` |

## Variáveis de ambiente

| Nome | Uso |
|---|---|
| `URL` / `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `ANON_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave pública (anon) |
| `SERVICE_ROLE_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Chave de serviço (somente servidor) |
| `JWT_SECRET_OR_HMAC_KEY` | Segredo das sessões (32+ caracteres). Sem ele, é derivado do service role |
| `PRX_ADMIN_EMAILS` | Lista de e-mails admin separada por vírgula (opcional) |
| `NEXT_PUBLIC_SITE_URL` | URL pública do app (opcional) |
| `NEXT_PUBLIC_PRIVACY_POLICY_URL` | Link da Política de Privacidade na tela de aceite do parceiro (opcional) |
| `NEXT_PUBLIC_PRX_LEGAL_NAME` / `NEXT_PUBLIC_PRX_CNPJ` | Razão social e CNPJ exibidos no rodapé e na Política de Privacidade |
| `NEXT_PUBLIC_PRX_DPO_EMAIL` / `NEXT_PUBLIC_PRX_SUPPORT_EMAIL` | Canal do Encarregado (LGPD) e suporte (padrão `privacidade@` e `suporte@prx.app.br`) |
| `PRX_BAAS_WEBHOOK_SECRET` | Segredo HMAC (32+ caracteres) do webhook `POST /api/bank/webhooks/pix` do banco parceiro |
| `PRX_BAAS_MODE=sandbox` | Liga a conta sandbox (saldo fictício, KYC dispensado). Ignorado com `ASAAS_ENVIRONMENT=production` |
| `BANK_PROVIDER=asaas` / `ASAAS_API_KEY` / `ASAAS_ENVIRONMENT` / `ASAAS_API_URL` | PRX BANK pelo Asaas (BaaS, Código Bacen 461). Chave `$aact_` do mesmo ambiente; no `.env`, escreva `\$aact_...`. Ver [docs/ASAAS_BAAS.md](docs/ASAAS_BAAS.md) |
| `ASAAS_WEBHOOK_AUTH_TOKEN` / `ASAAS_WEBHOOK_URL_EVENTS` / `ASAAS_WEBHOOK_URL_VALIDATE_WITHDRAW` / `ASAAS_WEBHOOK_EMAIL` | Token (32+ caracteres) do header `asaas-access-token`, URLs públicas dos webhooks e e-mail de alertas da fila |
| `BANK_ENCRYPTION_KEY` | Chave (32+ caracteres) que cifra as apiKeys das subcontas. Não troque depois de abrir contas |
| `PRX_TEASER_HOSTS` | Hosts extras que abrem o teaser `/em-breve` na raiz (além de `prx.app.br`) |
| `CRON_SECRET` | Protege `GET /api/cron/allowances` (mesada automática, agendada no `vercel.json` para 09:05 de Brasília) |
| `PRX_WEBAUTHN_RP_ID` / `PRX_WEBAUTHN_ORIGINS` | Domínio e origens da biometria (passkeys). Padrão: o host da requisição |
| `RESEND_API_KEY` / `PRX_EMAIL_FROM` / `PRX_EMAIL_REPLY_TO` | E-mail de boas-vindas pelo Resend: sai de `noreply@prx.app.br`, respostas para `suporte@prx.app.br`. Ver [docs/NOTIFICACOES.md](docs/NOTIFICACOES.md) |
| `PRX_EMAIL_ASSETS_URL` | De onde o e-mail carrega as imagens de `/email` (padrão: `NEXT_PUBLIC_SITE_URL`) |
| `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` | Código de confirmação do celular pelo WhatsApp Cloud API (Meta) |
| `WHATSAPP_OTP_TEMPLATE` / `WHATSAPP_TEMPLATE_LANG` / `WHATSAPP_API_VERSION` | Template de autenticação aprovado (padrão `prx_codigo_verificacao`, `pt_BR`, `v23.0`) |

## Estrutura

- `app/`: rotas (App Router). `/` é a landing e o app; `/admin` e `/partner` são servidas pelos subdomínios (`proxy.ts`). Páginas públicas: `/termos`, `/privacidade`, `/sou-pai` (cadastro da Conta Pai) e `/em-breve` (raiz do domínio `prx.app.br`). A landing (identidade Obsidian, com Entrar e Criar conta em `#entrar` / `#criar-conta`) fica em `components/marketing/revolut-landing.tsx` e `components/marketing/landing/`.
- `components/app/`: shell do app, telas (Início, Pass, Destaques, Bank, Live e Perfil no cabeçalho) e UI do Modelo Padrão em Liquid Glass (classes `.glass*`, `.prx-holo` e `.prx-metal` em `app/globals.css`).
- `components/auth/` e `lib/passkeys/`: "Lembrar de mim" com tela de login dedicada (foto, nome, senha ou biometria via WebAuthn) e cadastro com verificação de idade e CPF.
- `components/family/` e `lib/family/`: contas de família — Conta Pai (`/sou-pai`), Conta Filho, emancipação, mesada, limites de gasto e acompanhamento; análise na aba "Famílias" do admin.
- `components/brand/`: logo vetorial e abertura animada.
- `components/icons/`: ícones próprios da PRX.
- `lib/prx/`: domínio do PRX BANK (Pix EMV, cartões, extrato) e do PRX LIVE.
- `lib/points/`: economia PRX: PRX Coins, régua infinita de níveis, regras de bom comportamento, calculadora de viabilidade e motor de compras em parceiros via Pix.
- `lib/reels/`: Reels de parceiros (feed, curtidas, salvos e métricas).
- `lib/notifications/` e `lib/phone/`: notificações. E-mail de boas-vindas "Você entrou. Welcome to PRX." (Resend) no cadastro e no primeiro login com Google, e confirmação do celular por código no WhatsApp (card **WhatsApp** no Perfil). Imagens do e-mail em `public/email/` (`node scripts/build-email-assets.mjs`). Ver [docs/NOTIFICACOES.md](docs/NOTIFICACOES.md).
- `components/show/`: apresentação "PRX — The ecosystem for the next generation" (19 páginas na identidade da landing), servida na raiz de `show.viraweb.online` (`proxy.ts` reescreve para `/apresentacao`). Setas, PageUp/PageDown, Espaço, Home e End navegam; o endereço guarda a página (`#live`); imprimir gera uma página por folha.
- `lib/partners/`: programa de parceiros: Termo e Resumo Comercial, aceite eletrônico, planos de mídia e métricas agregadas. Ver [docs/PARCEIROS.md](docs/PARCEIROS.md), que inclui a ordem de implantação.
- `docs/`: [relatório](docs/RELATORIO_PRX.md), [plano de BaaS](docs/PLANO_BAAS.md), [infraestrutura para escala](docs/INFRA_ESCALA.md) e [programa de parceiros](docs/PARCEIROS.md).

## Banco de dados

Aplique as migrações de `supabase/migrations` em ordem. A `20260927_prx_points_reels_finance.sql` cria PRX Coins, extrato de pontos, regras de comportamento, Reels, compras em parceiros (BACEN) e lista VIP, com crédito atômico por `prx_apply_point_transaction` (só a service role executa). A `20260928_prx_family_passkeys.sql` zera os coins iniciais, cria a fila de análise de bom comportamento, as biometrias (passkeys), as contas de família (CPF único, Conta Pai, emancipação, vínculos, mesada e limites) e o bucket privado `family-docs`.

A `20260929_prx_bank_kyc_consent.sql` cria a abertura do PRX BANK (`bank_kyc_applications`) e grava parentesco e consentimento parental (versão, data e IP) em cada vínculo com menor.

A `20261001_prx_admin_legal_checklist.sql` guarda o andamento do "PRX — Checklist Jurídico e Regulatório" (status, responsável e parecer de cada item) mostrado na aba **Jurídico** do admin; o texto dos itens mora em `lib/legal/checklist-data.ts`. A aba **Lista de Espera** lê os leads do /em-breve (`waitlist_signups`) e exporta CSV.

A `20260930_prx_notifications.sql` guarda o celular confirmado pelo WhatsApp no perfil (um número por conta), os códigos de confirmação (só o HMAC) e o registro de envios de e-mail e WhatsApp (`notification_log`).

Onboarding condicional:
- **Cadastro do ecossistema, sem fricção:** nome, e-mail, senha e aceite dos Termos. Nada de documentos.
- **Verificação de identidade só em dois casos:** (1) abertura do PRX BANK, na primeira visita à aba (CPF, nascimento, nome da mãe, celular, ocupação, renda, PEP, endereço do cartão e documento com foto frente e verso, analisados na aba "Verificações" do admin); (2) tutela de menores, quando o responsável cria a conta do filho ou aceita o pedido de vínculo (parentesco, declaração de tutela e consentimento parental explícito da LGPD, Art. 14).
- Regras de idade no PRX BANK (horário de Brasília): menores de 16 só com o responsável vinculado; 16–17 com o responsável ou emancipação comprovada; 18–29 conta comum. A Conta Pai não guarda dinheiro nem rende. Movimentação só com a abertura aprovada e a conta `active`; limites do menor conferidos no servidor a cada Pix.

## Qualidade

```bash
npm run typecheck        # tsc --noEmit (strict, sem any)
npm run lint
npm run security:scan    # Semgrep: .semgrep/prx-security.yml + p/security-audit + p/default
npm run security:test    # testes das regras (ruleid/ok) em .semgrep/prx-security.tsx
npm test
npm run build
BASE=http://localhost:3000 node scripts/e2e-partners.mjs   # com npm run dev, sem Supabase
BASE=http://localhost:3000 node scripts/e2e-prx2.mjs       # pontos, Pix em parceiro, Destaques, financeiro, LGPD, KYC, Conta Pai
```

As regras de `.semgrep/prx-security.yml` cobrem o que é específico do PRX: rota que altera dados sem sessão, path traversal no Storage de documentos, falsificação de log, injeção em filtros PostgREST (use `pgQuote`), open redirect, SSRF, `Math.random` no servidor, hash fraco, comparação de segredo sem tempo constante e flags do cookie de sessão. Supressão só com `// nosemgrep: <regra> — <motivo>`.
