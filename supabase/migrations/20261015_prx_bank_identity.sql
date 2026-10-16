-- Hello World
-- ============================================================================
-- PRX BANK: cofre da subconta, verificação de identidade da PRX e liberação
-- da conta para maiores de 29 anos (15/10/2026)
--
-- 1. bank_subaccount_vault: quando o cadastro de um membro é excluído, a
--    subconta do Asaas continua existindo (ligada ao CPF) e a chave dela só é
--    entregue uma vez. O gatilho guarda a chave (já cifrada) antes de apagar a
--    linha; no novo cadastro do mesmo CPF, a subconta é religada COM a chave.
--    bank_subaccounts passa a ser apagada junto com o usuário (on delete
--    cascade) para a exclusão pelo painel do Supabase funcionar; quem já
--    movimentou dinheiro continua protegido por bank_outgoing_requests.
-- 2. Verificação de identidade da PRX: cada documento da abertura (frente,
--    verso, selfie, certidão) é aprovado ou recusado pela equipe, com motivo;
--    a pessoa reenvia só o que foi recusado. bank_kyc_events guarda o
--    histórico (quem, o quê, quando), inclusive cada abertura de documento.
-- 3. bank_access_grants: o PRX é para jovens até 29 anos; o admin libera a
--    abertura do PRX BANK para pessoas específicas acima disso. A liberação é
--    só uma condição a mais: identidade, análise e banco parceiro continuam.
--
-- Só a service role lê e escreve (RLS ligada, sem políticas). Idempotente.
-- Aplique depois de 20261013_prx_app_incidents.sql.
-- ============================================================================
begin;

-- 1. COFRE DA SUBCONTA ------------------------------------------------------------------
create table if not exists public.bank_subaccount_vault (
  asaas_account_id text primary key,
  environment text not null check (environment in ('sandbox', 'production')),
  wallet_id text,
  -- Mesma cifra de bank_subaccounts.api_key (v1:kid:iv:tag:dados). Nunca em texto puro.
  api_key text check (api_key is null or api_key ~ '^v1:[a-z]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$'),
  agency text,
  account_number text,
  -- Sem chave estrangeira: o usuário de origem já foi excluído.
  former_user_id uuid,
  archived_at timestamptz not null default now(),
  adopted_by uuid references auth.users(id) on delete set null,
  adopted_at timestamptz
);

alter table public.bank_subaccount_vault enable row level security;
revoke all on public.bank_subaccount_vault from anon, authenticated;

create or replace function public.bank_subaccounts_archive() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.asaas_account_id is not null then
    insert into public.bank_subaccount_vault (asaas_account_id, environment, wallet_id, api_key, agency, account_number, former_user_id, archived_at, adopted_by, adopted_at)
    values (old.asaas_account_id, old.environment, old.wallet_id, old.api_key, old.agency, old.account_number, old.id, now(), null, null)
    on conflict (asaas_account_id) do update set
      environment = excluded.environment,
      wallet_id = coalesce(excluded.wallet_id, public.bank_subaccount_vault.wallet_id),
      api_key = coalesce(excluded.api_key, public.bank_subaccount_vault.api_key),
      agency = coalesce(excluded.agency, public.bank_subaccount_vault.agency),
      account_number = coalesce(excluded.account_number, public.bank_subaccount_vault.account_number),
      former_user_id = excluded.former_user_id,
      archived_at = now(),
      adopted_by = null,
      adopted_at = null;
  end if;
  return old;
end;
$$;

drop trigger if exists bank_subaccounts_archive_on_delete on public.bank_subaccounts;
create trigger bank_subaccounts_archive_on_delete
  before delete on public.bank_subaccounts
  for each row execute function public.bank_subaccounts_archive();

-- A linha da subconta sai junto com o usuário (o gatilho acima guarda a chave antes).
do $$
declare
  fk text;
begin
  select c.conname into fk
    from pg_constraint c
   where c.conrelid = 'public.bank_subaccounts'::regclass
     and c.contype = 'f'
     and c.confrelid = 'auth.users'::regclass
   limit 1;
  if fk is not null then
    execute format('alter table public.bank_subaccounts drop constraint %I', fk);
  end if;
  alter table public.bank_subaccounts
    add constraint bank_subaccounts_user_fk foreign key (id) references auth.users(id) on delete cascade;
end $$;

-- 2. VERIFICAÇÃO DE IDENTIDADE DA PRX ------------------------------------------------------
-- document_reviews: { "<tipo do documento>": { status: received|approved|rejected, reason, reviewedBy, reviewedAt, receivedAt } }
alter table public.bank_kyc_applications add column if not exists document_reviews jsonb not null default '{}'::jsonb;
alter table public.bank_kyc_applications add column if not exists resubmission_requested_at timestamptz;
-- Documentos apagados pela política de retenção (os dados cadastrais ficam).
alter table public.bank_kyc_applications add column if not exists documents_purged_at timestamptz;

create table if not exists public.bank_kyc_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.bank_kyc_applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  actor text not null check (char_length(actor) between 1 and 200),
  actor_role text not null check (actor_role in ('member', 'admin', 'system')),
  action text not null check (action in (
    'submitted', 'document_resubmitted', 'document_approved', 'document_rejected', 'document_viewed',
    'resubmission_requested', 'approved', 'rejected', 'documents_purged'
  )),
  document_kind text,
  detail text not null default '' check (char_length(detail) <= 1000),
  created_at timestamptz not null default now()
);

create index if not exists bank_kyc_events_app_idx on public.bank_kyc_events(application_id, created_at desc);
create index if not exists bank_kyc_events_user_idx on public.bank_kyc_events(user_id, created_at desc);

alter table public.bank_kyc_events enable row level security;
revoke all on public.bank_kyc_events from anon, authenticated;

-- 3. LIBERAÇÃO DO PRX BANK PARA MAIORES DE 29 ANOS --------------------------------------------
create table if not exists public.bank_access_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Data de nascimento conferida no momento da liberação (perfil ou identidade da conta).
  birth_date date not null,
  age_at_grant integer not null check (age_at_grant > 29),
  note text not null default '' check (char_length(note) <= 500),
  granted_by text not null,
  granted_at timestamptz not null default now(),
  revoked_by text,
  revoked_at timestamptz,
  revoke_note text not null default '' check (char_length(revoke_note) <= 500)
);

-- Uma liberação vigente por pessoa; as revogadas ficam como histórico.
create unique index if not exists bank_access_grants_active on public.bank_access_grants(user_id) where revoked_at is null;
create index if not exists bank_access_grants_user_idx on public.bank_access_grants(user_id, granted_at desc);

alter table public.bank_access_grants enable row level security;
revoke all on public.bank_access_grants from anon, authenticated;

commit;
