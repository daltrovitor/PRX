-- Hello World
-- ============================================================================
-- PRX: ID PRX, convites da Resenha pelo app e notificações no celular (19/10/2026)
--
-- 1. ID PRX (profiles.member_code): código curto, único e público de cada
--    cliente (PRX-7K3M9Q). É o que a pessoa passa para um Insider convidá-la.
--    Contas existentes recebem um agora; contas novas nascem com o seu.
-- 2. resenha_member_invites: o Insider convida membros do app (por nome ou ID
--    PRX). Só quem tem convite ativo vê a Resenha no app e compra o ingresso.
--    Cada convite ativo ocupa um PASS da cota do Insider.
-- 3. push_subscriptions: aparelhos que ativaram as notificações no celular
--    (Web Push). Uma linha por aparelho/navegador.
--
-- Só a service role lê e escreve as tabelas novas. Idempotente.
-- ============================================================================
begin;

-- 1. ID PRX ---------------------------------------------------------------------
create or replace function public.prx_new_member_code() returns text
language plpgsql volatile
set search_path = public
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  candidate text;
begin
  loop
    candidate := 'PRX-';
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * 32)::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where member_code = candidate);
  end loop;
  return candidate;
end;
$$;

alter table public.profiles add column if not exists member_code text;

-- Uma conta por vez: cada UPDATE já enxerga os códigos dados antes (sem repetir).
do $$
declare
  r record;
begin
  for r in select id from public.profiles where member_code is null loop
    update public.profiles set member_code = public.prx_new_member_code() where id = r.id;
  end loop;
end;
$$;

create unique index if not exists profiles_member_code_key on public.profiles (member_code);
alter table public.profiles alter column member_code set default public.prx_new_member_code();
alter table public.profiles drop constraint if exists profiles_member_code_format;
alter table public.profiles add constraint profiles_member_code_format check (member_code is null or member_code ~ '^PRX-[2-9A-HJ-NP-Z]{6}$');

-- 2. Convites da Resenha pelo app ----------------------------------------------
create table if not exists public.resenha_member_invites (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.resenha_editions(id) on delete cascade,
  edition_insider_id uuid not null references public.resenha_edition_insiders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_name text not null default '' check (char_length(member_name) <= 160),
  member_code text not null default '' check (char_length(member_code) <= 20),
  status text not null default 'invited' check (status in ('invited', 'revoked')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by text
);

-- Um convite ativo por pessoa e edição.
create unique index if not exists resenha_member_invites_active_key on public.resenha_member_invites (edition_id, user_id) where status = 'invited';
create index if not exists resenha_member_invites_link_idx on public.resenha_member_invites (edition_insider_id, status);
create index if not exists resenha_member_invites_user_idx on public.resenha_member_invites (user_id, status);

-- 3. Notificações no celular ---------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) <= 1000 and endpoint like 'https://%'),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 200),
  user_agent text not null default '' check (char_length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.resenha_member_invites enable row level security;
alter table public.push_subscriptions enable row level security;
revoke all on public.resenha_member_invites, public.push_subscriptions from anon, authenticated;

commit;
