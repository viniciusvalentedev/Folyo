-- ============================================================================
-- Folyo · Etapa 4 · Painel administrativo (fundação)
--
-- Como usar: Supabase → SQL Editor → New query → cole este arquivo inteiro → Run.
-- Rode DEPOIS da etapa 3 (20261022000001_etapa3_limite_de_pedidos.sql). Rode uma vez só.
-- Pode rodar antes de publicar o código novo (o site antigo continua funcionando).
--
-- O que entra:
--   - papéis da equipe: editor (1), administrador (2) e proprietário (3).
--     Quem não tem papel é aluno (0) e não vê nada do painel;
--   - suspensão de contas: a conta suspensa continua existindo (nada é apagado),
--     mas o banco não deixa ela ler nem gravar nada;
--   - histórico de auditoria: toda mudança de papel e suspensão fica registrada;
--   - funções do painel (admin_*): cada uma confere, NO BANCO, o papel de quem chamou.
--
-- Segurança:
--   - Papéis, suspensões e histórico ficam no schema "private" (fora da API), com
--     RLS ligado e sem nenhuma regra: ninguém lê nem grava direto pela internet.
--   - O site continua usando só a publishable key. As funções admin_* rodam com
--     permissão do dono ("security definer"), mas a PRIMEIRA coisa que fazem é
--     conferir o papel de quem está logado. Aluno que chamar direto pela API
--     recebe "sem permissão".
--   - Ninguém altera o próprio papel nem se reativa. Administradores só mexem em
--     contas com papel abaixo do deles e só concedem "editor". Só o proprietário
--     concede "administrador" ou "proprietário".
--   - O painel mostra resumos (quantas aulas, quais cursos). Anotações, projetos e
--     currículo dos alunos NÃO aparecem para a equipe.
--
-- Depois de rodar, siga o passo "Virar proprietário" do supabase/README.md.
-- ============================================================================

begin;

-- 1. Tabelas (no schema private, fora da API) ---------------------------------

create table private.staff_roles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  role       text not null check (role in ('editor', 'admin', 'proprietario')),
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now()
);
comment on table private.staff_roles is 'Papel de quem é da equipe. Sem linha aqui = aluno.';

create table private.suspensions (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  reason       text not null default '' check (char_length(reason) <= 500),
  suspended_by uuid references auth.users (id) on delete set null,
  suspended_at timestamptz not null default now()
);
comment on table private.suspensions is 'Contas suspensas. A conta e os dados continuam guardados.';

create table private.admin_audit (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  actor_id     uuid references auth.users (id) on delete set null,
  actor_label  text not null check (char_length(actor_label) <= 400),
  actor_role   text not null,
  action       text not null check (action ~ '^[a-z]+\.[a-z]+$'),
  target_id    uuid references auth.users (id) on delete set null,
  target_label text not null default '' check (char_length(target_label) <= 400),
  detail       text not null default '' check (char_length(detail) <= 700)
);
comment on table private.admin_audit is 'Histórico do painel: quem fez o quê, quando e em quem.';
create index admin_audit_at_idx on private.admin_audit (at desc);

alter table private.staff_roles enable row level security;
alter table private.suspensions enable row level security;
alter table private.admin_audit enable row level security;
revoke all on table private.staff_roles, private.suspensions, private.admin_audit from public, anon, authenticated, service_role;

-- 2. Funções auxiliares (privadas) --------------------------------------------

create function private.role_rank(r text)
returns int
language sql
immutable
set search_path = ''
as $$
  select case r when 'editor' then 1 when 'admin' then 2 when 'proprietario' then 3 else 0 end
$$;

-- Conta do aluno logado NÃO está suspensa? (usada nas regras de todas as tabelas)
create function private.not_suspended()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from private.suspensions s where s.user_id = (select auth.uid()))
$$;

-- Papel de quem está logado, em número. Conta suspensa vale 0 (perde o painel).
create function private.actor_rank()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then 0
    when exists (select 1 from private.suspensions s where s.user_id = auth.uid()) then 0
    else coalesce((select private.role_rank(r.role) from private.staff_roles r where r.user_id = auth.uid()), 0)
  end
$$;

-- Para no meio se quem chamou não tem o papel mínimo.
create function private.require_rank(needed int)
returns int
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_rank int := private.actor_rank();
begin
  if current_rank < needed then
    raise exception 'Seu papel não dá acesso a esta ação.' using errcode = 'FA403';
  end if;
  return current_rank;
end;
$$;

-- Nome para mostrar no histórico ("Nome · e-mail").
create function private.account_label(uid uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select left(concat_ws(' · ', nullif(trim(p.name), ''), u.email), 400)
  from auth.users u left join public.profiles p on p.id = u.id
  where u.id = uid
$$;

create function private.audit(action text, target uuid, detail text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.admin_audit (actor_id, actor_label, actor_role, action, target_id, target_label, detail)
  values (
    auth.uid(),
    coalesce(private.account_label(auth.uid()), '—'),
    coalesce((select r.role from private.staff_roles r where r.user_id = auth.uid()), 'aluno'),
    action,
    target,
    coalesce(private.account_label(target), ''),
    left(coalesce(detail, ''), 700)
  )
$$;

revoke execute on function private.role_rank(text), private.actor_rank(), private.require_rank(int),
  private.account_label(uuid), private.audit(text, uuid, text) from public, anon, authenticated, service_role;
-- As regras (RLS) chamam esta com a permissão de quem está lendo/gravando.
revoke execute on function private.not_suspended() from public, anon, service_role;
grant execute on function private.not_suspended() to authenticated;

-- 3. Conta suspensa não lê nem grava nada -------------------------------------
-- "restrictive" = soma (E) com as regras que já existem: além de ser dono da
-- linha, a conta precisa não estar suspensa.
create policy "Conta suspensa não acessa" on public.profiles as restrictive for all to authenticated
  using ((select private.not_suspended())) with check ((select private.not_suspended()));
create policy "Conta suspensa não acessa" on public.course_progress as restrictive for all to authenticated
  using ((select private.not_suspended())) with check ((select private.not_suspended()));
create policy "Conta suspensa não acessa" on public.lesson_completions as restrictive for all to authenticated
  using ((select private.not_suspended())) with check ((select private.not_suspended()));
create policy "Conta suspensa não acessa" on public.lesson_notes as restrictive for all to authenticated
  using ((select private.not_suspended())) with check ((select private.not_suspended()));
create policy "Conta suspensa não acessa" on public.projects as restrictive for all to authenticated
  using ((select private.not_suspended())) with check ((select private.not_suspended()));
create policy "Conta suspensa não acessa" on public.skills as restrictive for all to authenticated
  using ((select private.not_suspended())) with check ((select private.not_suspended()));

-- 4. Funções que o site chama (API) -------------------------------------------
-- Todas: security definer + search_path vazio + checagem de papel no começo.

-- Papel e situação da PRÓPRIA conta (qualquer aluno logado).
create function public.my_account()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'role', coalesce((select r.role from private.staff_roles r where r.user_id = auth.uid()), 'aluno'),
    'suspended', exists (select 1 from private.suspensions s where s.user_id = auth.uid())
  )
  where auth.uid() is not null
$$;

-- Visão geral (editor ou acima). Só números; nada que identifique alunos,
-- exceto "atividades recentes", que só vai para administrador ou acima.
create function public.admin_overview(p_days int)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor int := private.require_rank(1);
  days int := case when p_days in (7, 30, 90) then p_days else 30 end;
  tz constant text := 'America/Sao_Paulo';
  today date := (now() at time zone tz)::date;
  cur_from date := today - (days - 1);
  prev_from date := cur_from - days;
  result jsonb;
begin
  with ev as (
    select user_id, (completed_at at time zone tz)::date as d from public.lesson_completions
    union all select user_id, (started_at at time zone tz)::date from public.course_progress where started_at is not null
    union all select user_id, (started_at at time zone tz)::date from public.projects
    union all select user_id, (completed_at at time zone tz)::date from public.projects where completed_at is not null
    union all select id, (last_sign_in_at at time zone tz)::date from auth.users where last_sign_in_at is not null
  ),
  period(k, f, t) as (values ('cur', cur_from, today), ('prev', prev_from, cur_from - 1)),
  metrics as (
    select p.k, jsonb_build_object(
      'newUsers', (select count(*) from public.profiles x where (x.created_at at time zone tz)::date between p.f and p.t),
      'enrollments', (select count(*) from public.course_progress x where x.started_at is not null and (x.started_at at time zone tz)::date between p.f and p.t),
      'lessons', (select count(*) from public.lesson_completions x where (x.completed_at at time zone tz)::date between p.f and p.t),
      'projectsDone', (select count(*) from public.projects x where x.completed_at is not null and (x.completed_at at time zone tz)::date between p.f and p.t),
      'activeUsers', (select count(distinct e.user_id) from ev e where e.d between p.f and p.t)
    ) as m
    from period p
  ),
  daily as (
    select g.d::date as d,
      (select count(*) from public.profiles x where (x.created_at at time zone tz)::date = g.d::date) as new_users,
      (select count(*) from public.course_progress x where x.started_at is not null and (x.started_at at time zone tz)::date = g.d::date) as enrollments,
      (select count(*) from public.lesson_completions x where (x.completed_at at time zone tz)::date = g.d::date) as lessons,
      (select count(distinct e.user_id) from ev e where e.d = g.d::date) as active
    from generate_series(cur_from::timestamp, today::timestamp, interval '1 day') as g(d)
  )
  select jsonb_build_object(
    'days', days,
    'from', cur_from,
    'to', today,
    'prevFrom', prev_from,
    'prevTo', cur_from - 1,
    'totalUsers', (select count(*) from public.profiles),
    'onboarded', (select count(*) from public.profiles where onboarded),
    'suspended', (select count(*) from private.suspensions),
    'staff', (select count(*) from private.staff_roles),
    'cur', (select m from metrics where k = 'cur'),
    'prev', (select m from metrics where k = 'prev'),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'newUsers', new_users, 'enrollments', enrollments, 'lessons', lessons, 'active', active) order by d), '[]'::jsonb) from daily),
    'enrolled', (select coalesce(jsonb_agg(jsonb_build_object('courseId', course_id, 'n', n)), '[]'::jsonb)
                 from (select course_id, count(*) as n from public.course_progress where started group by course_id) x),
    'lessonsHist', (select coalesce(jsonb_agg(jsonb_build_object('courseId', course_id, 'lessons', lessons, 'users', users)), '[]'::jsonb)
                    from (select course_id, lessons, count(*) as users
                          from (select course_id, user_id, count(*) as lessons from public.lesson_completions group by course_id, user_id) a
                          group by course_id, lessons) b),
    'recent', case when actor >= 2 then (
      select coalesce(jsonb_agg(r order by (r->>'at')::timestamptz desc), '[]'::jsonb) from (
        (select jsonb_build_object('at', a.at, 'kind', a.action, 'target', a.target_label, 'by', a.actor_label, 'detail', a.detail) as r
         from private.admin_audit a order by a.at desc limit 10)
        union all
        (select jsonb_build_object('at', p.created_at, 'kind', 'usuario.cadastrado', 'target', coalesce(nullif(trim(p.name), ''), 'Sem nome'), 'by', null, 'detail', '')
         from public.profiles p order by p.created_at desc limit 10)
      ) feed
    ) else null end
  ) into result;
  return result;
end;
$$;

-- Lista de contas (administrador ou acima), com filtros e páginas de 25.
create function public.admin_list_users(
  p_search text default '',
  p_status text default 'all',
  p_role text default 'all',
  p_since int default null,
  p_sort text default 'created',
  p_page int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor int := private.require_rank(2);
  q text := left(trim(coalesce(p_search, '')), 100);
  pattern text;
  page int := greatest(0, least(coalesce(p_page, 0), 10000));
  page_size constant int := 25;
  result jsonb;
begin
  if coalesce(p_status, '') not in ('all', 'ativo', 'suspenso')
     or coalesce(p_role, '') not in ('all', 'aluno', 'editor', 'admin', 'proprietario', 'equipe')
     or (p_since is not null and p_since not in (7, 30, 90))
     or coalesce(p_sort, '') not in ('created', 'active', 'name') then
    raise exception 'Filtro inválido.' using errcode = 'FA400';
  end if;
  -- Busca literal: % e _ digitados não viram curinga.
  pattern := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  with base as (
    select p.id, p.name, u.email, p.created_at, p.onboarded,
      coalesce(r.role, 'aluno') as role,
      (s.user_id is not null) as suspended,
      greatest(
        u.last_sign_in_at,
        (select max(x.completed_at) from public.lesson_completions x where x.user_id = p.id),
        (select max(x.started_at) from public.course_progress x where x.user_id = p.id),
        (select max(greatest(x.started_at, x.completed_at)) from public.projects x where x.user_id = p.id)
      ) as last_active_at,
      (select count(*) from public.course_progress x where x.user_id = p.id and x.started) as courses,
      (select count(*) from public.lesson_completions x where x.user_id = p.id) as lessons
    from public.profiles p
    join auth.users u on u.id = p.id
    left join private.staff_roles r on r.user_id = p.id
    left join private.suspensions s on s.user_id = p.id
  ),
  filtered as (
    select * from base b
    where (q = '' or b.name ilike pattern escape '\' or b.email ilike pattern escape '\')
      and (p_status = 'all' or (p_status = 'suspenso') = b.suspended)
      and (p_role = 'all' or (p_role = 'equipe' and b.role <> 'aluno') or b.role = p_role)
      and (p_since is null or b.created_at >= now() - make_interval(days => p_since))
  ),
  ordered as (
    select f.*, row_number() over (
      order by
        case when p_sort = 'name' then lower(f.name) end asc,
        case when p_sort = 'active' then f.last_active_at end desc nulls last,
        f.created_at desc,
        f.id
    ) as ord
    from filtered f
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'page', page,
    'pageSize', page_size,
    'rows', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id, 'name', o.name, 'email', o.email, 'createdAt', o.created_at, 'lastActiveAt', o.last_active_at,
        'onboarded', o.onboarded, 'role', o.role, 'suspended', o.suspended, 'courses', o.courses, 'lessons', o.lessons
      ) order by o.ord), '[]'::jsonb)
      from ordered o where o.ord > page * page_size and o.ord <= (page + 1) * page_size),
    'summary', jsonb_build_object(
      'accounts', (select count(*) from base),
      'active7', (select count(*) from base where last_active_at >= now() - interval '7 days'),
      'suspended', (select count(*) from base where suspended)
    )
  ) into result;
  return result;
end;
$$;

-- Ficha de uma conta (administrador ou acima). Só resumo: sem anotações, sem
-- conteúdo de projetos e sem currículo.
create function public.admin_user_detail(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor int := private.require_rank(2);
  tz constant text := 'America/Sao_Paulo';
  result jsonb;
begin
  select jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'email', u.email,
    'createdAt', p.created_at,
    'lastSignInAt', u.last_sign_in_at,
    'onboarded', p.onboarded,
    'stage', p.stage,
    'goal', p.goal_primary,
    'role', coalesce(r.role, 'aluno'),
    'suspension', case when s.user_id is null then null else jsonb_build_object(
      'at', s.suspended_at, 'reason', s.reason, 'by', private.account_label(s.suspended_by)) end,
    'lessons', (select count(*) from public.lesson_completions x where x.user_id = p.id),
    'projects', (select count(*) from public.projects x where x.user_id = p.id),
    'projectsDone', (select count(*) from public.projects x where x.user_id = p.id and x.status = 'concluido'),
    'skills', (select count(*) from public.skills x where x.user_id = p.id),
    'activeDays30', (select count(distinct d) from (
        select (x.completed_at at time zone tz)::date as d from public.lesson_completions x where x.user_id = p.id
        union all select (x.started_at at time zone tz)::date from public.course_progress x where x.user_id = p.id and x.started_at is not null
        union all select (x.started_at at time zone tz)::date from public.projects x where x.user_id = p.id
        union all select (u.last_sign_in_at at time zone tz)::date where u.last_sign_in_at is not null
      ) a where a.d >= (now() at time zone tz)::date - 29),
    'progress', (select coalesce(jsonb_agg(jsonb_build_object(
        'courseId', c.course_id, 'startedAt', c.started_at, 'done', c.done, 'lastAt', c.last_at) order by c.last_at desc nulls last), '[]'::jsonb)
      from (
        select cp.course_id, cp.started_at,
          (select count(*) from public.lesson_completions x where x.user_id = p.id and x.course_id = cp.course_id) as done,
          (select max(x.completed_at) from public.lesson_completions x where x.user_id = p.id and x.course_id = cp.course_id) as last_at
        from public.course_progress cp where cp.user_id = p.id and cp.started
      ) c)
  ) into result
  from public.profiles p
  join auth.users u on u.id = p.id
  left join private.staff_roles r on r.user_id = p.id
  left join private.suspensions s on s.user_id = p.id
  where p.id = p_user;
  return result;
end;
$$;

-- Equipe com acesso ao painel (administrador ou acima).
create function public.admin_staff()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor int := private.require_rank(2);
begin
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.user_id, 'name', p.name, 'email', u.email, 'role', r.role, 'grantedAt', r.granted_at,
      'grantedBy', private.account_label(r.granted_by), 'suspended', s.user_id is not null
    ) order by private.role_rank(r.role) desc, r.granted_at), '[]'::jsonb)
    from private.staff_roles r
    join auth.users u on u.id = r.user_id
    left join public.profiles p on p.id = r.user_id
    left join private.suspensions s on s.user_id = r.user_id
  );
end;
$$;

-- Histórico de auditoria (administrador ou acima), mais recentes primeiro.
create function public.admin_audit_log(p_kind text default 'all', p_limit int default 100)
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
      select a.at, jsonb_build_object('id', a.id, 'at', a.at, 'action', a.action, 'actor', a.actor_label,
        'actorRole', a.actor_role, 'target', a.target_label, 'targetId', a.target_id, 'detail', a.detail) as j
      from private.admin_audit a
      where p_kind = 'all' or a.action like p_kind || '.%'
      order by a.at desc
      limit lim
    ) x
  );
end;
$$;

-- Muda o papel de uma conta.
-- Regras: ninguém muda o próprio papel; administrador só mexe em quem está abaixo
-- dele e só concede "editor" (ou volta para aluno); proprietário pode tudo.
create function public.admin_set_role(p_user uuid, p_role text)
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

  if p_role = 'aluno' then
    delete from private.staff_roles where user_id = p_user;
  else
    insert into private.staff_roles (user_id, role, granted_by) values (p_user, p_role, auth.uid())
    on conflict (user_id) do update set role = excluded.role, granted_by = excluded.granted_by, granted_at = now();
  end if;
  perform private.audit('permissao.alterada', p_user, old_role || ' → ' || p_role);
  return jsonb_build_object('role', p_role, 'changed', true);
end;
$$;

-- Suspende ou reativa uma conta (administrador ou acima, só em quem está abaixo;
-- o proprietário pode em qualquer outra conta).
create function public.admin_set_suspended(p_user uuid, p_suspended boolean, p_reason text default '')
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
  if p_suspended then
    insert into private.suspensions (user_id, reason, suspended_by) values (p_user, reason, auth.uid());
    perform private.audit('usuario.suspenso', p_user, reason);
  else
    delete from private.suspensions where user_id = p_user;
    perform private.audit('usuario.reativado', p_user, '');
  end if;
  return jsonb_build_object('suspended', p_suspended, 'changed', true);
end;
$$;

-- Só alunos logados chamam (e cada função confere o papel lá dentro).
revoke execute on function
  public.my_account(),
  public.admin_overview(int),
  public.admin_list_users(text, text, text, int, text, int),
  public.admin_user_detail(uuid),
  public.admin_staff(),
  public.admin_audit_log(text, int),
  public.admin_set_role(uuid, text),
  public.admin_set_suspended(uuid, boolean, text)
from public, anon, service_role;
grant execute on function
  public.my_account(),
  public.admin_overview(int),
  public.admin_list_users(text, text, text, int, text, int),
  public.admin_user_detail(uuid),
  public.admin_staff(),
  public.admin_audit_log(text, int),
  public.admin_set_role(uuid, text),
  public.admin_set_suspended(uuid, boolean, text)
to authenticated;

commit;
