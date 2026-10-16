-- Hello World
-- ============================================================================
-- PRX Founders: membros Founders e materiais oficiais da marca (16/10/2026)
--
-- 1. founders_members: quem é Founder da PRX, ligado à conta real do membro,
--    com nome e informações de exibição, benefícios, elegibilidade e vigência.
--    Um registro por pessoa; ativar/desativar fica no histórico do admin.
-- 2. brand_assets: materiais oficiais configuráveis sem rebuild (ex.: a imagem
--    oficial do PRX Founders). Nada aparece no app enquanto o material não for
--    enviado E ativado pelo admin: sem imagem de mentira no lugar.
--
-- Só a service role lê e escreve. Idempotente. Aplique depois de 20261016_prx_behaviors.sql.
-- ============================================================================
begin;

create table if not exists public.founders_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 80),
  headline text not null default '' check (char_length(headline) <= 140),
  bio text not null default '' check (char_length(bio) <= 1000),
  benefits text[] not null default '{}',
  eligibility text not null default '' check (char_length(eligibility) <= 500),
  status text not null default 'active' check (status in ('active', 'inactive')),
  show_publicly boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint founders_members_period check (starts_at is null or ends_at is null or ends_at > starts_at)
);

create index if not exists founders_members_status_idx on public.founders_members(status, created_at desc);

create table if not exists public.brand_assets (
  key text primary key check (key ~ '^[a-z0-9_]{3,60}$'),
  url text check (url is null or url ~ '^https://'),
  alt text not null default '' check (char_length(alt) <= 200),
  enabled boolean not null default false,
  -- Onde aparece: app_home, founders_tab, emails.
  placements text[] not null default '{}',
  updated_by text,
  updated_at timestamptz not null default now(),
  -- Ligado só com o arquivo enviado.
  constraint brand_assets_enabled_needs_url check (not enabled or url is not null)
);

alter table public.founders_members enable row level security;
alter table public.brand_assets enable row level security;
revoke all on public.founders_members, public.brand_assets from anon, authenticated;

commit;
