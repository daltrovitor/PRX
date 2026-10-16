-- Hello World
-- ============================================================================
-- PRX LIVE: checkout de ingressos, descontos por evento e documentos da
-- autorização do responsável (16/10/2026)
--
-- 1. live_orders: o pagamento de cada reserva, pela conta principal do Asaas
--    (Pix, cartão de crédito na fatura do Asaas, ou Pix pago pela conta PRX
--    BANK). Um pedido em aberto por ingresso; o ingresso só vira válido quando
--    o Asaas confirma o pagamento (webhook, "ord:<id>"); webhook repetido não
--    emite nada de novo (o ingresso é o mesmo).
-- 2. live_promo_codes ganha: desconto automático (sem código), público
--    elegível, formas de pagamento elegíveis e se acumula com outro desconto.
-- 3. consent_documents: o documento oficial da autorização do responsável
--    (texto, versão, certificado em PDF) e a situação da revisão jurídica.
--    Enquanto não houver documento aprovado, a autorização registra que o
--    texto aceito ainda aguarda revisão jurídica.
--
-- Só a service role lê e escreve. Idempotente. Aplique depois de 20261012_prx_guardian_consent.sql.
-- ============================================================================
begin;

create table if not exists public.live_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  ticket_id uuid not null references public.live_tickets(id) on delete restrict,
  event_id uuid not null references public.live_events(id) on delete restrict,
  payment_method text not null check (payment_method in ('PRX_BANK', 'PIX', 'CREDIT_CARD')),
  amount_original numeric(10, 2) not null check (amount_original >= 0),
  discount_total numeric(10, 2) not null default 0 check (discount_total >= 0),
  amount_total numeric(10, 2) not null check (amount_total >= 0),
  discounts jsonb not null default '[]'::jsonb,
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment', 'paid', 'paid_needs_review', 'cancelled', 'expired', 'refunded')),
  environment text not null check (environment in ('sandbox', 'production')),
  asaas_payment_id text unique,
  invoice_url text,
  paid_at timestamptz,
  review_note text not null default '' check (char_length(review_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Um pedido em aberto por ingresso (trocar a forma de pagamento cancela o anterior).
create unique index if not exists live_orders_one_open on public.live_orders(ticket_id) where status = 'awaiting_payment';
create index if not exists live_orders_user_idx on public.live_orders(user_id, created_at desc);
create index if not exists live_orders_status_idx on public.live_orders(status, created_at desc);

alter table public.live_promo_codes add column if not exists automatic boolean not null default false;
alter table public.live_promo_codes add column if not exists audience text not null default 'all';
alter table public.live_promo_codes add column if not exists payment_methods text[];
alter table public.live_promo_codes add column if not exists stackable boolean not null default false;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'live_promo_audience_check') then
    alter table public.live_promo_codes add constraint live_promo_audience_check check (audience in ('all', 'founders', 'subscribers', 'bank_active'));
  end if;
end $$;

create table if not exists public.consent_documents (
  id uuid primary key default gen_random_uuid(),
  key text not null check (key ~ '^[a-z0-9_]{3,60}$'),
  version text not null check (char_length(version) between 1 and 40),
  title text not null check (char_length(title) between 3 and 160),
  body text not null check (char_length(body) between 20 and 20000),
  certificate_url text check (certificate_url is null or char_length(certificate_url) <= 2000),
  active boolean not null default false,
  legal_status text not null default 'pending_review' check (legal_status in ('pending_review', 'approved')),
  legal_reviewed_by text,
  legal_reviewed_at timestamptz,
  legal_note text not null default '' check (char_length(legal_note) <= 1000),
  created_by text,
  created_at timestamptz not null default now(),
  unique (key, version)
);

-- Uma versão vigente por documento.
create unique index if not exists consent_documents_one_active on public.consent_documents(key) where active;

alter table public.live_orders enable row level security;
alter table public.consent_documents enable row level security;
revoke all on public.live_orders, public.consent_documents from anon, authenticated;

commit;
