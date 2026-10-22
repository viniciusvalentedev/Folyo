-- ============================================================================
-- Folyo · Etapa 4b · Reforço de segurança do painel administrativo
--
-- Como usar: Supabase → SQL Editor → New query → cole este arquivo inteiro → Run.
-- Rode DEPOIS da etapa 4 (20261022000002_etapa4_painel_admin.sql). Rode uma vez só.
--
-- O que muda (achados da revisão de segurança):
--   1. Proprietário só pelo SQL Editor: o painel não cria, não rebaixa e não
--      suspende nenhum proprietário. Ninguém da equipe consegue tomar o lugar do dono.
--   2. Sempre sobra pelo menos um proprietário ativo (vale também para o SQL
--      Editor e para exclusão de conta).
--   3. Pedidos ao mesmo tempo passam numa fila única, e o papel de quem pede é
--      conferido DE NOVO depois de entrar na fila (quem acabou de perder o papel
--      não termina a ação).
--   4. Histórico: não pode ser alterado nem apagado; mudanças feitas fora do
--      painel (SQL Editor, dashboard) também ficam registradas; quem fez continua
--      identificado mesmo se a conta for excluída.
--   5. Nomes não aceitam caracteres invisíveis, de controle ou o separador "·"
--      (impede alguém se passar por outra pessoa no histórico).
--   6. Limite de alterações por minuto também nas ações do painel.
--   7. Funções novas criadas no futuro NÃO ficam abertas para a internet por padrão.
-- ============================================================================

begin;

-- 7. Funções novas não ganham permissão automática para visitantes/alunos ------
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

-- 2. Pelo menos um proprietário ativo, por qualquer caminho -------------------
create function private.guard_last_owner()
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
    if old.role <> 'proprietario' or (tg_op = 'UPDATE' and new.role = 'proprietario' and new.user_id = old.user_id) then
      return coalesce(new, old);
    end if;
    target := old.user_id;
  else
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
create trigger guard_last_owner before update or delete on private.staff_roles
  for each row execute function private.guard_last_owner();
create trigger guard_last_owner before insert on private.suspensions
  for each row execute function private.guard_last_owner();

-- 4. Histórico só cresce ------------------------------------------------------
-- Quem fez não some do histórico se a conta for excluída (sem chave estrangeira).
alter table private.admin_audit drop constraint admin_audit_actor_id_fkey;

create function private.audit_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Única mudança aceita: a conta-alvo foi excluída e o banco limpa o id dela.
  if tg_op = 'UPDATE' and new.target_id is null
     and (new.id, new.at, new.actor_id, new.actor_label, new.actor_role, new.action, new.target_label, new.detail)
         is not distinct from (old.id, old.at, old.actor_id, old.actor_label, old.actor_role, old.action, old.target_label, old.detail) then
    return new;
  end if;
  raise exception 'O histórico não pode ser alterado.' using errcode = 'FA403';
end;
$$;
create trigger admin_audit_append_only before update or delete on private.admin_audit
  for each row execute function private.audit_append_only();
create trigger admin_audit_no_truncate before truncate on private.admin_audit
  for each statement execute function private.audit_append_only();

-- Mudanças feitas FORA do painel (SQL Editor, dashboard) também vão para o histórico.
-- As funções do painel marcam a transação e registram com mais detalhe.
create function private.audit_outside_panel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid := coalesce(new.user_id, old.user_id);
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
    info := case when tg_op = 'INSERT' then new.reason else '' end;
  end if;
  -- Conta sendo excluída: o registro fica sem id (a conta não existe mais).
  if not exists (select 1 from auth.users u where u.id = target) then
    target := null;
  end if;
  insert into private.admin_audit (actor_id, actor_label, actor_role, action, target_id, target_label, detail)
  values (
    auth.uid(),
    coalesce(private.account_label(auth.uid()), 'Fora do painel (' || current_user || ')'),
    coalesce((select r.role from private.staff_roles r where r.user_id = auth.uid()), case when auth.uid() is null then 'sistema' else 'aluno' end),
    act,
    target,
    coalesce(private.account_label(target), ''),
    left(info || ' (fora do painel)', 700)
  );
  return null;
end;
$$;
create trigger audit_outside_panel after insert or update or delete on private.staff_roles
  for each row execute function private.audit_outside_panel();
create trigger audit_outside_panel after insert or delete on private.suspensions
  for each row execute function private.audit_outside_panel();

-- 6. Limite de alterações por minuto também no painel (mesma regra da etapa 3) -
create trigger write_rate before insert or update or delete on private.staff_roles
  for each statement execute function private.enforce_write_rate();
create trigger write_rate before insert or update or delete on private.suspensions
  for each statement execute function private.enforce_write_rate();

revoke execute on function private.guard_last_owner(), private.audit_append_only(), private.audit_outside_panel()
  from public, anon, authenticated, service_role;

-- 5. Nomes sem caracteres invisíveis, de controle ou "·" -----------------------
-- "not valid": vale para tudo que for gravado daqui em diante.
alter table public.profiles add constraint profiles_name_plain
  check (name !~ '[[:cntrl:]­​-‏ -‮⁠-⁩﻿·]') not valid;

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
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 1 e 3. Ações do painel -------------------------------------------------------
create or replace function public.admin_set_role(p_user uuid, p_role text)
returns jsonb
language plpgsql
volatile
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
  if p_role = 'proprietario' then
    raise exception 'O papel de proprietário só pode ser dado pelo SQL Editor do Supabase.' using errcode = 'FA403';
  end if;
  if p_user is null or not exists (select 1 from auth.users where id = p_user) then
    raise exception 'Conta não encontrada.' using errcode = 'FA404';
  end if;
  if p_user = auth.uid() then
    raise exception 'Você não pode alterar o próprio papel.' using errcode = 'FA403';
  end if;

  -- Fila única para mudanças da equipe; depois dela, o papel de quem pede é conferido de novo.
  perform pg_advisory_xact_lock(hashtextextended('staff:global', 0));
  actor := private.require_rank(2);
  old_role := coalesce((select role from private.staff_roles where user_id = p_user), 'aluno');
  target_rank := private.role_rank(old_role);

  if old_role = 'proprietario' then
    raise exception 'A conta de proprietário não pode ser alterada pelo painel.' using errcode = 'FA403';
  end if;
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
volatile
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
  if p_user is null or not exists (select 1 from auth.users where id = p_user) then
    raise exception 'Conta não encontrada.' using errcode = 'FA404';
  end if;
  if p_user = auth.uid() then
    raise exception 'Você não pode suspender nem reativar a própria conta.' using errcode = 'FA403';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('staff:global', 0));
  actor := private.require_rank(2);
  target_rank := coalesce((select private.role_rank(role) from private.staff_roles where user_id = p_user), 0);
  if target_rank >= 3 then
    raise exception 'A conta de proprietário não pode ser suspensa pelo painel.' using errcode = 'FA403';
  end if;
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

-- Histórico agora devolve também o id de quem fez.
create or replace function public.admin_audit_log(p_kind text default 'all', p_limit int default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor int := private.require_rank(2);
  lim int := greatest(1, least(coalesce(p_limit, 100), 300));
begin
  if coalesce(p_kind, '') not in ('all', 'permissao', 'usuario') then
    raise exception 'Filtro inválido.' using errcode = 'FA400';
  end if;
  return (
    select coalesce(jsonb_agg(x.j order by x.at desc), '[]'::jsonb) from (
      select a.at, jsonb_build_object('id', a.id, 'at', a.at, 'action', a.action, 'actor', a.actor_label, 'actorId', a.actor_id,
        'actorRole', a.actor_role, 'target', a.target_label, 'targetId', a.target_id, 'detail', a.detail) as j
      from private.admin_audit a
      where p_kind = 'all' or a.action like p_kind || '.%'
      order by a.at desc
      limit lim
    ) x
  );
end;
$$;

-- "create or replace" mantém as permissões, mas reforçamos.
revoke execute on function public.admin_set_role(uuid, text), public.admin_set_suspended(uuid, boolean, text),
  public.admin_audit_log(text, int) from public, anon, service_role;
grant execute on function public.admin_set_role(uuid, text), public.admin_set_suspended(uuid, boolean, text),
  public.admin_audit_log(text, int) to authenticated;

commit;
