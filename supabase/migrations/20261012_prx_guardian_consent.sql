-- ============================================================================
-- PRX LIVE — LIBERAÇÃO DO RESPONSÁVEL LEGAL PARA MENORES DE 18 ANOS (12/10/2026)
--
-- Quem é menor de idade no dia do evento informa o e-mail do responsável na
-- compra; o responsável recebe um link e libera (ou recusa) a entrada daquele
-- ingresso. O registro fica no próprio ingresso, na coluna guardian_consent:
-- status, token do link, dados do responsável, IP e horário da resposta.
--
-- Só ADICIONA uma coluna e um índice e amplia a lista de modelos do registro de
-- envios. Idempotente. Antes desta migração o app segue vendendo para maiores de
-- idade; a compra de menores avisa que falta aplicá-la. Todo acesso passa pelas
-- rotas /api com a service role: anon e authenticated não leem nem escrevem aqui.
-- ============================================================================

begin;

-- 1. Liberação do responsável, dentro do ingresso -------------------------------------
alter table public.live_tickets
  -- { guardianEmail, status: pending|approved|rejected, token, guardianName,
  --   guardianCpf, relationship, guardianPhone, respondedAt, rejectionReason, ip, userAgent }
  -- null = comprador maior de idade (nada a liberar).
  add column if not exists guardian_consent jsonb;

-- O link do e-mail chega com o token: a consulta é sempre por ele.
create index if not exists live_tickets_guardian_token_idx
  on public.live_tickets ((guardian_consent ->> 'token'))
  where guardian_consent is not null;

-- 2. Modelo do e-mail ao responsável no registro de envios -----------------------------
alter table public.notification_log drop constraint if exists notification_log_template_check;
alter table public.notification_log
  add constraint notification_log_template_check
  check (template in ('welcome_email', 'phone_code', 'resenha_list', 'minor_event_authorization'));

commit;
