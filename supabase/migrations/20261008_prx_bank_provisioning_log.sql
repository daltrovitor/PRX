-- Hello World
-- ============================================================================
-- PRX BANK: registro de cada envio do cadastro ao Asaas (08/10/2026)
--
-- O membro não vê erros do Asaas. Cada tentativa de abrir a subconta (e de
-- enviar os documentos) fica aqui, só para o admin (service role).
--   outcome: sent (Asaas aceitou) · failed (recusou / PRX falhou)
--            uncertain (sem resposta) · blocked (o PRX nem enviou)
--
-- Consulta rápida no SQL Editor:
--   select * from bank_onboarding_status order by cadastro_em desc;
-- ============================================================================

begin;

create table if not exists public.bank_provisioning_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  environment text not null check (environment in ('sandbox', 'production')),
  step text not null check (step in ('account', 'documents')),
  outcome text not null check (outcome in ('sent', 'failed', 'uncertain', 'blocked')),
  asaas_account_id text,
  detail text check (detail is null or char_length(detail) <= 1000),
  created_at timestamptz not null default now()
);

create index if not exists bank_provisioning_log_user_idx on public.bank_provisioning_log(user_id, created_at desc);
create index if not exists bank_provisioning_log_recent_idx on public.bank_provisioning_log(created_at desc);

alter table public.bank_provisioning_log enable row level security;
revoke all on public.bank_provisioning_log from anon, authenticated;

-- Uma linha por membro: último cadastro, situação da subconta e último envio.
create or replace view public.bank_onboarding_status
with (security_invoker = true) as
select
  k.user_id,
  k.email,
  k.full_name,
  k.status as cadastro,
  k.created_at as cadastro_em,
  s.environment,
  s.status as conta,
  s.kyc_status as analise_asaas,
  s.reject_reason as motivo_recusa,
  s.asaas_account_id is not null as chegou_no_asaas,
  l.step as ultimo_envio,
  l.outcome as resultado,
  l.detail as detalhe,
  l.created_at as enviado_em
from (
  select distinct on (user_id) user_id, email, full_name, status, created_at
  from public.bank_kyc_applications
  order by user_id, created_at desc
) k
left join public.bank_subaccounts s on s.id = k.user_id
left join lateral (
  select p.step, p.outcome, p.detail, p.created_at
  from public.bank_provisioning_log p
  where p.user_id = k.user_id
  order by p.created_at desc
  limit 1
) l on true;

revoke all on public.bank_onboarding_status from anon, authenticated;

commit;
