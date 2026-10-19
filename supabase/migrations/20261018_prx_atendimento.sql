-- Hello World
-- ============================================================================
-- PRX: atendimento (18/10/2026)
--
-- 1. SAC: o membro abre uma solicitação no PRX PASS e recebe um protocolo
--    (PRX-AAAAMMDD-XXXXXX). A conversa fica em support_messages; a equipe
--    responde pelo admin e o membro é avisado por e-mail (support_reply).
-- 2. "Seja um parceiro": pedidos de empresas para entrar no PRX PASS, com o
--    aceite de contato (LGPD) e o andamento comercial.
--
-- Só a service role lê e escreve. Idempotente.
-- ============================================================================
begin;

-- 1. SAC ---------------------------------------------------------------------
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  protocol text not null unique check (protocol ~ '^PRX-[0-9]{8}-[2-9A-Z]{6}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_name text not null default '' check (char_length(user_name) <= 160),
  user_email text not null default '' check (char_length(user_email) <= 160),
  topic text not null check (topic in ('conta', 'pass', 'bank', 'live', 'pagamentos', 'privacidade', 'outro')),
  subject text not null check (char_length(subject) between 3 and 120),
  status text not null default 'open' check (status in ('open', 'in_progress', 'answered', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists support_tickets_user_idx on public.support_tickets(user_id, updated_at desc);
create index if not exists support_tickets_status_idx on public.support_tickets(status, updated_at desc);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author text not null check (author in ('member', 'team')),
  author_name text not null default '' check (char_length(author_name) <= 160),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists support_messages_ticket_idx on public.support_messages(ticket_id, created_at);

-- Aviso por e-mail quando a equipe responde.
alter table public.notification_log drop constraint if exists notification_log_template_check;
alter table public.notification_log
  add constraint notification_log_template_check
  check (template in ('welcome_email', 'phone_code', 'resenha_list', 'minor_event_authorization', 'support_reply'));

-- 2. Seja um parceiro --------------------------------------------------------
create table if not exists public.partner_leads (
  id uuid primary key default gen_random_uuid(),
  business_name text not null check (char_length(business_name) between 2 and 120),
  document text check (document is null or document ~ '^([0-9]{11}|[0-9]{14})$'),
  category_id text not null check (char_length(category_id) <= 40),
  city text not null check (char_length(city) between 2 and 120),
  contact_name text not null check (char_length(contact_name) between 2 and 120),
  relation text not null check (relation in ('dono', 'socio', 'equipe', 'indicacao')),
  email text not null check (char_length(email) <= 160),
  phone text not null check (phone ~ '^[0-9]{10,11}$'),
  link text not null default '' check (char_length(link) <= 200),
  offer text not null check (char_length(offer) between 10 and 1000),
  status text not null default 'new' check (status in ('new', 'contacted', 'converted', 'discarded')),
  note text not null default '' check (char_length(note) <= 1000),
  submitted_by uuid references auth.users(id) on delete set null,
  consent_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists partner_leads_status_idx on public.partner_leads(status, created_at desc);

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
alter table public.partner_leads enable row level security;
revoke all on public.support_tickets, public.support_messages, public.partner_leads from anon, authenticated;

commit;
