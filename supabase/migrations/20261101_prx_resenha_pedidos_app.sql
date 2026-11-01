-- Hello World
-- ============================================================================
-- PRX: pedido de convite da Resenha pelo app (01/11/2026)
--
-- resenha_invite_requests: na aba Resenha do PRX LIVE, o membro vê o catálogo
-- de Insiders da edição (foto e nome), escolhe um e pede autorização para
-- comprar o ingresso. O Insider aprova (vira convite e ocupa um PASS) ou recusa
-- no portal. Um pedido por pessoa e edição: recusado, não pede a outro Insider.
--
-- Só a service role lê e escreve. Idempotente.
-- ============================================================================
begin;

create table if not exists public.resenha_invite_requests (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.resenha_editions(id) on delete cascade,
  edition_insider_id uuid not null references public.resenha_edition_insiders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_name text not null default '' check (char_length(member_name) <= 160),
  member_code text not null default '' check (char_length(member_code) <= 20),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  invite_id uuid references public.resenha_member_invites(id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text
);

-- Um pedido por pessoa e edição, qualquer que seja o Insider ou o resultado.
create unique index if not exists resenha_invite_requests_once_key on public.resenha_invite_requests (edition_id, user_id);
create index if not exists resenha_invite_requests_link_idx on public.resenha_invite_requests (edition_insider_id, status);
create index if not exists resenha_invite_requests_user_idx on public.resenha_invite_requests (user_id);

alter table public.resenha_invite_requests enable row level security;
revoke all on public.resenha_invite_requests from anon, authenticated;

commit;
