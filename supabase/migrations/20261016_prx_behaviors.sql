-- Hello World
-- ============================================================================
-- PRX: comportamentos financeiros verificáveis (16/10/2026)
--
-- Substitui o "bom comportamento" por relato (behavior_claims, que fica só como
-- histórico) por regras configuradas no admin e conferidas com dados que a PRX
-- realmente tem: os pagamentos que saem das contas PRX BANK (Pix por chave,
-- Pix QR Code e boletos), com o CNPJ do recebedor quando o banco parceiro
-- informa. Sem dado suficiente, o resultado é "não verificável", nunca um
-- palpite.
--
-- 1. behavior_companies: empresas por CNPJ, razão social, nome fantasia,
--    outros identificadores (chaves Pix, nomes alternativos) e categoria.
-- 2. behavior_rules + behavior_rule_companies: regras (positivas ou
--    negativas) e as empresas ligadas a cada uma (muitas para muitas).
-- 3. behavior_evaluations: cada resultado com o período, a fonte, as
--    evidências (pagamentos que casaram) e a revisão do admin.
-- 4. behavior_import_runs: relatório de cada importação em lote.
-- 5. bank_outgoing_requests.counterparty_document: CPF/CNPJ do recebedor que
--    o Asaas devolve na transferência concluída.
--
-- Só a service role lê e escreve. Idempotente. Aplique depois de 20261015.
-- ============================================================================
begin;

create table if not exists public.behavior_companies (
  id uuid primary key default gen_random_uuid(),
  cnpj text not null unique check (cnpj ~ '^[0-9]{14}$'),
  legal_name text not null check (char_length(legal_name) between 2 and 200),
  trade_name text not null default '' check (char_length(trade_name) <= 200),
  -- Chaves Pix (e-mail, telefone, aleatória) e nomes alternativos, já normalizados.
  identifiers text[] not null default '{}',
  category text not null default '' check (char_length(category) <= 60),
  notes text not null default '' check (char_length(notes) <= 500),
  active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists behavior_companies_category_idx on public.behavior_companies(category);
create index if not exists behavior_companies_identifiers_idx on public.behavior_companies using gin (identifiers);
create index if not exists behavior_companies_name_idx on public.behavior_companies(lower(legal_name));

create table if not exists public.behavior_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 120),
  description text not null default '' check (char_length(description) <= 600),
  polarity text not null check (polarity in ('positive', 'negative')),
  -- at_least: pelo menos N pagamentos às empresas-alvo no período · none: nenhum pagamento no período.
  comparator text not null check (comparator in ('at_least', 'none')),
  threshold integer not null default 1 check (threshold between 1 and 1000),
  min_amount numeric(14, 2) not null default 0 check (min_amount >= 0),
  channels text[] not null default '{pix_key,pix_qr,bill}',
  categories text[] not null default '{}',
  observation_days integer not null check (observation_days between 1 and 366),
  starts_at timestamptz,
  ends_at timestamptz,
  coins integer not null default 0 check (coins between 0 and 100000),
  xp integer not null default 0 check (xp between 0 and 1000000),
  status text not null default 'inactive' check (status in ('active', 'inactive')),
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint behavior_rules_period check (ends_at is null or starts_at is null or ends_at > starts_at),
  -- Recompensa só para comportamento positivo.
  constraint behavior_rules_reward_positive check (polarity = 'positive' or (coins = 0 and xp = 0))
);

create table if not exists public.behavior_rule_companies (
  rule_id uuid not null references public.behavior_rules(id) on delete cascade,
  company_id uuid not null references public.behavior_companies(id) on delete cascade,
  primary key (rule_id, company_id)
);

create index if not exists behavior_rule_companies_company_idx on public.behavior_rule_companies(company_id);

create table if not exists public.behavior_evaluations (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.behavior_rules(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  -- identified: o comportamento da regra aconteceu · not_identified: não aconteceu · unverifiable: faltam dados.
  result text not null check (result in ('identified', 'not_identified', 'unverifiable')),
  status text not null default 'final' check (status in ('final', 'under_review', 'corrected')),
  evidence jsonb not null default '[]'::jsonb,
  data_source text not null default 'prx_bank',
  reason text not null default '' check (char_length(reason) <= 500),
  reward_applied boolean not null default false,
  reviewed_by text,
  reviewed_at timestamptz,
  review_note text not null default '' check (char_length(review_note) <= 500),
  created_at timestamptz not null default now(),
  -- Uma avaliação por regra, pessoa e fim de período (reavaliar o mesmo dia não duplica).
  unique (rule_id, user_id, period_end)
);

create index if not exists behavior_evaluations_rule_idx on public.behavior_evaluations(rule_id, created_at desc);
create index if not exists behavior_evaluations_user_idx on public.behavior_evaluations(user_id, created_at desc);
create index if not exists behavior_evaluations_review_idx on public.behavior_evaluations(status) where status = 'under_review';

create table if not exists public.behavior_import_runs (
  id uuid primary key default gen_random_uuid(),
  file_name text not null default '',
  total integer not null default 0,
  created integer not null default 0,
  updated integer not null default 0,
  unchanged integer not null default 0,
  duplicates integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  actor text not null,
  created_at timestamptz not null default now()
);

alter table public.bank_outgoing_requests add column if not exists counterparty_document text check (counterparty_document is null or counterparty_document ~ '^[0-9]{11}$|^[0-9]{14}$');

alter table public.behavior_companies enable row level security;
alter table public.behavior_rules enable row level security;
alter table public.behavior_rule_companies enable row level security;
alter table public.behavior_evaluations enable row level security;
alter table public.behavior_import_runs enable row level security;
revoke all on public.behavior_companies, public.behavior_rules, public.behavior_rule_companies, public.behavior_evaluations, public.behavior_import_runs from anon, authenticated;

commit;
