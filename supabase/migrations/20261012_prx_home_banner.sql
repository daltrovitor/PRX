-- ============================================================================
-- PRX — BANNER DA HOME (12/10/2026)
--
-- O banner abaixo dos eventos na Home é um Destaque de imagem: o mesmo cadastro
-- da aba Destaques do admin (parceiro, título, legenda, botão de ação, ordem,
-- ativo e métricas), mas com a imagem como arte e sem vídeo. Tem o mesmo visual
-- dos vídeos do feed (marca como "Parceiro PRX" e botão de ação).
--
-- partner_reels.placement: 'feed' (vídeo vertical na aba Destaques, como hoje) ou
-- 'home' (banner de imagem na Home). Só ADICIONA uma coluna, um índice e regras;
-- nenhuma linha existente muda. Idempotente. Antes desta migração o feed segue
-- igual e o admin recebe o aviso "Falta aplicar a migração" ao criar um banner.
-- ============================================================================

begin;

alter table public.partner_reels add column if not exists placement text not null default 'feed';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'partner_reels_placement_valid') then
    alter table public.partner_reels add constraint partner_reels_placement_valid check (placement in ('feed', 'home'));
  end if;
end $$;

-- Banner não tem vídeo: o campo passa a aceitar vazio. O feed continua exigindo
-- vídeo e o banner exige imagem (regra partner_reels_media_by_placement).
alter table public.partner_reels alter column video_url drop not null;
alter table public.partner_reels drop constraint if exists partner_reels_video_url_check;
alter table public.partner_reels add constraint partner_reels_video_url_check check (video_url is null or video_url ~* '^(https://|/)');

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'partner_reels_media_by_placement') then
    alter table public.partner_reels add constraint partner_reels_media_by_placement check (
      (placement = 'feed' and video_url is not null) or (placement = 'home' and poster_url is not null)
    );
  end if;
end $$;

create index if not exists partner_reels_placement_idx on public.partner_reels(placement, is_active, sort_order);

commit;
