-- Hello World
-- ============================================================================
-- PRX: assinaturas personalizadas (16/10/2026)
--
-- 1. billing_customers: o cliente do membro na conta principal do Asaas
--    (cobranças da PRX: assinaturas e ingressos). Um por pessoa e ambiente.
-- 2. subscription_plans: planos criados no admin (nome, preço, ciclo,
--    benefícios, elegibilidade, vigência de venda, cancelamento, teste grátis
--    e desconto de entrada). Nada fixo no código.
-- 3. member_subscriptions: a assinatura de cada membro, espelho da assinatura
--    no Asaas. Só fica "ativa" com pagamento confirmado pelo webhook.
-- 4. subscription_payments: cada cobrança gerada pelo Asaas (vencimento,
--    status, link da fatura), única pelo id do Asaas (webhook repetido não
--    duplica).
-- 5. subscription_events: histórico (contratação, pagamento, atraso,
--    cancelamento, troca de plano, correções).
--
-- Só a service role lê e escreve. Idempotente. Aplique depois de 20261016_prx_behaviors.sql.
-- ============================================================================
begin;

create table if not exists public.billing_customers (
  user_id uuid not null references auth.users(id) on delete cascade,
  environment text not null check (environment in ('sandbox', 'production')),
  asaas_customer_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, environment),
  unique (environment, asaas_customer_id)
);

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  description text not null default '' check (char_length(description) <= 1000),
  price numeric(10, 2) not null check (price >= 5),
  cycle text not null check (cycle in ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMIANNUALLY', 'YEARLY')),
  benefits text[] not null default '{}',
  payment_methods text[] not null default '{PIX,CREDIT_CARD}',
  -- Elegibilidade
  min_age integer check (min_age is null or min_age between 12 and 120),
  max_age integer check (max_age is null or max_age between 12 and 120),
  requires_active_bank boolean not null default false,
  founders_only boolean not null default false,
  -- Vigência da venda (quem já assinou continua)
  sale_starts_at timestamptz,
  sale_ends_at timestamptz,
  -- Teste grátis e desconto de entrada
  trial_days integer not null default 0 check (trial_days between 0 and 90),
  intro_discount_percent integer not null default 0 check (intro_discount_percent between 0 and 90),
  intro_cycles integer not null default 0 check (intro_cycles between 0 and 24),
  cancellation_policy text not null default 'end_of_period' check (cancellation_policy in ('end_of_period', 'immediate')),
  cancellation_terms text not null default '' check (char_length(cancellation_terms) <= 2000),
  status text not null default 'draft' check (status in ('draft', 'active', 'inactive')),
  sort_order integer not null default 0,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_plans_ages check (min_age is null or max_age is null or max_age >= min_age),
  constraint subscription_plans_sale check (sale_starts_at is null or sale_ends_at is null or sale_ends_at > sale_starts_at)
);

create table if not exists public.member_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id) on delete restrict,
  plan_name text not null,
  price numeric(10, 2) not null,
  cycle text not null,
  billing_type text not null check (billing_type in ('PIX', 'CREDIT_CARD', 'BOLETO')),
  status text not null default 'pending_payment' check (status in ('pending_payment', 'trialing', 'active', 'past_due', 'cancelled', 'expired')),
  environment text not null check (environment in ('sandbox', 'production')),
  asaas_subscription_id text unique,
  current_period_end timestamptz,
  next_due_date date,
  trial_ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  cancel_reason text not null default '' check (char_length(cancel_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Uma assinatura viva por pessoa e plano.
create unique index if not exists member_subscriptions_one_live on public.member_subscriptions(user_id, plan_id) where status in ('pending_payment', 'trialing', 'active', 'past_due');
create index if not exists member_subscriptions_user_idx on public.member_subscriptions(user_id, created_at desc);
create index if not exists member_subscriptions_status_idx on public.member_subscriptions(status, created_at desc);

create table if not exists public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.member_subscriptions(id) on delete cascade,
  asaas_payment_id text not null unique,
  value numeric(10, 2) not null,
  due_date date not null,
  status text not null,
  billing_type text,
  invoice_url text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscription_payments_sub_idx on public.subscription_payments(subscription_id, due_date desc);

create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.member_subscriptions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  actor text not null,
  action text not null check (char_length(action) <= 60),
  detail text not null default '' check (char_length(detail) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists subscription_events_sub_idx on public.subscription_events(subscription_id, created_at desc);

alter table public.billing_customers enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.member_subscriptions enable row level security;
alter table public.subscription_payments enable row level security;
alter table public.subscription_events enable row level security;
revoke all on public.billing_customers, public.subscription_plans, public.member_subscriptions, public.subscription_payments, public.subscription_events from anon, authenticated;

commit;
