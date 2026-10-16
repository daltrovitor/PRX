-- Hello World
-- ============================================================================
-- PRX: sorteios (16/10/2026)
--
-- Sorteio ligado a promoção comercial depende de autorização prévia (Lei
-- 5.768/1971; hoje pela Secretaria de Prêmios e Apostas do Ministério da
-- Fazenda). Por isso o sorteio só é publicado com o número da autorização, o
-- órgão, a validade e o regulamento. A participação é gratuita (sem coins nem
-- pagamento) e a elegibilidade é conferida no servidor.
--
-- Apuração auditável (compromisso e revelação): ao publicar, a PRX gera uma
-- semente secreta e mostra o hash dela; ao encerrar, registra o hash da lista
-- de participações; no sorteio, revela a semente e (opcional) um número público
-- (ex.: Loteria Federal). Qualquer pessoa refaz a conta e chega aos mesmos
-- ganhadores.
--
-- Só a service role lê e escreve. Idempotente.
-- ============================================================================
begin;

create table if not exists public.raffles (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  image_url text check (image_url is null or char_length(image_url) <= 2000),
  prize text not null check (char_length(prize) between 2 and 300),
  prize_value numeric(12, 2) check (prize_value is null or prize_value >= 0),
  rules text not null default '' check (char_length(rules) <= 8000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  draw_at timestamptz not null,
  winners_count integer not null default 1 check (winners_count between 1 and 100),
  max_entries_per_user integer not null default 1 check (max_entries_per_user between 1 and 10),
  -- Elegibilidade
  min_age integer check (min_age is null or min_age between 12 and 120),
  requires_active_bank boolean not null default false,
  founders_only boolean not null default false,
  subscribers_only boolean not null default false,
  -- Base legal
  authorization_number text not null default '' check (char_length(authorization_number) <= 120),
  authorization_issuer text not null default '' check (char_length(authorization_issuer) <= 160),
  authorization_valid_until date,
  regulation_url text not null default '' check (char_length(regulation_url) <= 2000),
  legal_ack_by text,
  legal_ack_at timestamptz,
  -- Apuração
  status text not null default 'draft' check (status in ('draft', 'published', 'paused', 'closed', 'drawn', 'cancelled')),
  seed text,
  commit_hash text,
  entries_hash text,
  entries_count integer,
  public_entropy text not null default '' check (char_length(public_entropy) <= 200),
  winners jsonb not null default '[]'::jsonb,
  drawn_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint raffles_period check (ends_at > starts_at and draw_at >= ends_at),
  constraint raffles_published_legal check (status = 'draft' or (authorization_number <> '' and regulation_url <> '' and legal_ack_at is not null and commit_hash is not null))
);

create index if not exists raffles_status_idx on public.raffles(status, ends_at);

create table if not exists public.raffle_entries (
  id uuid primary key default gen_random_uuid(),
  raffle_id uuid not null references public.raffles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Número da participação da pessoa neste sorteio (1..máximo): impede passar do limite por corrida.
  slot integer not null check (slot between 1 and 10),
  entry_number integer,
  created_at timestamptz not null default now(),
  unique (raffle_id, user_id, slot)
);

create index if not exists raffle_entries_raffle_idx on public.raffle_entries(raffle_id, created_at);
create index if not exists raffle_entries_user_idx on public.raffle_entries(user_id, created_at desc);

create table if not exists public.raffle_events (
  id uuid primary key default gen_random_uuid(),
  raffle_id uuid not null references public.raffles(id) on delete cascade,
  actor text not null,
  action text not null check (char_length(action) <= 60),
  detail text not null default '' check (char_length(detail) <= 1000),
  created_at timestamptz not null default now()
);

create index if not exists raffle_events_raffle_idx on public.raffle_events(raffle_id, created_at desc);

alter table public.raffles enable row level security;
alter table public.raffle_entries enable row level security;
alter table public.raffle_events enable row level security;
revoke all on public.raffles, public.raffle_entries, public.raffle_events from anon, authenticated;

commit;
