-- Hello World
-- ============================================================================
-- PRX: foto do Insider no catálogo da Resenha (01/11/2026)
--
-- resenha_insiders.avatar_url: a foto cadastrada no admin aparece, junto com
-- nome e @, no catálogo de Insiders onde o membro pede o convite. Sem foto, o
-- app mostra as iniciais. Idempotente.
-- ============================================================================
alter table public.resenha_insiders add column if not exists avatar_url text check (avatar_url is null or char_length(avatar_url) <= 2000000);
