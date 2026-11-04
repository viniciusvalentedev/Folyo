-- ============================================================================
-- Folyo · Segurança do painel (o que faltava da etapa 4b em produção)
--
-- Como usar: Supabase → SQL Editor → New query → cole este arquivo inteiro → Run.
-- Pode rodar ANTES ou DEPOIS de publicar o código (o site não muda).
-- Tudo roda numa transação. Pode ser rodado de novo. NÃO apaga nem altera nenhum registro do histórico.
--
-- Por quê: a migration 20261022000003_etapa4b_seguranca_painel.sql (no histórico do git) nunca foi aplicada em
-- produção. Ela não pode ser rodada como está: as funções do painel mudaram depois e ela as trocaria por versões
-- antigas. Aqui entra só o que faltava, em cima das funções que estão em produção hoje (04/11/2026).
--
-- O que muda:
--   1. Histórico do painel (private.admin_audit) só recebe registros novos: alterar, apagar ou esvaziar (TRUNCATE) é
--      recusado, inclusive pelo SQL Editor. Única exceção: quando uma conta é excluída, o banco limpa o id dela nos
--      registros (o nome e o e-mail gravados continuam). Quem fez continua identificado mesmo se a conta dele for
--      excluída (sai a chave estrangeira do autor).
--   2. Sempre sobra pelo menos um proprietário ativo, por qualquer caminho (painel, SQL Editor, exclusão de conta):
--      rebaixar, apagar ou suspender o último proprietário ativo é recusado (FA409).
--   3. Mudanças de papel e suspensões feitas FORA do painel (SQL Editor, dashboard, exclusão de conta) também vão
--      para o histórico. As funções do painel continuam registrando do jeito delas (sem registro duplicado).
--   4. Nomes sem caracteres invisíveis, de controle ou o separador "·" (impede alguém se passar por outra pessoa no
--      histórico, que mostra "nome · e-mail"). O cadastro limpa esses caracteres; o banco recusa nas alterações.
--      Em 04/11/2026 nenhum nome tinha esses caracteres, então a regra vale também para os que já existem.
--
-- O que NÃO muda: as regras de quem pode mudar o quê no painel (admin_set_role e admin_set_suspended continuam iguais,
-- só passam a avisar que a mudança veio do painel).
-- ============================================================================

begin;

-- 1. Histórico só recebe registros novos -------------------------------------------------------

-- Quem fez não some do histórico se a conta for excluída (o id fica, sem apontar para a conta).
alter table private.admin_audit drop constraint if exists admin_audit_actor_id_fkey;

create or replace function private.audit_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Única mudança aceita: a conta-alvo foi excluída e o banco limpa o id dela (on delete set null).
  if tg_op = 'UPDATE' and new.target_id is null
     and (new.id, new.at, new.actor_id, new.actor_label, new.actor_role, new.action, new.target_label, new.detail)
         is not distinct from (old.id, old.at, old.actor_id, old.actor_label, old.actor_role, old.action, old.target_label, old.detail) then
    return new;
  end if;
  raise exception 'O histórico não pode ser alterado.' using errcode = 'FA403';
end;
$$;

drop trigger if exists admin_audit_append_only on private.admin_audit;
create trigger admin_audit_append_only before update or delete on private.admin_audit
  for each row execute function private.audit_append_only();
drop trigger if exists admin_audit_no_truncate on private.admin_audit;
create trigger admin_audit_no_truncate before truncate on private.admin_audit
  for each statement execute function private.audit_append_only();

-- 2. Pelo menos um proprietário ativo, por qualquer caminho ---------------------------------------

create or replace function private.guard_last_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('staff:global', 0));
  if tg_table_name = 'staff_roles' then
    -- Só importa quando um proprietário deixa de ser proprietário (rebaixado ou removido).
    if old.role <> 'proprietario' or (tg_op = 'UPDATE' and new.role = 'proprietario' and new.user_id = old.user_id) then
      return coalesce(new, old);
    end if;
    target := old.user_id;
  else
    -- Suspensão: só importa se a conta suspensa é de proprietário.
    if not exists (select 1 from private.staff_roles r where r.user_id = new.user_id and r.role = 'proprietario') then
      return new;
    end if;
    target := new.user_id;
  end if;
  if not exists (
    select 1 from private.staff_roles r
     where r.role = 'proprietario' and r.user_id <> target
       and not exists (select 1 from private.suspensions s where s.user_id = r.user_id)
  ) then
    raise exception 'É preciso manter pelo menos um proprietário ativo.' using errcode = 'FA409';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists guard_last_owner on private.staff_roles;
create trigger guard_last_owner before update or delete on private.staff_roles
  for each row execute function private.guard_last_owner();
drop trigger if exists guard_last_owner on private.suspensions;
create trigger guard_last_owner before insert on private.suspensions
  for each row execute function private.guard_last_owner();

-- 3. Mudanças feitas fora do painel também vão para o histórico -----------------------------------
-- As funções do painel marcam a transação (folyo.via_panel) e registram com mais detalhe.

create or replace function private.audit_outside_panel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid := coalesce(new.user_id, old.user_id);
  gone boolean;
  act text;
  info text;
begin
  if coalesce(current_setting('folyo.via_panel', true), '') = 'on' then
    return null;
  end if;
  if tg_table_name = 'staff_roles' then
    if tg_op = 'UPDATE' and new.role = old.role then
      return null;
    end if;
    act := 'permissao.alterada';
    info := coalesce(old.role, 'aluno') || ' → ' || coalesce(new.role, 'aluno');
  else
    act := case when tg_op = 'INSERT' then 'usuario.suspenso' else 'usuario.reativado' end;
    info := case when tg_op = 'INSERT' then coalesce(new.reason, '') else '' end;
  end if;
  -- Conta sendo excluída: o registro fica sem id (a conta não existe mais) e diz o motivo.
  gone := not exists (select 1 from auth.users u where u.id = target);
  insert into private.admin_audit (actor_id, actor_label, actor_role, action, target_id, target_label, detail)
  values (
    auth.uid(),
    coalesce(
      private.account_label(auth.uid()),
      case when gone and auth.uid() = target then 'A própria pessoa' else 'Fora do painel (' || current_user || ')' end
    ),
    coalesce((select r.role from private.staff_roles r where r.user_id = auth.uid()),
             case when auth.uid() is null then 'sistema' else 'aluno' end),
    act,
    case when gone then null else target end,
    coalesce(private.account_label(target), ''),
    left(info || case when gone then ' (conta excluída)' else ' (fora do painel)' end, 700)
  );
  return null;
end;
$$;

drop trigger if exists audit_outside_panel on private.staff_roles;
create trigger audit_outside_panel after insert or update or delete on private.staff_roles
  for each row execute function private.audit_outside_panel();
drop trigger if exists audit_outside_panel on private.suspensions;
create trigger audit_outside_panel after insert or delete on private.suspensions
  for each row execute function private.audit_outside_panel();

-- As funções do painel: IGUAIS às de produção, só com a marca "veio do painel" em volta da mudança.

create or replace function public.admin_set_role(p_user uuid, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor int := private.require_rank(2);
  old_role text;
  target_rank int;
  new_rank int := private.role_rank(p_role);
begin
  if p_role is null or p_role not in ('aluno', 'editor', 'admin', 'proprietario') then
    raise exception 'Papel inválido.' using errcode = 'FA400';
  end if;
  if p_user is null or not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'Conta não encontrada.' using errcode = 'FA404';
  end if;
  if p_user = auth.uid() then
    raise exception 'Você não pode alterar o próprio papel.' using errcode = 'FA403';
  end if;

  -- Trava a conta alvo: dois cliques ao mesmo tempo não furam as regras.
  perform pg_advisory_xact_lock(hashtextextended('staff:' || p_user::text, 0));
  old_role := coalesce((select role from private.staff_roles where user_id = p_user), 'aluno');
  target_rank := private.role_rank(old_role);

  if actor < 3 and (target_rank >= actor or new_rank >= actor) then
    raise exception 'Seu papel não permite essa mudança.' using errcode = 'FA403';
  end if;
  if old_role = p_role then
    return jsonb_build_object('role', p_role, 'changed', false);
  end if;

  perform set_config('folyo.via_panel', 'on', true);
  if p_role = 'aluno' then
    delete from private.staff_roles where user_id = p_user;
  else
    insert into private.staff_roles (user_id, role, granted_by) values (p_user, p_role, auth.uid())
    on conflict (user_id) do update set role = excluded.role, granted_by = excluded.granted_by, granted_at = now();
  end if;
  perform private.audit('permissao.alterada', p_user, old_role || ' → ' || p_role);
  perform set_config('folyo.via_panel', '', true);
  return jsonb_build_object('role', p_role, 'changed', true);
end;
$$;

create or replace function public.admin_set_suspended(p_user uuid, p_suspended boolean, p_reason text default '')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor int := private.require_rank(2);
  target_rank int;
  reason text := left(trim(coalesce(p_reason, '')), 500);
  was boolean;
begin
  if p_suspended is null then
    raise exception 'Pedido inválido.' using errcode = 'FA400';
  end if;
  if p_user is null or not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'Conta não encontrada.' using errcode = 'FA404';
  end if;
  if p_user = auth.uid() then
    raise exception 'Você não pode suspender nem reativar a própria conta.' using errcode = 'FA403';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('staff:' || p_user::text, 0));
  target_rank := coalesce((select private.role_rank(role) from private.staff_roles where user_id = p_user), 0);
  if actor < 3 and target_rank >= actor then
    raise exception 'Seu papel não permite mexer nesta conta.' using errcode = 'FA403';
  end if;

  was := exists (select 1 from private.suspensions where user_id = p_user);
  if p_suspended = was then
    return jsonb_build_object('suspended', was, 'changed', false);
  end if;
  perform set_config('folyo.via_panel', 'on', true);
  if p_suspended then
    insert into private.suspensions (user_id, reason, suspended_by) values (p_user, reason, auth.uid());
    perform private.audit('usuario.suspenso', p_user, reason);
  else
    delete from private.suspensions where user_id = p_user;
    perform private.audit('usuario.reativado', p_user, '');
  end if;
  perform set_config('folyo.via_panel', '', true);
  return jsonb_build_object('suspended', p_suspended, 'changed', true);
end;
$$;

-- 4. Nomes sem caracteres invisíveis, de controle ou "·" -----------------------------------------
-- Os mesmos caracteres que o site já tira (cleanName em src/lib/validation.ts).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name, contact_email)
  values (
    new.id,
    left(btrim(regexp_replace(coalesce(new.raw_user_meta_data ->> 'name', ''),
      '[[:cntrl:]­​-‏ -‮⁠-⁩﻿·]', '', 'g')), 80),
    left(coalesce(new.email, ''), 254)
  );
  return new;
end;
$$;

alter table public.profiles drop constraint if exists profiles_name_plain;
alter table public.profiles add constraint profiles_name_plain
  check (name !~ '[[:cntrl:]­​-‏ -‮⁠-⁩﻿·]');

-- Permissões -----------------------------------------------------------------------------------

revoke execute on function private.guard_last_owner(), private.audit_append_only(), private.audit_outside_panel()
  from public, anon, authenticated, service_role;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.admin_set_role(uuid, text), public.admin_set_suspended(uuid, boolean, text)
  from public, anon, service_role;
grant execute on function public.admin_set_role(uuid, text), public.admin_set_suspended(uuid, boolean, text)
  to authenticated;

commit;

-- ---------- Como desfazer (rode só se precisar) ----------
-- begin;
-- drop trigger if exists admin_audit_append_only on private.admin_audit;
-- drop trigger if exists admin_audit_no_truncate on private.admin_audit;
-- drop trigger if exists guard_last_owner on private.staff_roles;
-- drop trigger if exists guard_last_owner on private.suspensions;
-- drop trigger if exists audit_outside_panel on private.staff_roles;
-- drop trigger if exists audit_outside_panel on private.suspensions;
-- alter table public.profiles drop constraint if exists profiles_name_plain;
-- commit;
-- (As funções podem ficar: sem os gatilhos, não fazem nada. A chave estrangeira do autor não volta sozinha.)
