<!-- Hello World -->
# Resenha da… no PRX LIVE

Festa com **Host**, **Insiders** e **lista de acesso**. Cada edição é um evento do PRX LIVE da série `resenha`: só por lista, fora da agenda dos membros e sem reserva direta. O acesso vem do link de um Insider, que libera ou recusa quem pedir. Liberado, o pedido vira um **ingresso gratuito** validado na portaria da equipe PRX.

## Como funciona

| Quem | Onde | O que faz |
|---|---|---|
| Admin | `admin.prx.app.br` → aba **Resenha** | Cria a edição (Host, data, local, lotação), adiciona os Insiders com cota de PASSes, abre e fecha a lista e decide pedidos no lugar de qualquer Insider |
| Insider | `insider.prx.app.br` | Vê o link dele, os PASSes que restam e os pedidos que chegaram pelo link. Libera, diz "ainda não" ou remove da lista |
| Convidado | `prx.app.br/resenha/001?i=<código>` | Pede acesso (nome, e-mail, nascimento 18+; WhatsApp e Instagram são opcionais). Acompanha em `/resenha/lista/<token>` |
| Equipe PRX | `staff.prx.app.br` (portaria) | Lê o QR do ingresso. O evento já nasce com "equipe na portaria" ligado |

- **Numeração:** `001`, `002`… é o endereço público e o título: "RESENHA 001 — DA BIA".
- **Hierarquia:** tipo `insider` (elenco fixo) ou `guest` (Guest Insider, muda a cada edição). O Host é só o nome da edição; se ele também for liberar gente, entra como Insider.
- **Cota (PASS):** cada Insider tem N acessos por edição. Quando acaba, acabou; remover alguém da lista devolve o PASS. A cota é conferida de novo depois de emitir o ingresso, então dois cliques no último PASS liberam só um. O admin passa da cota.
- **Lotação:** a do evento vale mais que a cota. Lotou, ninguém mais é liberado.
- **Endereço:** só aparece para quem está na lista (página do convidado e e-mail). A página pública mostra data e cidade.
- **18+:** conferido no servidor pela data de nascimento, no dia da festa e no horário de Brasília.
- **Situação da lista:** `Rascunho` (invisível), `Lista aberta` (recebe pedidos) e `Lista fechada` (não recebe pedidos novos; o Insider ainda decide os pendentes).

## Colocar no ar

1. **Banco:** aplique `supabase/migrations/20261005_prx_resenha.sql` (série `resenha`, modelo de e-mail no registro de envios e as tabelas `resenha_*`, só service role).
2. **Domínio:** na Vercel, adicione `insider.prx.app.br` ao projeto e crie o CNAME no DNS do `prx.app.br`. O `proxy.ts` leva o subdomínio `insider.` para o portal. O mapa completo dos domínios está em [DOMINIOS.md](DOMINIOS.md).
3. **Variável (opcional):** `RESENHA_PUBLIC_URL`. Sem ela, o link sai em `https://prx.app.br` para qualquer host da PRX (o admin, o app e os Insiders veem o mesmo link; em desenvolvimento, o próprio localhost). Só defina para apontar a Resenha para outro domínio.
4. **E-mail:** o aviso "Você tá na lista" usa o Resend (ver [NOTIFICACOES.md](NOTIFICACOES.md)). Sem `RESEND_API_KEY`, o desenvolvimento simula e a produção só registra `skipped`. A página do convidado funciona de qualquer forma.
5. **Operação:** no admin, **Nova edição** (com organizador e política de cancelamento) → **Adicionar Insider** (um por pessoa) → **teste de portaria** em PRX LIVE → Simulação e portaria (ingresso de TESTE lido duas vezes) → mude a situação para **Lista aberta** → copie os links.

Desde 11/10/2026 ([LANCAMENTO.md](LANCAMENTO.md)): a edição e o evento nascem em **rascunho**; abrir a lista publica o evento e só funciona com organizador, política de cancelamento, cidade e local preenchidos. Toda Resenha é **18+ com documento com foto** (regra gravada no evento e mostrada na portaria). Ingressos de teste não contam como acesso liberado nem ocupam lotação.

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

## Convite pelo app (desde 19/10/2026)

Além do link, o Insider convida **membros do app** direto no portal (`insider.prx.app.br` → **Convidar pelo app**), buscando pelo nome ou pelo **ID PRX** da pessoa (PRX-XXXXXX, no Perfil do app, com botão de copiar).

- A Resenha **só aparece no app de quem foi convidado**: card com o logo na Home e a área exclusiva **PRX LIVE → Resenha**. Quem não tem convite não vê nada.
- O convidado recebe uma **notificação no celular** (se ativou em Perfil → Notificações no celular) e **compra o ingresso** no PRX LIVE, no lote do evento: a edição nasce com o lote "Lista" gratuito; para cobrar, ajuste o lote do evento em PRX LIVE → Eventos.
- **Cota:** cada convite ativo ocupa um PASS, somado aos pedidos liberados pelo link. Cancelar o convite devolve o PASS (só antes de a pessoa garantir o ingresso).
- **18+:** menores de idade nem aparecem na busca e não podem ser convidados; a idade é conferida de novo na compra.
- **Lista:** convites só com a lista aberta. Fechar a lista não tira quem já foi convidado.
- **Banco:** migração `20261019_prx_resenha_convites_push.sql` (ID PRX em `profiles.member_code`, `resenha_member_invites` e `push_subscriptions`).

| Rota | Quem | Uso |
|---|---|---|
| `GET /api/insider/members?link=&q=` | Insider | Busca membros por nome (3+ letras) ou ID PRX |
| `GET/POST/DELETE /api/insider/invites` | Insider | Lista, cria e cancela convites |
| `GET /api/live/resenha` | membro | Resenhas para as quais foi convidado + catálogo de Insiders para pedir convite |
| `POST /api/live/resenha` | membro | Pede a um Insider autorização para comprar o convite (`{ link }`) |
| `GET/POST /api/insider/invite-requests` | Insider | Lista e decide (aprovar/recusar) os pedidos feitos pelo app |
| `GET /api/profile/code` | membro | ID PRX da conta |

## Pedido de convite pelo app (desde 01/11/2026)

Quem ainda não foi convidado também pode pedir: em **PRX LIVE → Resenha**, cada edição com a lista aberta mostra o **catálogo de Insiders** (foto e nome). O membro escolhe um e toca em **"Pedir a <nome> para comprar o convite"**.

- O pedido fica **"Aguardando aprovação"** no app (e no card da Home) até o Insider decidir no portal, em **Pedidos pelo app**.
- **Aprovar** = convidar: usa um PASS, libera a compra no PRX LIVE e avisa a pessoa no celular. Insider sem PASS aparece como "Sem convites disponíveis" e não recebe pedidos.
- **Recusar** encerra: **um pedido por pessoa e edição**, a qualquer Insider. Recusado, não dá para pedir de novo nem a outro Insider na mesma edição (índice único `edition_id, user_id`). Na próxima edição, pode pedir de novo.
- Se um Insider convidar direto quem tinha pedido pendente (a ele ou a outro), o pedido fecha como aprovado.
- Se o Insider cancelar o convite depois de aprovar, o app mostra "Convite cancelado" e a pessoa não pede de novo nessa edição.
- **18+:** menor de idade não vê o catálogo (o app avisa que a Resenha é só para maiores de 18).
- O Insider não recebe notificação no celular do pedido (o aviso do celular abre o app, não o portal); o painel se atualiza sozinho a cada 20 s.
- **Banco:** migração `20261101_prx_resenha_pedidos_app.sql` (`resenha_invite_requests`). Sem ela, o catálogo não aparece e o resto da Resenha segue igual.

## Cadastro de Insiders no admin (desde 01/11/2026)

**Admin → PRX LIVE → Resenha → Insiders** é o cadastro central. Cada Insider tem:

- **Foto, nome e @ do Instagram:** aparecem para os membros no catálogo de Insiders da Resenha (sem foto, o app mostra as iniciais).
- **Login do portal** (`insider.prx.app.br`) com **senha individual** gerada pelo sistema: quatro palavras fáceis + dois números, ex.: `Lobo-Mel-Pipa-Rio-47` (~38 bits, com trava de 10 tentativas por minuto no login). Aparece **uma única vez** no admin, com botão de copiar.
- Ações: **Editar** (foto, nome, @), **Nova senha** (a anterior deixa de valer na hora) e **Desativar/Reativar**.

Depois de cadastrado, o Insider entra em uma edição por **Adicionar Insider** (digite o e-mail e escolha o cadastrado; o formulário sugere os ativos) com a cota de PASSes.

- **Banco:** migração `20261101_prx_resenha_insiders_foto.sql` (`resenha_insiders.avatar_url`). Sem ela, salvar com foto falha; o resto funciona.
- Ações novas em `POST /api/admin/resenha`: `create_insider`, `update_insider`, `reset_insider_password`.
