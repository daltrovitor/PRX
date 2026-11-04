-- ============================================================================
-- Revogação central de sessão + hardening de funções SQL (pentest Bianchini Hub
-- 2026-11-04: H5, M11, M12, B6, B7)
--
-- Antes de aplicar em produção: rodar em homologação e testar cadastro (e-mail e
-- Google) e login, porque M11 muda o search_path de handle_new_user().
-- ============================================================================

begin;

-- H5: "sair de todos os dispositivos", rebaixamento de papel e troca de senha.
-- Token de sessão emitido antes deste instante deixa de valer (lib/auth.ts).
-- Só a service role escreve aqui: authenticated tem UPDATE apenas em full_name e
-- avatar_url (migration 20260924).
alter table public.profiles add column if not exists sessions_valid_after timestamptz;

-- M11: funções SECURITY DEFINER legadas sem search_path fixo. Com '' toda tabela
-- precisa vir qualificada; as três definições do repositório já vêm (public.profiles).
-- is_admin() só existe em bancos que rodaram supabase/schema-auth-roles.sql.
do $$
declare
  fn text;
begin
  foreach fn in array array['public.get_current_user_role()', 'public.is_admin()', 'public.handle_new_user()'] loop
    if to_regprocedure(fn) is not null then
      execute format('alter function %s set search_path = ''''', fn);
    end if;
  end loop;
end
$$;

-- B6: o avatar_url do cadastro vem de raw_user_meta_data, que o próprio usuário
-- escreve pela API pública. Só entra https de host conhecido (Supabase Storage,
-- Google e o avatar padrão); qualquer outro vira o avatar padrão, sem beacon de
-- rastreamento. Mesma função da migration 20260927, com o filtro a mais.
create or replace function public.prx_guard_signup_profile()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if session_user = 'supabase_auth_admin' then
    new.nxt_score := 250;
    new.nxt_level := 1;
    new.prx_coins := 0;
    if new.avatar_url is not null
       and new.avatar_url !~* '^https://([a-z0-9-]+\.)*(supabase\.co|googleusercontent\.com|unsplash\.com)/' then
      new.avatar_url := 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&h=200&fit=crop&q=80';
    end if;
  end if;
  return new;
end;
$$;

-- M12: o bucket público 'benefits' deixa de aceitar SVG (XSS armazenado). A rota
-- /api/admin/upload já recusa; isto fecha também no próprio bucket. SVGs que já
-- estejam lá continuam: veja a consulta de auditoria no relatório.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    update storage.buckets
       set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
     where id = 'benefits';
  end if;
end
$$;

-- B7: ícone genérico 'Sparkles' na categoria Beleza.
do $$
begin
  if to_regclass('public.categories') is not null then
    update public.categories set icon = 'Scissors' where id = 'beleza' and icon = 'Sparkles';
  end if;
end
$$;

commit;
