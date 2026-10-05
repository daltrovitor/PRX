-- PRX LIVE · Resenha da… (festa com Host, Insiders e lista de acesso)
--
-- Cada edição é um evento do PRX LIVE da série "resenha" (só por lista: não aparece
-- na agenda dos membros nem pode ser reservado direto). O Host dá nome à edição; os
-- Insiders recebem um link com cota de acessos, e cada pedido que chega por esse link
-- é liberado ou recusado pelo próprio Insider no portal insider.<domínio>. Liberado,
-- o pedido vira um ingresso gratuito (live_tickets, origem "invite") validado na
-- portaria da equipe PRX.
--
-- Aplique depois de 20260926_prx_live_staff_bank.sql e 20260930_prx_notifications.sql.
-- Só a service role lê e escreve estas tabelas. Pode rodar mais de uma vez.

begin;

-- 1. Série "resenha" nos eventos --------------------------------------------------------------
alter table public.live_events drop constraint if exists live_events_series_check;
alter table public.live_events
  add constraint live_events_series_check
  check (series in ('founders', 'session', 'ctrl', 'talks', 'run', 'outro', 'resenha'));

-- 2. Modelo de e-mail "Você tá na lista" no registro de envios --------------------------------
alter table public.notification_log drop constraint if exists notification_log_template_check;
alter table public.notification_log
  add constraint notification_log_template_check
  check (template in ('welcome_email', 'phone_code', 'resenha_list'));

-- 3. EDIÇÕES ----------------------------------------------------------------------------------
create table if not exists public.resenha_editions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.live_events(id) on delete restrict,
  number integer not null unique check (number > 0),
  -- 001, 002… é o endereço público: /resenha/001
  slug text generated always as (lpad(number::text, 3, '0')) stored,
  host_name text not null check (char_length(host_name) between 2 and 60),
  -- "Resenha da Bia" ou "Resenha do Gabs"
  host_article text not null default 'da' check (host_article in ('da', 'do')),
  -- draft: invisível · open: a lista aberta recebe pedidos · closed: não recebe novos pedidos
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists resenha_editions_slug_idx on public.resenha_editions(slug);

-- 4. INSIDERS (pessoas) e PARTICIPAÇÃO POR EDIÇÃO ---------------------------------------------
create table if not exists public.resenha_insiders (
  id uuid primary key default gen_random_uuid(),
  -- Login do portal: conta PRX comum (auth.users / profiles). Não ganha papel novo.
  user_id uuid not null unique,
  email text not null unique,
  name text not null check (char_length(name) between 2 and 80),
  handle text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.resenha_edition_insiders (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.resenha_editions(id) on delete cascade,
  insider_id uuid not null references public.resenha_insiders(id) on delete restrict,
  -- insider: elenco fixo · guest: Guest Insider, muda a cada edição
  kind text not null default 'insider' check (kind in ('insider', 'guest')),
  -- Código do link do Insider: /resenha/001?i=<code>
  code text not null unique check (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- Quantos acessos ele pode liberar (PASS). Quando acaba, acabou.
  quota integer not null default 10 check (quota >= 0 and quota <= 500),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (edition_id, insider_id)
);

create index if not exists resenha_edition_insiders_insider_idx on public.resenha_edition_insiders(insider_id);

-- 5. PEDIDOS DE ACESSO ------------------------------------------------------------------------
create table if not exists public.resenha_requests (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.resenha_editions(id) on delete cascade,
  -- Insider dono do link por onde o pedido chegou.
  edition_insider_id uuid not null references public.resenha_edition_insiders(id) on delete restrict,
  name text not null check (char_length(name) between 3 and 80),
  email text not null check (email = lower(email)),
  whatsapp text,
  instagram text,
  birth_date date not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'revoked')),
  -- Segredo da página do convidado (/resenha/lista/<token>): sem conta, o token é a chave.
  token text not null unique,
  ticket_id uuid references public.live_tickets(id) on delete set null,
  decided_at timestamptz,
  decided_by text,
  -- LGPD: quando a pessoa aceitou o uso dos dados e declarou ter 18+.
  consent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- Aprovado sempre tem ingresso e quem decidiu.
  constraint resenha_requests_approved_has_ticket check (status <> 'approved' or (ticket_id is not null and decided_at is not null)),
  unique (edition_id, email)
);

create index if not exists resenha_requests_link_idx on public.resenha_requests(edition_insider_id, status, created_at desc);
create index if not exists resenha_requests_edition_idx on public.resenha_requests(edition_id, created_at desc);

-- 6. RLS: SÓ A SERVICE ROLE LÊ E ESCREVE ------------------------------------------------------
alter table public.resenha_editions enable row level security;
alter table public.resenha_insiders enable row level security;
alter table public.resenha_edition_insiders enable row level security;
alter table public.resenha_requests enable row level security;
revoke all on public.resenha_editions from anon, authenticated;
revoke all on public.resenha_insiders from anon, authenticated;
revoke all on public.resenha_edition_insiders from anon, authenticated;
revoke all on public.resenha_requests from anon, authenticated;

commit;

-- ----------------------------------------------------------------------------
-- Conferência (somente leitura):
--   select e.slug, e.host_name, e.status, count(r.*) filter (where r.status = 'approved') as liberados
--     from public.resenha_editions e left join public.resenha_requests r on r.edition_id = e.id group by 1, 2, 3;
-- ----------------------------------------------------------------------------
