-- Hello World
-- ============================================================================
-- PRX: selos (badges) em benefícios e parceiros (18/10/2026)
--
-- A equipe escolhe no admin quais selos cada benefício ou parceiro concede
-- (GREEN FLAG, FIT CHECK...). O selo do parceiro vale para todos os
-- benefícios dele. A lista de selos vive em lib/badges/catalog.ts; o banco só
-- aceita códigos conhecidos e no máximo 4 por item.
--
-- Sem esta migração o app segue funcionando: benefícios e parceiros são
-- salvos sem selos e o admin recebe o aviso ao tentar escolher um.
-- Idempotente.
-- ============================================================================
begin;

alter table public.benefits add column if not exists badges text[] not null default '{}';
alter table public.partners add column if not exists badges text[] not null default '{}';

alter table public.benefits drop constraint if exists benefits_badges_check;
alter table public.benefits
  add constraint benefits_badges_check check (
    cardinality(badges) <= 4
    and badges <@ array[
      'green_flag', 'well_mode', 'page_up', 'irl', 'moneywise', 'a_plus', 'fit_check', 'move', 'builder', 'good_human',
      'mindset', 'world_plus', 'creator', 'first_move', 'self_care', 'social_mode', 'smart_buy', 'rare', 'streak', 'level_up'
    ]::text[]
  );

alter table public.partners drop constraint if exists partners_badges_check;
alter table public.partners
  add constraint partners_badges_check check (
    cardinality(badges) <= 4
    and badges <@ array[
      'green_flag', 'well_mode', 'page_up', 'irl', 'moneywise', 'a_plus', 'fit_check', 'move', 'builder', 'good_human',
      'mindset', 'world_plus', 'creator', 'first_move', 'self_care', 'social_mode', 'smart_buy', 'rare', 'streak', 'level_up'
    ]::text[]
  );

-- Busca "benefícios com o selo X" (ex.: combos e filtros futuros).
create index if not exists benefits_badges_idx on public.benefits using gin (badges);
create index if not exists partners_badges_idx on public.partners using gin (badges);

commit;
