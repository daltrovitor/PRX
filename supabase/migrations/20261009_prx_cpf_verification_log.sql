-- Hello World
-- ============================================================================
-- Conferência de CPF + data de nascimento na Receita (Serpro) — 09/10/2026
--
-- Uma linha por consulta feita no cadastro. Guarda só o CPF mascarado
-- (***.***.789-**), nunca nome nem data de nascimento. Só a service role lê.
--   outcome: verified · mismatch (CPF/nascimento não conferem) · irregular
--            (situação cadastral) · unavailable (Serpro fora do ar) ·
--            skipped (Serpro não configurado)
--
--   select outcome, count(*) from cpf_verification_log group by 1;
-- ============================================================================

begin;

create table if not exists public.cpf_verification_log (
  id bigint generated always as identity primary key,
  cpf_masked text not null,
  source text not null,
  outcome text not null check (outcome in ('verified', 'mismatch', 'irregular', 'unavailable', 'skipped')),
  http_status integer,
  situation_code text,
  detail text check (detail is null or char_length(detail) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists cpf_verification_log_recent_idx on public.cpf_verification_log(created_at desc);

alter table public.cpf_verification_log enable row level security;
revoke all on public.cpf_verification_log from anon, authenticated;

commit;
