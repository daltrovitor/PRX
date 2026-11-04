-- ============================================================================
-- Rate limit persistente (pentest Bianchini Hub 2026-11-04, achado H3)
-- O limitador em memória (lib/security.ts) vive só dentro de cada instância
-- serverless da Vercel: um ataque distribuído abre várias instâncias e escapa do
-- limite. Este contador fica no Postgres, é atômico e vale para todas elas.
-- Usado por lib/security.ts (checkRateLimitPersistent) nos logins, cadastros,
-- OTP, guardian-auth e formulários públicos. A chave que o app grava já vem em
-- hash (sem IP nem e-mail em claro).
-- ============================================================================

begin;

create table if not exists public.prx_rate_limits (
  bucket_key text primary key,
  hit_count integer not null default 1,
  reset_at timestamptz not null
);

alter table public.prx_rate_limits enable row level security;
revoke all on table public.prx_rate_limits from public, anon, authenticated;
grant all on table public.prx_rate_limits to service_role;

create index if not exists prx_rate_limits_reset_at_idx on public.prx_rate_limits (reset_at);

create or replace function public.prx_check_rate_limit(
  p_key text,
  p_max_requests integer default 10,
  p_window_seconds integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_reset timestamptz := v_now + make_interval(secs => greatest(1, p_window_seconds));
  v_count integer;
  v_final_reset timestamptz;
begin
  -- Faxina oportunista: ~2% das chamadas apagam janelas vencidas há mais de 1 hora.
  if random() < 0.02 then
    delete from public.prx_rate_limits where reset_at < v_now - interval '1 hour';
  end if;

  insert into public.prx_rate_limits (bucket_key, hit_count, reset_at)
  values (p_key, 1, v_reset)
  on conflict (bucket_key) do update
    set hit_count = case
                      when public.prx_rate_limits.reset_at <= v_now then 1
                      else public.prx_rate_limits.hit_count + 1
                    end,
        reset_at  = case
                      when public.prx_rate_limits.reset_at <= v_now then v_reset
                      else public.prx_rate_limits.reset_at
                    end
  returning hit_count, reset_at into v_count, v_final_reset;

  return jsonb_build_object(
    'allowed', (v_count <= p_max_requests),
    'remaining', greatest(0, p_max_requests - v_count),
    'resetInSeconds', greatest(1, ceil(extract(epoch from (v_final_reset - v_now)))::int)
  );
end;
$$;

revoke all on function public.prx_check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.prx_check_rate_limit(text, integer, integer) to service_role;

commit;
