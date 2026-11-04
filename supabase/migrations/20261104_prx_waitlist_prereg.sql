-- Pré-cadastro do /em-breve: além do e-mail, a Lista de Espera VIP guarda celular e idade.
-- Leads antigos (só e-mail) ficam com as duas colunas vazias. O app segue aceitando o
-- cadastro mesmo antes desta migração (grava só e-mail e nome), mas celular e idade
-- só ficam salvos depois que ela for aplicada.
alter table public.waitlist_signups
  add column if not exists phone text check (phone is null or phone ~ '^[0-9]{10,11}$'),
  add column if not exists age smallint check (age is null or age between 0 and 120);
