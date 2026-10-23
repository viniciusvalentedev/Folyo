-- ============================================================================
-- Folyo 2.0 · Área do aluno (trabalhos em PDF/link, tempo assistido, objetivos e primeiro acesso)
--
-- Como usar: Supabase → SQL Editor → New query → cole este arquivo inteiro → Run.
-- Rode DEPOIS da etapa 4b (20261022000003_etapa4b_seguranca_painel.sql). Rode uma vez só.
-- Tudo roda numa transação: se algo der erro, nada fica pela metade.
--
-- >>> ANTES DE RODAR: faça um backup (Supabase → Database → Backups) ou, no mínimo,
-- >>> confirme que não há dados importantes na tabela "projects". Este arquivo APAGA
-- >>> a tabela "projects" e as colunas "weekly_goal" e "resume_projects" (recursos que
-- >>> saíram do Folyo 2.0). Os LINKS dos projetos antigos viram "trabalhos" (works).
--
-- O que muda:
--   1. Perfil: etapa de vida como id curto, "ainda descobrindo", texto do objetivo,
--      skills desejadas e metas escolhidas no primeiro acesso. Sai a meta semanal.
--   2. Trabalhos (works): o aluno anexa PDFs (até 20 MB) ou links a cada curso (ou fora
--      da Folyo). Substitui os "projetos". Os PDFs ficam num bucket PRIVADO do Storage.
--   3. Tempo assistido por aula (lesson_watch): só cresce, e no máximo na velocidade do
--      relógio (o banco recusa tempo "inventado").
--   4. As funções do painel (admin_*) passam a contar "trabalhos" no lugar de "projetos".
--
-- Segurança (mesma linha das etapas anteriores):
--   - RLS em tudo: cada aluno só lê, cria, altera e apaga as PRÓPRIAS linhas e arquivos;
--   - permissão por coluna (o aluno nunca escolhe o dono nem as datas);
--   - limites de tamanho, de quantidade e de espaço por aluno (inclusive no Storage);
--   - links só http(s); PDF só do próprio aluno, com caminho fixo "<aluno>/<arquivo>.pdf";
--   - conta suspensa não lê nem grava nada (inclusive arquivos);
--   - limite de alterações por minuto (etapa 3) vale para as tabelas novas.
-- ============================================================================

begin;

-- 1. Perfil -------------------------------------------------------------------

alter table public.profiles
  add column exploring    boolean not null default false,
  add column goals_text   text    not null default '' check (char_length(goals_text) <= 160),
  add column goals_skills text[]  not null default '{}' check (private.text_list_ok(goals_skills, 40, 60)),
  add column goals_wants  text[]  not null default '{}'
    check (private.text_list_ok(goals_wants, 6, 40) and array_to_string(goals_wants, ',') ~ '^[a-z0-9,-]*$');

-- "Etapa de vida": antes era um texto livre; agora é o id de uma das 4 opções do primeiro acesso.
alter table public.profiles drop constraint profiles_stage_check;
update public.profiles set stage = case stage
    when 'Estudante do ensino médio' then 'ensino-medio'
    when 'Estudante de graduação ou curso técnico' then 'faculdade'
    when 'Em busca da primeira oportunidade' then 'formado'
    when 'Profissional em desenvolvimento' then 'formado'
    else null
  end
 where stage is not null;
alter table public.profiles add constraint profiles_stage_id check (stage is null or stage ~ '^[a-z0-9-]{1,40}$');

-- A trilha "processo" virou "estagio" (os dois eram o mesmo objetivo).
update public.profiles set goal_primary = 'estagio' where goal_primary = 'processo';
update public.profiles
   set goals_secondary = coalesce((
         select array_agg(g order by o)
           from (select g, min(o) as o
                   from unnest(array_replace(goals_secondary, 'processo', 'estagio')) with ordinality as t(g, o)
                  group by g) d
          where g is distinct from goal_primary
       ), '{}')
 where 'processo' = any(goals_secondary);

-- O aluno altera as colunas novas (as antigas já tinham permissão).
grant update (exploring, goals_text, goals_skills, goals_wants) on table public.profiles to authenticated;

-- 2. Trabalhos (PDF ou link) --------------------------------------------------

create table public.works (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- null = trabalho feito fora da Folyo. O curso é conferido pelo servidor contra o catálogo.
  course_id   text check (course_id is null or course_id ~ '^[a-z0-9-]{1,40}$'),
  kind        text not null check (kind in ('link', 'pdf')),
  title       text not null check (char_length(btrim(title)) between 1 and 90),
  description text not null default '' check (char_length(description) <= 280),
  url         text check (url is null or (char_length(url) <= 500 and url ~* '^https?://[^[:space:]]+$')),
  -- PDF no Storage: sempre "<id do aluno>/<id do arquivo>.pdf".
  file_path   text check (file_path is null or file_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'),
  file_name   text check (file_name is null or char_length(file_name) between 1 and 200),
  file_size   integer check (file_size is null or file_size between 5 and 20971520),
  is_public   boolean not null default false,
  in_cv       boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Link tem endereço e nada de arquivo; PDF tem arquivo completo e nada de endereço.
  constraint works_kind_fields check (
    (kind = 'link' and url is not null and file_path is null and file_name is null and file_size is null)
    or (kind = 'pdf' and url is null and file_path is not null and file_name is not null and file_size is not null)
  ),
  -- O arquivo é sempre da pasta do próprio aluno.
  constraint works_file_owner check (file_path is null or file_path like user_id::text || '/%')
);
comment on table public.works is 'Trabalhos (PDF ou link) que o aluno anexa aos cursos e ao portfólio.';

create index works_user_id on public.works (user_id);
create unique index works_file_path_key on public.works (file_path) where file_path is not null;

create function private.works_quota()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  pdfs int;
  bytes bigint;
begin
  if new.kind = 'pdf' then
    perform pg_advisory_xact_lock(hashtextextended('works-quota:' || new.user_id::text, 0));
    select count(*), coalesce(sum(w.file_size), 0) into pdfs, bytes
      from public.works w
     where w.user_id = new.user_id and w.kind = 'pdf' and w.id <> new.id;
    if pdfs >= 40 then
      raise exception 'Limite de 40 PDFs atingido.' using errcode = 'check_violation';
    end if;
    if bytes + new.file_size > 314572800 then
      raise exception 'Limite de espaço de arquivos atingido (300 MB).' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function private.works_quota() from public;

create function private.works_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- O tipo e o curso não mudam depois de criados (para trocar, apague e crie de novo).
  if tg_op = 'UPDATE' then
    if new.kind <> old.kind or new.course_id is distinct from old.course_id then
      raise exception 'O tipo e o curso do trabalho não podem mudar.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function private.works_guard() from public;

-- 3. Tempo assistido ------------------------------------------------------------

create table public.lesson_watch (
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  course_id  text not null check (course_id ~ '^[a-z0-9-]{1,40}$'),
  lesson_id  text not null check (lesson_id ~ '^[a-z0-9-]{1,40}$'),
  seconds    integer not null check (seconds between 0 and 86400),
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);
comment on table public.lesson_watch is 'Segundos em que o vídeo de cada aula esteve tocando (medido pelo player).';

-- O tempo só cresce e não passa da velocidade do relógio: quem gravar direto pela API
-- não consegue "inventar" horas de estudo.
create function private.lesson_watch_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  elapsed int;
begin
  if tg_op = 'INSERT' then
    new.seconds := least(new.seconds, 300);
    new.updated_at := now();
  else
    elapsed := greatest(0, floor(extract(epoch from (now() - old.updated_at)))::int) + 10;
    new.course_id := old.course_id;
    new.seconds := least(greatest(new.seconds, old.seconds), old.seconds + elapsed);
    -- Só "zera o relógio" quando o tempo de fato avançou.
    if new.seconds > old.seconds then
      new.updated_at := now();
    else
      new.updated_at := old.updated_at;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function private.lesson_watch_guard() from public;

create trigger lesson_watch_guard before insert or update on public.lesson_watch
  for each row execute function private.lesson_watch_guard();

-- 4. Projetos antigos → trabalhos ----------------------------------------------
-- Cada LINK (http/https) de um projeto vira um trabalho do mesmo curso (ou "fora da
-- Folyo"). Projetos sem link não têm o que mostrar e não são copiados. Os trabalhos só
-- ficam públicos se o projeto estava concluído e o aluno tinha o portfólio público ligado.
-- (Feito ANTES de ligar os limites, para a cópia não esbarrar neles; no máximo 100 por aluno.)
insert into public.works (user_id, course_id, kind, title, description, url, is_public, in_cv, created_at, updated_at)
select r.user_id, r.course_id, 'link', r.title, r.description, r.url, r.is_public, r.in_cv, r.created_at, r.created_at
  from (
    select p.user_id,
           p.course_id,
           left(coalesce(nullif(btrim(l.link ->> 'label'), ''), btrim(p.title)), 90) as title,
           left(concat_ws(' — ', nullif(btrim(p.title), ''), nullif(btrim(p.result), '')), 280) as description,
           btrim(l.link ->> 'url') as url,
           (p.status = 'concluido' and pr.public_portfolio) as is_public,
           (p.id = any (pr.resume_projects)) as in_cv,
           coalesce(p.completed_at, p.started_at) as created_at,
           row_number() over (partition by p.user_id order by coalesce(p.completed_at, p.started_at), l.ord) as n
      from public.projects p
      join public.profiles pr on pr.id = p.user_id
      cross join lateral jsonb_array_elements(p.links) with ordinality as l(link, ord)
     where jsonb_typeof(l.link) = 'object'
       and btrim(coalesce(l.link ->> 'url', '')) ~* '^https?://[^[:space:]]+$'
       and char_length(btrim(l.link ->> 'url')) <= 500
  ) r
 where r.n <= 100;

-- 5. Limites, datas e dono (gatilhos) ---------------------------------------------
create trigger works_guard before insert or update on public.works
  for each row execute function private.works_guard();
create trigger works_quota before insert or update of file_size on public.works
  for each row execute function private.works_quota();
create trigger works_updated_at before update on public.works
  for each row execute function private.set_updated_at();
create trigger works_limit before insert on public.works
  for each row execute function private.enforce_row_limit('100');
create trigger lesson_watch_limit before insert on public.lesson_watch
  for each row execute function private.enforce_row_limit('1500');

-- Limite de alterações por minuto (etapa 3) também nas tabelas novas.
create trigger write_rate before insert or update or delete on public.works
  for each statement execute function private.enforce_write_rate();
create trigger write_rate before insert or update or delete on public.lesson_watch
  for each statement execute function private.enforce_write_rate();

-- 6. Permissões por coluna e RLS ----------------------------------------------------
revoke all on table public.works, public.lesson_watch from anon, authenticated;
grant select on table public.works, public.lesson_watch to authenticated;

grant insert (id, course_id, kind, title, description, url, file_path, file_name, file_size)
  on table public.works to authenticated;
grant update (title, description, url, file_path, file_name, file_size, is_public, in_cv)
  on table public.works to authenticated;
grant delete on table public.works to authenticated;

grant insert (course_id, lesson_id, seconds) on table public.lesson_watch to authenticated;
grant update (seconds) on table public.lesson_watch to authenticated;

alter table public.works        enable row level security;
alter table public.lesson_watch enable row level security;

create policy "Aluno vê os próprios trabalhos"     on public.works for select to authenticated using ((select auth.uid()) = user_id);
create policy "Aluno cria trabalho para si"        on public.works for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Aluno altera os próprios trabalhos" on public.works for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Aluno apaga os próprios trabalhos"  on public.works for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Aluno vê o próprio tempo assistido"   on public.lesson_watch for select to authenticated using ((select auth.uid()) = user_id);
create policy "Aluno grava o próprio tempo assistido" on public.lesson_watch for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Aluno altera o próprio tempo assistido" on public.lesson_watch for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Conta suspensa não acessa (etapa 4).
create policy "Conta suspensa não acessa" on public.works as restrictive for all to authenticated
  using ((select private.not_suspended())) with check ((select private.not_suspended()));
create policy "Conta suspensa não acessa" on public.lesson_watch as restrictive for all to authenticated
  using ((select private.not_suspended())) with check ((select private.not_suspended()));

-- 7. Storage: bucket PRIVADO para os PDFs -----------------------------------------
-- Privado = não existe link público. O site entrega o arquivo só para o dono, por uma
-- rota própria. O próprio bucket recusa o que não for PDF e o que passar de 20 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-works', 'student-works', false, 20971520, array['application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = 20971520, allowed_mime_types = array['application/pdf'];

-- Quantos arquivos o aluno já tem no bucket (inclui envios ainda não confirmados).
-- "security definer": o aluno não lê storage.objects dos outros, só esta contagem dele.
create function private.student_files_count(uid uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from storage.objects o
   where o.bucket_id = 'student-works' and o.name like uid::text || '/%'
$$;
revoke execute on function private.student_files_count(uuid) from public, anon, service_role;
grant execute on function private.student_files_count(uuid) to authenticated;

create policy "Aluno lê os próprios PDFs" on storage.objects for select to authenticated
  using (bucket_id = 'student-works' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Aluno envia PDF para a própria pasta" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'student-works'
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}\.pdf$')
    and (select private.student_files_count((select auth.uid()))) < 60
  );
create policy "Aluno apaga os próprios PDFs" on storage.objects for delete to authenticated
  using (bucket_id = 'student-works' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- Não existe regra de UPDATE: arquivo enviado não é sobrescrito (trocar = enviar outro e apagar o antigo).
create policy "Conta suspensa não acessa os PDFs" on storage.objects as restrictive for all to authenticated
  using (bucket_id <> 'student-works' or (select private.not_suspended()))
  with check (bucket_id <> 'student-works' or (select private.not_suspended()));

-- 8. O que saiu do Folyo 2.0 -----------------------------------------------------------
drop table public.projects;
drop function private.projects_dates();
alter table public.profiles drop column resume_projects;
alter table public.profiles drop column weekly_goal;

-- 9. Painel: as funções passam a contar "trabalhos" ----------------------------------
create or replace function public.admin_overview(p_days int)
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
    union all select user_id, (created_at at time zone tz)::date from public.works
    union all select id, (last_sign_in_at at time zone tz)::date from auth.users where last_sign_in_at is not null
  ),
  period(k, f, t) as (values ('cur', cur_from, today), ('prev', prev_from, cur_from - 1)),
  metrics as (
    select p.k, jsonb_build_object(
      'newUsers', (select count(*) from public.profiles x where (x.created_at at time zone tz)::date between p.f and p.t),
      'enrollments', (select count(*) from public.course_progress x where x.started_at is not null and (x.started_at at time zone tz)::date between p.f and p.t),
      'lessons', (select count(*) from public.lesson_completions x where (x.completed_at at time zone tz)::date between p.f and p.t),
      'works', (select count(*) from public.works x where (x.created_at at time zone tz)::date between p.f and p.t),
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

create or replace function public.admin_list_users(
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
        (select max(x.created_at) from public.works x where x.user_id = p.id)
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

create or replace function public.admin_user_detail(p_user uuid)
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
    'works', (select count(*) from public.works x where x.user_id = p.id),
    'skills', (select count(*) from public.skills x where x.user_id = p.id),
    'activeDays30', (select count(distinct d) from (
        select (x.completed_at at time zone tz)::date as d from public.lesson_completions x where x.user_id = p.id
        union all select (x.started_at at time zone tz)::date from public.course_progress x where x.user_id = p.id and x.started_at is not null
        union all select (x.created_at at time zone tz)::date from public.works x where x.user_id = p.id
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

commit;
