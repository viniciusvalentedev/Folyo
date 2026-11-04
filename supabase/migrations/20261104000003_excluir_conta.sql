-- ============================================================================
-- Folyo · "Excluir minha conta" volta a funcionar (LGPD, direito de eliminação)
--
-- Como usar: Supabase → SQL Editor → New query → cole este arquivo inteiro → Run.
-- Pode rodar ANTES ou DEPOIS de publicar o código (o site já chama delete_my_account; nada muda no código).
-- Tudo roda numa transação. Pode ser rodado de novo. NÃO apaga nenhuma conta ao rodar.
--
-- Por quê: a revisão de 04/11/2026 achou que public.delete_my_account() NÃO existe no banco de produção. A migration
-- 20261027000001_lgpd_conta.sql (no histórico do git) nunca foi aplicada lá; o export_my_data existe porque migrations
-- seguintes o recriaram. Resultado: em Configurações → "Excluir minha conta", depois da senha, a exclusão sempre falhava.
--
-- O que muda (o mesmo da migration LGPD, mais a regra do último proprietário dentro da própria função):
--   1. private.enforce_write_rate(): o limite de gravações ignora contas que já não existem. Sem isso, as remoções em
--      cascata (perfil, progresso...) tentam gravar o contador de uma conta que está sendo apagada e tudo falha.
--   2. public.delete_my_account(): apaga a conta de quem chama (auth.users); o resto some junto (on delete cascade).
--      Pedidos e pagamentos ficam, sem o dono (on delete set null), por obrigação fiscal.
--      Recusa (FA409) se quem chama é o ÚLTIMO proprietário ativo. A migration 20261022000003 (etapa 4b), que tinha
--      um gatilho para isso, também não está aplicada em produção; por isso a regra fica aqui dentro.
--
-- O que NÃO muda: os PDFs do Storage continuam sendo apagados pelo site (src/lib/actions/account.ts) ANTES de chamar
-- esta função, e a tela continua pedindo a senha e a palavra EXCLUIR.
-- ============================================================================

begin;

-- 1. Limite de gravações não conta alteração em nome de quem já não existe -------------------

create or replace function private.enforce_write_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  this_minute timestamptz := date_trunc('minute', now());
  this_hour timestamptz := date_trunc('hour', now());
  per_minute constant int := 120;
  per_hour constant int := 3000;
  counter private.write_rate%rowtype;
begin
  if uid is null then
    return null;
  end if;

  -- Conta sendo excluída (ou já excluída): não há mais ninguém para limitar.
  if not exists (select 1 from auth.users u where u.id = uid) then
    return null;
  end if;

  insert into private.write_rate as w (user_id, minute_start, minute_count, hour_start, hour_count)
  values (uid, this_minute, 1, this_hour, 1)
  on conflict (user_id) do update set
    minute_count = case when w.minute_start = this_minute then w.minute_count + 1 else 1 end,
    minute_start = this_minute,
    hour_count = case when w.hour_start = this_hour then w.hour_count + 1 else 1 end,
    hour_start = this_hour
  returning * into counter;

  if counter.minute_count > per_minute or counter.hour_count > per_hour then
    raise exception 'Muitas alterações seguidas. Espere um pouco e tente de novo.'
      using errcode = 'FY429';
  end if;
  return null;
end;
$$;

revoke execute on function private.enforce_write_rate() from public, anon, authenticated, service_role;

-- 2. Excluir a própria conta ------------------------------------------------------------------

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'Entre na sua conta para continuar.' using errcode = 'FA403';
  end if;

  -- Uma exclusão de proprietário por vez (dois donos saindo ao mesmo tempo não deixam a Folyo sem nenhum).
  if exists (select 1 from private.staff_roles r where r.user_id = uid and r.role = 'proprietario') then
    perform pg_advisory_xact_lock(hashtextextended('staff:global', 0));
    if not exists (
      select 1 from private.staff_roles r
       where r.role = 'proprietario' and r.user_id <> uid
         and not exists (select 1 from private.suspensions s where s.user_id = r.user_id)
    ) then
      raise exception 'É preciso manter pelo menos um proprietário ativo.' using errcode = 'FA409';
    end if;
  end if;

  delete from auth.users where id = uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon, service_role;
grant execute on function public.delete_my_account() to authenticated;

comment on function public.delete_my_account() is 'LGPD: apaga a conta de quem chama e, por cascata, os dados dela.';

commit;

-- ---------- Como desfazer (rode só se precisar; o botão "Excluir minha conta" volta a falhar) ----------
-- drop function if exists public.delete_my_account();
-- (A mudança no limite de gravações pode ficar: só deixa de contar alterações de contas que já não existem.)
