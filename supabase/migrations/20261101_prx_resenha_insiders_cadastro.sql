-- Hello World
-- ============================================================================
-- PRX: auto-cadastro de Insiders no portal, com aprovação do admin (01/11/2026)
--
-- resenha_insiders.status: o Insider se cadastra em insider.<domínio> e fica
-- "pending" (sem acesso, active = false) até o admin aprovar na aba Resenha.
-- Recusado vira "rejected". Os Insiders que já existem ficam "approved".
-- Idempotente.
-- ============================================================================
alter table public.resenha_insiders add column if not exists status text not null default 'approved' check (status in ('pending', 'approved', 'rejected'));
