<!-- Hello World -->
# Mensagens de erro do PRX

Regra para todo o site:

- **A pessoa resolve na tela** (dado faltando, saldo, chave Pix errada, CEP, sem internet, muitas tentativas): frase simples dizendo o que fazer, sem termo técnico. Ex.: "Não encontramos essa chave Pix. Confira e tente de novo."
- **Erro técnico** (servidor, banco de dados, Asaas recusou, configuração, bug): a tela mostra só
  `Deu um erro ao fazer isso. Fale com o suporte e informe o código BNK-7K3F9Q.`
  O motivo nunca aparece na tela.

## Código do erro

- Formato `ÁREA-XXXXXX`: `BNK` banco, `AUT` login e cadastro, `ADM` admin, `PAR` parceiro, `STF` equipe, `LIV` eventos, `PAS` PRX Pass, `PTS` coins, `FAM` família, `INS` insiders, `RES` Resenha, `TEL` tela que quebrou no navegador, `PRX` outros. `REQ-...` = o servidor não respondeu (o código é o fim do id da chamada na Vercel).
- **Onde achar o detalhe**: Admin logado → abrir `https://admin.prx.app.br/api/admin/incidents?code=BNK-7K3F9Q` (rota, ação, motivo sem dados pessoais, membro, versão publicada). Também nos logs da Vercel: procure pelo código (linha JSON `"event":"app.incident"`).
- A tabela `app_incidents` vem da migração `supabase/migrations/20261013_prx_app_incidents.sql` (aplique no SQL Editor). Sem ela, o detalhe fica só nos logs da Vercel.

## No código

- Rotas: `errorResponse` / `familyErrorResponse` já aplicam a regra. `PartnerError` 4xx = frase para a pessoa; `PartnerError` 5xx, `TechnicalError` e qualquer outra exceção = código (`lib/incidents.ts`). Para um erro técnico com motivo: `throw new TechnicalError("o que aconteceu, para o suporte", status)`.
- Validação: as frases do schema (em português) aparecem; a mensagem padrão do zod (em inglês) vira erro técnico, porque só acontece quando o app manda dado errado.
- Asaas: `toPartnerError` só deixa passar recusas que a pessoa resolve (saldo, chave, código Pix, boleto, limite, CEP); o resto vira código.
- Navegador: `lib/client-errors.ts` troca respostas 5xx sem JSON da API por "Deu um erro…" com código, e `app/error.tsx` / `app/global-error.tsx` fazem o mesmo quando uma tela quebra.
