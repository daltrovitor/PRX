-- Marca no feminino: "a PRX".
-- O gatilho de boas-vindas grava a descrição do primeiro lançamento do extrato
-- de pontos. Os lançamentos já gravados ficam como estão (o extrato é imutável,
-- prx_block_ledger_changes); só os perfis novos passam a receber o texto novo.

create or replace function public.prx_welcome_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.prx_coins, 0) > 0 then
    insert into public.point_transactions (user_id, coins_delta, xp_delta, balance_after, source, reference_id, description)
    values (new.id, new.prx_coins, 0, new.prx_coins, 'welcome', 'welcome', 'Boas-vindas à PRX')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.prx_welcome_ledger() from public, anon, authenticated;
