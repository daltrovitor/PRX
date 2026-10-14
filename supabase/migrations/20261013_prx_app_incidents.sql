-- Hello World
-- ============================================================================
-- PRX: códigos de erro técnico (13/10/2026)
--
-- Quando algo dá errado e a pessoa não tem como resolver na tela, o app mostra
-- só "Deu um erro ao fazer isso" com um código (ex.: BNK-7K3F9Q). Esta tabela
-- guarda o detalhe de cada código (rota, ação, motivo já sem dados pessoais,
-- versão publicada), para o suporte achar o erro pelo código que o membro
-- informar: Admin → GET /api/admin/incidents?code=BNK-7K3F9Q.
-- Só a service role lê e escreve. Sem a tabela, o app funciona e o detalhe fica
-- nos logs da Vercel (linha JSON "app.incident" com o mesmo código).
--
-- Idempotente.
-- ============================================================================
begin;

create table if not exists public.app_incidents (
  code text primary key check (code ~ '^[A-Z]{3}-[2-9A-Z]{6}$'),
  created_at timestamptz not null default now(),
  path text check (path is null or char_length(path) <= 200),
  action text not null default '' check (char_length(action) <= 200),
  status integer not null default 500,
  detail text not null default '' check (char_length(detail) <= 2000),
  user_id uuid references auth.users(id) on delete set null,
  deploy text check (deploy is null or char_length(deploy) <= 80)
);

create index if not exists app_incidents_created_idx on public.app_incidents(created_at desc);

alter table public.app_incidents enable row level security;
revoke all on public.app_incidents from anon, authenticated;

commit;
