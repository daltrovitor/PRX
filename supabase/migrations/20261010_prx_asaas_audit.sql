-- Hello World
-- ============================================================================
-- PRX BANK × ASAAS: auditoria das chamadas e verificação cadastral (10/10/2026)
--
-- 1. asaas_api_requests: cada chamada do PRX ao Asaas (o que foi enviado, o que
--    voltou, quanto tempo levou), já sem segredos e com dados pessoais
--    mascarados. Só a service role lê e escreve (painel admin via API).
-- 2. bank_subaccounts: situação cadastral por dimensão, como o Asaas informa
--    (dados comerciais, conta bancária, documentação e aprovação geral), o
--    instante dessa informação (evento antigo não sobrescreve um novo) e o
--    andamento dos documentos. Uma subconta criada no Asaas pode ficar sem a
--    apiKey (resposta perdida): o id é guardado assim mesmo, para nunca abrir
--    uma segunda conta.
-- 3. bank_webhooks_log: número de tentativas de processamento (reprocessamento).
-- 4. bank_outgoing_requests: resultado desconhecido (sem resposta do Asaas).
-- 5. bank_provisioning_log: novas etapas e o desfecho "recovered".
--
-- Incremental e idempotente: nada é apagado. Aplique depois de
-- 20261008_prx_bank_provisioning_log.sql.
-- ============================================================================

begin;

-- 1. CHAMADAS AO ASAAS ------------------------------------------------------------------
create table if not exists public.asaas_api_requests (
  id uuid primary key,
  correlation_id uuid not null,
  user_id uuid references auth.users(id) on delete set null,
  asaas_account_id text,
  environment text not null check (environment in ('sandbox', 'production')),
  operation text not null check (char_length(operation) <= 80),
  business_ref text check (business_ref is null or char_length(business_ref) <= 120),
  method text not null check (method in ('GET', 'POST', 'PUT', 'DELETE')),
  path text not null check (char_length(path) <= 300),
  query jsonb,
  auth text not null check (auth in ('master', 'subaccount', 'none')),
  request_body jsonb,
  started_at timestamptz not null default now(),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  http_status integer,
  response_body jsonb,
  error_code text check (error_code is null or char_length(error_code) <= 120),
  error_description text check (error_description is null or char_length(error_description) <= 1000),
  outcome text not null check (outcome in ('pending', 'success', 'http_error', 'rate_limited', 'timeout', 'network_error', 'invalid_response', 'not_sent')),
  attempts integer not null default 0 check (attempts >= 0),
  asaas_resource_id text check (asaas_resource_id is null or char_length(asaas_resource_id) <= 120),
  response_received boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists asaas_api_requests_started_idx on public.asaas_api_requests(started_at desc);
create index if not exists asaas_api_requests_user_idx on public.asaas_api_requests(user_id, started_at desc);
create index if not exists asaas_api_requests_operation_idx on public.asaas_api_requests(operation, started_at desc);
create index if not exists asaas_api_requests_outcome_idx on public.asaas_api_requests(outcome, started_at desc);
create index if not exists asaas_api_requests_correlation_idx on public.asaas_api_requests(correlation_id);
create index if not exists asaas_api_requests_resource_idx on public.asaas_api_requests(asaas_resource_id) where asaas_resource_id is not null;
create index if not exists asaas_api_requests_business_idx on public.asaas_api_requests(business_ref) where business_ref is not null;

alter table public.asaas_api_requests enable row level security;
revoke all on public.asaas_api_requests from anon, authenticated;

-- 2. SITUAÇÃO CADASTRAL DA SUBCONTA ----------------------------------------------------------
-- Antes: subconta com id exigia a chave. Agora o id fica mesmo sem a chave (gerada depois pelo admin).
alter table public.bank_subaccounts drop constraint if exists bank_subaccounts_created_has_key;

alter table public.bank_subaccounts
  add column if not exists general_status text check (general_status in ('PENDING', 'AWAITING_APPROVAL', 'APPROVED', 'REJECTED')),
  add column if not exists documentation_status text check (documentation_status in ('PENDING', 'AWAITING_APPROVAL', 'APPROVED', 'REJECTED')),
  add column if not exists commercial_info_status text check (commercial_info_status in ('PENDING', 'AWAITING_APPROVAL', 'APPROVED', 'REJECTED')),
  add column if not exists bank_account_info_status text check (bank_account_info_status in ('PENDING', 'AWAITING_APPROVAL', 'APPROVED', 'REJECTED')),
  -- Aviso anual dos dados comerciais (ACCOUNT_STATUS_COMMERCIAL_INFO_EXPIRING_SOON / _EXPIRED).
  add column if not exists commercial_info_alert text check (commercial_info_alert in ('EXPIRING_SOON', 'EXPIRED')),
  -- Instante da última situação aplicada (dateCreated do evento ou hora da consulta).
  add column if not exists status_updated_at timestamptz,
  -- Quando o Asaas confirmou a criação: os documentos só são consultados 15 s depois.
  add column if not exists account_created_at timestamptz,
  add column if not exists documents_synced_at timestamptz,
  -- Membro avisado de que precisa enviar documento/selfie pelo link do Asaas.
  add column if not exists onboarding_notified_at timestamptz;

-- 3. WEBHOOKS: TENTATIVAS -------------------------------------------------------------------------
alter table public.bank_webhooks_log add column if not exists attempts integer not null default 0;

-- 4. SAÍDAS COM RESULTADO DESCONHECIDO --------------------------------------------------------------
alter table public.bank_outgoing_requests add column if not exists outcome_unknown boolean not null default false;
create index if not exists bank_outgoing_requests_open_idx on public.bank_outgoing_requests(created_at)
  where status in ('requested', 'approved');

-- 5. REGISTRO DA ABERTURA: NOVAS ETAPAS -------------------------------------------------------------
alter table public.bank_provisioning_log drop constraint if exists bank_provisioning_log_step_check;
alter table public.bank_provisioning_log add constraint bank_provisioning_log_step_check
  check (step in ('account', 'documents', 'status', 'webhooks', 'api_key'));
alter table public.bank_provisioning_log drop constraint if exists bank_provisioning_log_outcome_check;
alter table public.bank_provisioning_log add constraint bank_provisioning_log_outcome_check
  check (outcome in ('sent', 'failed', 'uncertain', 'blocked', 'recovered'));

-- Visão por membro: acrescenta as dimensões no fim (create or replace só aceita colunas novas no fim).
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
  l.created_at as enviado_em,
  s.general_status as aprovacao_geral,
  s.documentation_status as documentacao,
  s.commercial_info_status as dados_comerciais,
  s.api_key is not null as tem_chave_da_subconta,
  s.status_updated_at as situacao_em
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

-- ----------------------------------------------------------------------------
-- Conferência (somente leitura):
--   select operation, outcome, http_status, count(*) from public.asaas_api_requests
--     where started_at > now() - interval '7 days' group by 1, 2, 3 order by 4 desc;
--   select * from public.asaas_api_requests where operation = 'account.create' order by started_at desc limit 20;
--   select * from public.bank_onboarding_status order by cadastro_em desc;
-- ----------------------------------------------------------------------------
