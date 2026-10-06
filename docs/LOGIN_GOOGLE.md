<!-- Hello World -->
# Login com o Google no endereço do PRX

Com o Supabase no meio, a tela do Google mostra o endereço do projeto (`xxxx.supabase.co`). No login direto, o app fala com o Google e a tela mostra o endereço do PRX.

## Como funciona

1. "Continuar com Google" chama `POST /api/auth/google/start`. Com as chaves no servidor, a resposta traz o endereço do Google e o app segue para ele (state, nonce e PKCE num cookie assinado e httpOnly). Sem as chaves, o app usa o Supabase como antes.
2. O Google volta em `/auth/callback`. O app troca o código pelo token direto com o Google, confere emissor, destinatário, validade, nonce e e-mail verificado, e procura o cadastro pelo e-mail.
3. Cadastro completo entra. O resto vira cadastro pendente (CPF, celular, nascimento e aceite). Nada é gravado antes disso: nem acesso, nem perfil. Só a conclusão cria a conta e manda o e-mail de boas-vindas.

Quem já tinha conta entra igual: o app acha o cadastro pelo e-mail. O código está em `lib/google-oauth.ts` e `lib/google-direct.ts`.

## O que fazer (só você consegue)

1. **Google Cloud Console → APIs e serviços → Credenciais:** abra o cliente OAuth do tipo "Aplicativo da Web" que o Supabase já usa (ou crie um).
2. **URIs de redirecionamento autorizadas:** acrescente `https://teste.prx.app.br/auth/callback`. Se o app abrir em outros endereços, um por endereço. Para testar no computador: `http://localhost:3100/auth/callback`. Tem de ser exatamente igual (https, sem barra no fim). Pode manter a do Supabase.
3. **Vercel → Environment Variables:** `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` (os dois valores desse cliente). Depois, novo deploy.
4. **Tela de consentimento (Branding):** nome "PRX", logo, domínio autorizado `prx.app.br`, e-mail de suporte, links dos Termos e da Política de Privacidade, e publique ("Em produção"). Até o Google verificar a marca, a tela pode mostrar o endereço `teste.prx.app.br` no lugar do nome.
5. Deixe o provedor Google ligado no Supabase: ele continua valendo se as chaves forem removidas.

## Como saber que está valendo

Ao clicar em "Continuar com Google", a barra de endereço vai para `accounts.google.com` com `redirect_uri=https://teste.prx.app.br/auth/callback` e o seletor de contas mostra o endereço do PRX (ou o nome, depois da verificação da marca).

## Se der problema

- **`redirect_uri_mismatch` no Google:** a URI do passo 2 não está cadastrada igual ao endereço aberto.
- **Voltou para a página inicial sem entrar:** a Vercel registra `[google] login recusado: ...` com o motivo (código recusado, token de outra tentativa, e-mail não verificado).
- **Não abre o Google do PRX:** falta `GOOGLE_CLIENT_ID` ou `GOOGLE_CLIENT_SECRET` no ambiente em uso (o app cai no Supabase sem avisar).

A chave secreta só existe no servidor e nunca vai ao navegador.
