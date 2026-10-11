-- ============================================================================
-- PRX — PREPARAÇÃO PARA O LANÇAMENTO (11/10/2026)
--
-- 1. PRX LIVE: idade mínima e condições de entrada POR EVENTO, política de
--    cancelamento, organizador e o "teste de portaria" verificado.
-- 2. Ingressos de teste (is_test) e preço com desconto (cupom/link).
-- 3. Cupons e links de divulgação com limite de uso, por pessoa e validade.
-- 4. Registro de validações (aceitas e recusadas) da portaria e do balcão.
-- 5. Registro de auditoria do admin.
-- 6. Data de nascimento conferida na conta (base das regras de idade).
-- 7. PRX Founders: encontros, startups e atualizações.
-- 8. Diretório de membros para o admin: busca, filtros e paginação no banco.
--
-- Só ADICIONA colunas, tabelas, índices e uma view: nada é apagado ou
-- reescrito. Idempotente. O app funciona antes e depois desta migração (as
-- telas novas avisam que falta aplicá-la). Todo acesso passa pelas rotas /api
-- com a service role: anon e authenticated não leem nem escrevem aqui.
-- ============================================================================

begin;

create extension if not exists "pgcrypto";
create extension if not exists pg_trgm;

-- 1. Regras de entrada por evento ---------------------------------------------------
alter table public.live_events
  -- null = ainda não definida (o evento não pode ser publicado); 0 = livre.
  add column if not exists min_age integer check (min_age is null or min_age between 0 and 21),
  add column if not exists id_check_required boolean not null default false,
  add column if not exists entry_requirements text,
  add column if not exists cancellation_policy text,
  add column if not exists organizer_name text,
  add column if not exists door_test_verified_at timestamptz,
  add column if not exists door_test_verified_by text;

-- 2. Ingressos de teste e desconto ----------------------------------------------------
alter table public.live_tickets
  add column if not exists is_test boolean not null default false,
  add column if not exists original_price numeric(10, 2) check (original_price is null or original_price >= 0),
  add column if not exists discount numeric(10, 2) not null default 0 check (discount >= 0),
  add column if not exists promo_code_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'live_tickets_discount_le_original') then
    alter table public.live_tickets
      add constraint live_tickets_discount_le_original check (original_price is null or discount <= original_price);
  end if;
  -- Ingresso de teste nunca é receita: não tem pagamento confirmado.
  if not exists (select 1 from pg_constraint where conname = 'live_tickets_test_not_paid') then
    alter table public.live_tickets
      add constraint live_tickets_test_not_paid check (not is_test or paid_at is null);
  end if;
end $$;

create index if not exists live_tickets_event_real_idx on public.live_tickets(event_id, status, created_at, id) where not is_test;
create index if not exists live_tickets_test_idx on public.live_tickets(event_id) where is_test;

-- 3. Cupons e links de divulgação -------------------------------------------------------
create table if not exists public.live_promo_codes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.live_events(id) on delete restrict,
  code text not null unique check (code ~ '^[A-Z0-9][A-Z0-9-]{2,31}$'),
  label text not null default '',
  kind text not null check (kind in ('percent', 'fixed')),
  value numeric(10, 2) not null check (value > 0),
  -- null = vale para todos os lotes pagos do evento.
  batch_ids text[],
  starts_at timestamptz,
  ends_at timestamptz,
  max_uses integer check (max_uses is null or max_uses > 0),
  per_user_limit integer not null default 1 check (per_user_limit between 1 and 20),
  active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint live_promo_percent_range check (kind <> 'percent' or value <= 100),
  constraint live_promo_window check (starts_at is null or ends_at is null or ends_at > starts_at)
);

create index if not exists live_promo_codes_event_idx on public.live_promo_codes(event_id, created_at desc);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'live_tickets_promo_fk') then
    alter table public.live_tickets
      add constraint live_tickets_promo_fk foreign key (promo_code_id) references public.live_promo_codes(id) on delete restrict;
  end if;
end $$;

-- Uso do cupom = ingressos ativos (não teste) com ele, na ordem de criação.
create index if not exists live_tickets_promo_idx on public.live_tickets(promo_code_id, status, created_at, id) where promo_code_id is not null;

-- 4. Registro de validações (portaria e balcão) -------------------------------------------
create table if not exists public.validation_log (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('ticket', 'voucher')),
  action text not null check (action in ('lookup', 'confirm')),
  outcome text not null check (outcome in ('accepted', 'refused')),
  reason text,
  code text,
  ref_id text,
  event_id uuid,
  partner_id text,
  is_test boolean not null default false,
  operator_id text not null,
  operator_role text not null check (operator_role in ('admin', 'partner', 'staff')),
  operator_name text,
  created_at timestamptz not null default now()
);

create index if not exists validation_log_event_idx on public.validation_log(event_id, created_at desc) where event_id is not null;
create index if not exists validation_log_operator_idx on public.validation_log(operator_id, created_at desc);
create index if not exists validation_log_created_idx on public.validation_log(created_at desc);

-- 5. Auditoria do admin ----------------------------------------------------------------------
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id text not null,
  actor_email text,
  action text not null,
  target_type text,
  target_id text,
  summary text not null default '',
  meta jsonb,
  ip text,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_idx on public.admin_audit_log(created_at desc);
create index if not exists admin_audit_log_target_idx on public.admin_audit_log(target_type, target_id, created_at desc);
create index if not exists admin_audit_log_actor_idx on public.admin_audit_log(actor_id, created_at desc);

-- 6. Nascimento conferido na conta -------------------------------------------------------------
alter table public.profiles add column if not exists birth_date date;
alter table public.profiles
  add column if not exists birth_date_source text check (birth_date_source is null or birth_date_source in ('signup', 'declared', 'kyc', 'admin')),
  add column if not exists birth_date_verified boolean not null default false;

-- 7. PRX Founders ----------------------------------------------------------------------------------
create table if not exists public.founders_meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 120),
  starts_at timestamptz not null,
  ends_at timestamptz,
  venue text not null default '',
  city text not null default '',
  address text not null default '',
  agenda text not null default '',
  status text not null default 'draft' check (status in ('draft', 'published', 'cancelled')),
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint founders_meetings_end_after_start check (ends_at is null or ends_at >= starts_at)
);
create index if not exists founders_meetings_status_idx on public.founders_meetings(status, starts_at);

create table if not exists public.founders_startups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  one_liner text not null default '',
  description text not null default '',
  sector text not null default '',
  stage text not null default 'ideia' check (stage in ('ideia', 'mvp', 'tracao')),
  relationship text not null default 'acompanhada' check (relationship in ('acompanhada', 'em_analise', 'investida')),
  website_url text not null default '',
  pitch_url text not null default '',
  status text not null default 'draft' check (status in ('draft', 'published')),
  sort_order integer not null default 0,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists founders_startups_status_idx on public.founders_startups(status, sort_order, name);

create table if not exists public.founders_updates (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'novidade' check (kind in ('novidade', 'oportunidade', 'material')),
  title text not null check (char_length(title) between 3 and 140),
  body text not null default '',
  link_url text not null default '',
  link_label text not null default '',
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists founders_updates_status_idx on public.founders_updates(status, published_at desc);

-- 8. Diretório de membros (admin) -----------------------------------------------------------------
create index if not exists profiles_full_name_trgm_idx on public.profiles using gin (full_name gin_trgm_ops);
create index if not exists profiles_email_trgm_idx on public.profiles using gin (email gin_trgm_ops);
create index if not exists profiles_created_idx on public.profiles(created_at desc);
create index if not exists profiles_role_idx on public.profiles(role);

create or replace view public.admin_member_directory as
select
  p.id,
  lower(p.email) as email,
  coalesce(nullif(p.full_name, ''), split_part(p.email, '@', 1)) as full_name,
  p.role,
  coalesce(p.nxt_score, 250) as nxt_score,
  p.created_at,
  coalesce(b.status, 'none') as bank_status,
  coalesce(b.balance, 0) as bank_balance,
  (
    p.role <> 'user'
    or length(regexp_replace(coalesce(p.cpf, ''), '\D', '', 'g')) = 11
    or length(regexp_replace(coalesce(fi.cpf, ''), '\D', '', 'g')) = 11
  ) as is_member
from public.profiles p
left join public.family_identities fi on fi.user_id = p.id
left join public.bank_accounts b on b.user_id = p.id;

-- RLS: tudo só pela service role ------------------------------------------------------------------
alter table public.live_promo_codes enable row level security;
alter table public.validation_log enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.founders_meetings enable row level security;
alter table public.founders_startups enable row level security;
alter table public.founders_updates enable row level security;

revoke all on public.live_promo_codes from anon, authenticated;
revoke all on public.validation_log from anon, authenticated;
revoke all on public.admin_audit_log from anon, authenticated;
revoke all on public.founders_meetings from anon, authenticated;
revoke all on public.founders_startups from anon, authenticated;
revoke all on public.founders_updates from anon, authenticated;
revoke all on public.admin_member_directory from anon, authenticated;

commit;
