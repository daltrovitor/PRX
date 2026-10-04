<!-- Hello World -->
# Notificações: e-mail de boas-vindas e código no WhatsApp

Tudo mora em `lib/notifications/` (canais, modelos e registro de envios) e `lib/phone/` (confirmação do celular). Sem provedor configurado, o desenvolvimento **simula** o envio (o código do WhatsApp aparece na tela) e a produção registra `skipped`. Notificação nunca derruba cadastro nem login.

| Canal | Provedor | Quando sai |
|---|---|---|
| E-mail | [Resend](https://resend.com) (API HTTP) | Todo cadastro, sempre depois da resposta (`after()`): e-mail e senha (`POST /api/auth/signup`), Google (`POST /api/auth/google/complete`), Conta Pai (`POST /api/family/parent/signup`) e conta do filho criada pelo responsável (`POST /api/family/children`) |
| WhatsApp | WhatsApp Cloud API (Meta) | Membro pede o código no Perfil → card **WhatsApp** (`POST /api/phone/code`) |

## Variáveis de ambiente

| Nome | Uso |
|---|---|
| `RESEND_API_KEY` | Chave da API do Resend. Sem ela: simula (dev) ou pula (produção) |
| `PRX_EMAIL_FROM` | Remetente, com domínio verificado no Resend. Padrão `PRX <noreply@prx.app.br>` |
| `PRX_EMAIL_REPLY_TO` | Para onde vão as respostas. Padrão: o e-mail de suporte (`suporte@prx.app.br`) |
| `NEXT_PUBLIC_PRX_SUPPORT_EMAIL` | Contato de suporte no site, nos Termos e no rodapé do e-mail. Padrão `suporte@prx.app.br` |
| `PRX_EMAIL_ASSETS_URL` | De onde o e-mail carrega as imagens de `/email` (padrão: `NEXT_PUBLIC_SITE_URL`, senão `https://prx.viraweb.online`) |
| `WHATSAPP_ACCESS_TOKEN` | Token permanente de um usuário de sistema da conta WhatsApp Business |
| `WHATSAPP_PHONE_NUMBER_ID` | *Phone Number ID* do número remetente (não é o número) |
| `WHATSAPP_OTP_TEMPLATE` | Nome do template de autenticação aprovado. Padrão `prx_codigo_verificacao` |
| `WHATSAPP_TEMPLATE_LANG` | Idioma do template. Padrão `pt_BR` |
| `WHATSAPP_API_VERSION` | Versão da Graph API. Padrão `v23.0` |

## Colocar no ar

1. **Banco:** aplique `supabase/migrations/20260930_prx_notifications.sql` (celular confirmado no perfil, `phone_verifications` e `notification_log`, só service role).
2. **E-mail (Resend):** crie a conta, verifique o domínio `prx.app.br` (registros SPF/DKIM no DNS), gere uma chave com permissão *Sending access* restrita ao domínio e defina `RESEND_API_KEY` na Vercel. O remetente padrão é `noreply@prx.app.br` e as respostas vão para `suporte@prx.app.br`, que precisa existir como caixa de entrada.
3. **WhatsApp (Meta):**
   1. No [WhatsApp Manager](https://business.facebook.com/wa/manage/), com a conta Business verificada, cadastre o número remetente e anote o *Phone Number ID*.
   2. Crie um usuário de sistema com permissão `whatsapp_business_messaging` e gere o token permanente.
   3. Crie o template **`prx_codigo_verificacao`**, categoria **Autenticação**, idioma **Português (BR)**: corpo com o aviso de segurança, rodapé "Este código expira em 10 minutos" e botão **Copiar código**. O app envia o código no corpo e no botão.
   4. Defina `WHATSAPP_ACCESS_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID` na Vercel.
4. **Teste:** entre no painel admin e chame `POST /api/admin/notifications` (envia o e-mail de boas-vindas de teste para o próprio admin). `GET /api/admin/notifications` mostra os canais configurados e os últimos envios.

## E-mail de boas-vindas

- Modelo: `lib/notifications/templates/welcome-email.ts` ("Você entrou. Welcome to PRX."), identidade Obsidian, com versão em texto puro. O rodapé mostra o e-mail de suporte.
- Pré-visualização: `/api/admin/notifications?preview=welcome&nome=Gabi` (`&formato=texto` para o texto puro). Abre sem login no desenvolvimento; em produção pede a sessão do admin.
- Imagens em `public/email/` (PNG/JPG, e-mail não aceita SVG), geradas a partir dos assets da marca por `node scripts/build-email-assets.mjs`. Para trocar a foto do topo ou dos cards, substitua o arquivo de origem no script e gere de novo.
- O selo "Seu saldo inicial: N PRX COINS" só aparece quando `WELCOME_COINS` (`lib/points/repository.ts`) for maior que zero. Hoje é zero.
- Idempotência: a chave `welcome-<id do membro>` impede e-mail duplicado em novas tentativas.

## Código no WhatsApp

- Código de 6 dígitos (`crypto.randomInt`), guardado só como HMAC ligado ao membro e ao número.
- Vale 10 minutos, aceita 5 tentativas e é de uso único; um código novo invalida o anterior.
- Limites: 1 código por minuto e 5 por hora por membro, 10 por hora por IP; 20 conferências a cada 10 minutos.
- Um número confirmado pertence a uma única conta (índice único em `profiles.phone`).
- Rotas: `GET /api/phone` (situação), `POST /api/phone/code` (`{ phone }`), `POST /api/phone/verify` (`{ phone, code }`).

## Registro de envios

`notification_log` guarda canal, modelo, destinatário mascarado (`g***@gmail.com`, `(11) *****-7777`), resultado e o id do provedor. Nunca guarda o conteúdo nem o código.
