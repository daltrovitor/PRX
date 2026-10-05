-- PRX BANK: desativa as contas criadas antes do banco parceiro de verdade.
--
-- Até aqui as contas foram "ativadas" no modo sandbox (saldo, agência, número e
-- cartão fictícios, ajustados pelo admin). Com dinheiro real, toda conta volta a
-- "em ativação" e só fica ativa quando o banco parceiro aprova a subconta de
-- PRODUÇÃO do membro.
--
-- Fica de fora:
--   * contas bloqueadas (continuam bloqueadas);
--   * contas já ligadas a uma subconta de produção do banco parceiro.
-- Não apaga nada: o extrato antigo (sem provider_ref) continua no banco, mas o app
-- não mostra nem conta nos limites em produção.
-- Aplique depois de 20261001_prx_asaas_baas.sql. Pode rodar mais de uma vez.

do $$
declare
  v_changed integer;
begin
  if to_regclass('public.bank_accounts') is null then
    raise notice 'bank_accounts não existe: nada a fazer.';
    return;
  end if;

  if to_regclass('public.bank_subaccounts') is not null then
    update public.bank_accounts a
       set status = 'pending_activation',
           balance = 0,
           agency = null,
           account_number = null,
           provider = null,
           provider_account_id = null,
           card_last4 = null,
           card_expiry = null,
           card_locked = false,
           activated_at = null,
           updated_at = now()
     where a.status <> 'blocked'
       and not exists (
         select 1
           from public.bank_subaccounts s
          where s.id = a.user_id
            and s.environment = 'production'
            and s.asaas_account_id is not null
            and s.asaas_account_id = a.provider_account_id
       );
  else
    -- Sem a tabela de subcontas, nenhuma conta pode estar ligada ao banco parceiro.
    update public.bank_accounts
       set status = 'pending_activation',
           balance = 0,
           agency = null,
           account_number = null,
           provider = null,
           provider_account_id = null,
           card_last4 = null,
           card_expiry = null,
           card_locked = false,
           activated_at = null,
           updated_at = now()
     where status <> 'blocked';
  end if;

  get diagnostics v_changed = row_count;
  raise notice 'PRX BANK: % conta(s) voltaram para "em ativação".', v_changed;
end;
$$;
