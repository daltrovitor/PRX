<!-- Hello World -->
# Domínios da PRX

Tudo vive na zona `prx.app.br`. O mapa fica em `lib/domains.ts` (uma fonte só) e o roteamento em `proxy.ts`.

| Endereço | O que abre |
|---|---|
| `prx.app.br` | Teaser "em breve" com a Lista VIP. Também serve `/termos`, `/privacidade` e `/resenha/...` |
| `teste.prx.app.br` | O aplicativo: cadastro, login e tudo o mais. Abertas: `/sou-pai`, `/termos`, `/privacidade`, `/teste` |
| `admin.prx.app.br` | Painel administrativo |
| `partner.prx.app.br` | Portal do parceiro |
| `staff.prx.app.br` | Equipe PRX (portaria dos eventos e balcão) |
| `insider.prx.app.br` | Portal dos Insiders da Resenha |
| `show.prx.app.br` | Apresentação do ecossistema |

- **`/api/*` responde em todos os domínios.** Webhooks (Asaas) e o login Google não dependem do subdomínio do app.
- **Endereços antigos:** `adminprx.`, `adminng.`, `partnerprx.`, `partnerng.`, `staffprx.` e `show.` (inclusive `show.viraweb.online`) continuam abrindo os portais enquanto o DNS antigo existir. Os links gerados a partir deles já apontam para o domínio novo.
- **Desenvolvimento:** `localhost:3100` é o app; `admin.localhost:3100`, `partner.localhost:3100`, `staff.localhost:3100`, `insider.localhost:3100` e `show.localhost:3100` são os portais (o Chrome resolve `*.localhost` sozinho).

## Colocar no ar

1. **DNS (zona `prx.app.br`):** crie um CNAME para `teste`, `admin`, `partner`, `staff`, `insider` e `show`, todos para o destino que a Vercel indicar (o apex `prx.app.br` já aponta para lá).
2. **Vercel → Domains:** adicione os seis domínios ao projeto.
3. **Variáveis na Vercel** (depois, faça um novo deploy: as `NEXT_PUBLIC_*` entram no build):
   - `NEXT_PUBLIC_SITE_URL=https://teste.prx.app.br`: links entre painéis e o app, e-mails e metadados.
   - `NEXT_PUBLIC_APP_URL`: base dos webhooks do Asaas. Pode continuar `https://prx.app.br`, o `/api/*` responde lá.
   - `RESENHA_PUBLIC_URL`: opcional, sem ela o link da Resenha já sai em `https://prx.app.br`.
   - `PRX_WEBAUTHN_RP_ID` e `PRX_WEBAUTHN_ORIGINS`: se existirem apontando para o domínio antigo, apague. Em `prx.app.br` o RP ID já é `prx.app.br`.
4. **Supabase → Authentication → URL Configuration:** Site URL `https://teste.prx.app.br` e, em Redirect URLs, `https://teste.prx.app.br/**`. O Google volta para o domínio de onde o login começou.
5. **Google no endereço do PRX (opcional):** para a tela do Google mostrar o PRX em vez do endereço do Supabase, siga [LOGIN_GOOGLE.md](LOGIN_GOOGLE.md) (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e a URI `https://teste.prx.app.br/auth/callback` no Google Cloud).

## O que muda para quem já usa

- **Sessões:** o cookie `prx_session` é por domínio, então cada endereço novo pede login de novo.
- **Biometria (passkeys):** o navegador prende a chave ao domínio. As cadastradas no endereço antigo não valem; é só cadastrar de novo em `teste.prx.app.br`. O RP ID em `prx.app.br` é o domínio (não o subdomínio), então a biometria nova continua valendo se o app mudar de subdomínio ou for para o apex. Em localhost e previews o RP ID continua sendo o host.
- **App instalado (PWA) e tema:** pertencem ao endereço onde foram criados. Instale de novo em `teste.prx.app.br`.

## Trocar o endereço do app

O host do app é `APP_HOST` em `lib/domains.ts`; o apex como teaser está em `isTeaserHost` (`proxy.ts`). Para o app assumir o apex, troque os dois e as variáveis acima.
