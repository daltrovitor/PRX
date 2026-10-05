<!-- Hello World -->
# Resenha da… no PRX LIVE

Festa com **Host**, **Insiders** e **lista de acesso**. Cada edição é um evento do PRX LIVE da série `resenha`: só por lista, fora da agenda dos membros e sem reserva direta. O acesso vem do link de um Insider, que libera ou recusa quem pedir. Liberado, o pedido vira um **ingresso gratuito** validado na portaria da equipe PRX.

## Como funciona

| Quem | Onde | O que faz |
|---|---|---|
| Admin | `adminprx` → aba **Resenha** | Cria a edição (Host, data, local, lotação), adiciona os Insiders com cota de PASSes, abre e fecha a lista e decide pedidos no lugar de qualquer Insider |
| Insider | `insider.prx.app.br` | Vê o link dele, os PASSes que restam e os pedidos que chegaram pelo link. Libera, diz "ainda não" ou remove da lista |
| Convidado | `prx.app.br/resenha/001?i=<código>` | Pede acesso (nome, e-mail, nascimento 18+; WhatsApp e Instagram são opcionais). Acompanha em `/resenha/lista/<token>` |
| Equipe PRX | `staffprx` (portaria) | Lê o QR do ingresso. O evento já nasce com "equipe na portaria" ligado |

- **Numeração:** `001`, `002`… é o endereço público e o título: "RESENHA 001 — DA BIA".
- **Hierarquia:** tipo `insider` (elenco fixo) ou `guest` (Guest Insider, muda a cada edição). O Host é só o nome da edição; se ele também for liberar gente, entra como Insider.
- **Cota (PASS):** cada Insider tem N acessos por edição. Quando acaba, acabou; remover alguém da lista devolve o PASS. A cota é conferida de novo depois de emitir o ingresso, então dois cliques no último PASS liberam só um. O admin passa da cota.
- **Lotação:** a do evento vale mais que a cota. Lotou, ninguém mais é liberado.
- **Endereço:** só aparece para quem está na lista (página do convidado e e-mail). A página pública mostra data e cidade.
- **18+:** conferido no servidor pela data de nascimento, no dia da festa e no horário de Brasília.
- **Situação da lista:** `Rascunho` (invisível), `Lista aberta` (recebe pedidos) e `Lista fechada` (não recebe pedidos novos; o Insider ainda decide os pendentes).

## Colocar no ar

1. **Banco:** aplique `supabase/migrations/20261005_prx_resenha.sql` (série `resenha`, modelo de e-mail no registro de envios e as tabelas `resenha_*`, só service role).
2. **Domínio:** na Vercel, adicione `insider.prx.app.br` ao projeto e crie o CNAME no DNS do `prx.app.br`. O `proxy.ts` leva o subdomínio `insider.` para o portal.
3. **Variável (recomendado):** `RESENHA_PUBLIC_URL=https://prx.app.br`. Sem ela, o link sai do host de quem pediu (`insider.prx.app.br` → `prx.app.br`; painéis do admin viram `prx.<domínio>`). Com ela, o link é o mesmo para o admin e para os Insiders.
4. **E-mail:** o aviso "Você tá na lista" usa o Resend (ver [NOTIFICACOES.md](NOTIFICACOES.md)). Sem `RESEND_API_KEY`, o desenvolvimento simula e a produção só registra `skipped`. A página do convidado funciona de qualquer forma.
5. **Operação:** no admin, **Nova edição** → **Adicionar Insider** (um por pessoa) → mude a situação para **Lista aberta** → copie os links.

## Acesso dos Insiders

O Insider é uma **conta PRX comum** (nenhum papel novo em `profiles`). Quem libera o acesso é o cadastro em `resenha_insiders`:

- **Criar acesso:** cria o login com senha temporária, mostrada uma única vez ao admin. O app ainda **não tem troca de senha** pelo próprio usuário; a redefinição é pelo suporte.
- **Vincular conta existente:** usa a conta PRX que a pessoa já tem.
- **Pausar:** por edição (aba Resenha) ou em todas (`set_insider_active`). Pausado, o link para de valer e o portal nega o acesso na hora.

## Rotas

| Rota | Quem | Uso |
|---|---|---|
| `GET /api/resenha/<edição>?i=<código>` | público | Edição e Insider do link (sem o endereço) |
| `POST /api/resenha/<edição>/request` | público, 6 por 10 min por IP e 3 por hora por e-mail | Pedido de acesso |
| `GET /api/resenha/lista/<token>` | quem tem o token | Situação do pedido; endereço e QR só liberado |
| `POST /api/insider/login` | público | Entrada do Insider (sessão de 7 dias, só no subdomínio) |
| `GET /api/insider/me`, `GET /api/insider/requests?link=` | Insider | Resenhas, cota e pedidos do próprio link |
| `POST /api/insider/requests/<id>` | Insider | `approve`, `reject` ou `revoke` |
| `GET/POST /api/admin/resenha` | admin | Edições, Insiders, cotas, e decidir pedidos |

## Privacidade (LGPD)

O pedido guarda nome, e-mail, nascimento e, se informados, WhatsApp e Instagram, com o aceite registrado em `consent_at`. Só o Insider dono do link e o admin veem esses dados. O token da página do convidado é aleatório (24 bytes). Pedidos de quem não entrou continuam no banco: defina o prazo de descarte com o jurídico.

## Fora do escopo desta versão

Botons, lounges com nome, "A Chegada", "Who's next?", Pass digital individual além da cota e troca de senha pelo Insider.
