-- ============================================================================
-- Folyo · Etapa 2 · Dados do aluno (progresso, projetos, competências, currículo)
--
-- Como usar: Supabase → SQL Editor → New query → cole este arquivo inteiro → Run.
-- Rode DEPOIS do arquivo da etapa 1 (20261020000001_profiles.sql). Rode uma vez só.
-- Tudo roda numa transação: se algo der erro, nada fica pela metade.
--
-- Regra de segurança desta etapa:
--   O site fala com o banco só pelo servidor (Server Actions), mas QUALQUER aluno
--   logado consegue falar direto com a API do Supabase usando a publishable key e o
--   próprio login. Por isso o BANCO é a última barreira e confere tudo de novo:
--    - RLS: cada aluno só lê, cria, altera e apaga as PRÓPRIAS linhas;
--    - permissões por coluna: o aluno não escolhe o dono da linha (user_id) nem
--      as datas (quem marca "concluído em" / "começou em" é o banco, com now());
--    - limites de tamanho em todo texto, lista e JSON;
--    - limite de linhas por aluno em cada tabela (ninguém enche o banco de lixo).
--   Antes de divulgar o site: CAPTCHA no cadastro e limite de pedidos por minuto
--   (os limites daqui seguram cada conta, mas não a criação de muitas contas).
--   Visitantes sem login (anon) não acessam nada.
-- ============================================================================

begin;

-- 0. Funções auxiliares num schema que NÃO aparece na API ----------------------
-- O Supabase expõe o schema "public" na API. Funções aqui no "private" não podem
-- ser chamadas pela internet; só são usadas pelas regras das tabelas.
create schema if not exists private;
revoke all on schema private from public;
-- service_role = a secret key (só para um futuro painel admin / scripts no servidor).
grant usage on schema private to authenticated, service_role;

-- Lista de textos: no máximo "max_items" itens, cada um com até "max_len" caracteres.
create function private.text_list_ok(items text[], max_items int, max_len int)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(cardinality(items), 0) <= max_items
     and not exists (select 1 from unnest(items) as x(v) where v is null or char_length(v) > max_len)
$$;

-- JSON que precisa ser uma lista de objetos, com limite de itens e de tamanho total.
create function private.json_list_ok(doc jsonb, max_items int, max_bytes int)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when doc is null or jsonb_typeof(doc) <> 'array' then false
    else jsonb_array_length(doc) <= max_items
     and octet_length(doc::text) <= max_bytes
     and not exists (select 1 from jsonb_array_elements(doc) as e(v) where jsonb_typeof(v) <> 'object')
  end
$$;

revoke execute on function private.text_list_ok(text[], int, int) from public;
revoke execute on function private.json_list_ok(jsonb, int, int) from public;
-- As regras (CHECK) chamam estas funções com a permissão de quem está gravando.
grant execute on function private.text_list_ok(text[], int, int) to authenticated, service_role;
grant execute on function private.json_list_ok(jsonb, int, int) to authenticated, service_role;

-- Atualiza "updated_at" sempre que a linha muda.
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Limite de linhas por aluno (o número vem do gatilho: TG_ARGV[0]).
-- A trava (advisory lock) faz dois cliques ao mesmo tempo esperarem um pelo outro,
-- assim o limite não é furado por pedidos simultâneos.
create function private.enforce_row_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  max_rows int := tg_argv[0]::int;
  current_rows int;
begin
  perform pg_advisory_xact_lock(hashtextextended(tg_table_name || ':' || new.user_id::text, 0));
  execute format('select count(*) from %I.%I where user_id = $1', tg_table_schema, tg_table_name)
    into current_rows
    using new.user_id;
  if current_rows >= max_rows then
    raise exception 'Limite de % itens atingido.', max_rows using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke execute on function private.set_updated_at() from public;
revoke execute on function private.enforce_row_limit() from public;

-- 1. Perfil: dados do currículo, configurações e aviso lido ---------------------
alter table public.profiles
  add column headline      text not null default '' check (char_length(headline) <= 120),
  add column city          text not null default '' check (char_length(city) <= 80),
  add column contact_email text not null default '' check (char_length(contact_email) <= 254),
  add column phone         text not null default '' check (char_length(phone) <= 30),
  add column link          text not null default '' check (char_length(link) <= 200),
  add column bio           text not null default '' check (char_length(bio) <= 400),
  add column objective     text not null default '' check (char_length(objective) <= 500),
  add column interests     text[] not null default '{}' check (private.text_list_ok(interests, 15, 60)),
  add column education     jsonb not null default '[]' check (private.json_list_ok(education, 20, 32768)),
  add column experiences   jsonb not null default '[]' check (private.json_list_ok(experiences, 20, 131072)),
  add column languages     jsonb not null default '[{"id": "g1", "name": "Português", "level": "Nativo"}]'
                           check (private.json_list_ok(languages, 15, 8192)),
  add column achievements  jsonb not null default '[]' check (private.json_list_ok(achievements, 30, 32768)),
  -- Organização do currículo
  add column resume_template text not null default 'classico' check (resume_template in ('classico', 'moderno')),
  add column resume_order    text[] not null
    default '{objetivo,formacao,experiencia,projetos,cursos,competencias,idiomas,conquistas}'
    check (cardinality(resume_order) <= 8
       and resume_order <@ array['objetivo','formacao','experiencia','projetos','cursos','competencias','idiomas','conquistas']),
  add column resume_hidden   text[] not null default '{}'
    check (cardinality(resume_hidden) <= 8
       and resume_hidden <@ array['objetivo','formacao','experiencia','projetos','cursos','competencias','idiomas','conquistas']),
  add column resume_projects uuid[] not null default '{}' check (cardinality(resume_projects) <= 100),
  add column resume_certs    text[] not null default '{}' check (private.text_list_ok(resume_certs, 100, 40)),
  -- Configurações (privacidade começa toda desligada)
  add column public_profile   boolean not null default false,
  add column public_portfolio boolean not null default false,
  add column show_email       boolean not null default false,
  add column notify_lessons   boolean not null default true,
  add column notify_weekly    boolean not null default true,
  add column notify_news      boolean not null default false,
  add column study_time       text not null default 'noite' check (study_time in ('manha', 'tarde', 'noite')),
  add column captions         boolean not null default true,
  add column autoplay         boolean not null default false,
  add column reduce_motion    boolean not null default false,
  add column notifications_read_at timestamptz;

-- Objetivos acompanhados (etapa 1): além de no máximo 2, cada um precisa ser um id curto do catálogo.
alter table public.profiles
  add constraint profiles_goals_secondary_ids
  check (private.text_list_ok(goals_secondary, 2, 40)
     and array_to_string(goals_secondary, ',') ~ '^[a-z0-9,-]*$');

-- O aluno pode alterar estas colunas novas (além das da etapa 1). Nunca id nem datas de criação.
grant update (
  headline, city, contact_email, phone, link, bio, objective, interests,
  education, experiences, languages, achievements,
  resume_template, resume_order, resume_hidden, resume_projects, resume_certs,
  public_profile, public_portfolio, show_email, notify_lessons, notify_weekly, notify_news,
  study_time, captions, autoplay, reduce_motion, notifications_read_at
) on table public.profiles to authenticated;

-- O e-mail de contato do currículo começa igual ao e-mail de login (o aluno pode trocar).
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
    left(btrim(coalesce(new.raw_user_meta_data ->> 'name', '')), 80),
    left(coalesce(new.email, ''), 254)
  );
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

update public.profiles p
   set contact_email = left(coalesce(u.email, ''), 254)
  from auth.users u
 where u.id = p.id and p.contact_email = '';

-- 2. Progresso por curso (começou, última aula aberta, favorito) ---------------
create table public.course_progress (
  user_id        uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  course_id      text not null check (course_id ~ '^[a-z0-9-]{1,40}$'),
  started        boolean not null default false,
  started_at     timestamptz,
  last_lesson_id text check (last_lesson_id is null or last_lesson_id ~ '^[a-z0-9-]{1,40}$'),
  favorite       boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (user_id, course_id)
);
comment on table public.course_progress is 'Progresso de cada aluno em cada curso (1 linha por aluno e curso).';

-- "Começou em" é marcado pelo banco e não muda mais (nem volta para "não começou").
create function private.course_progress_dates()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.started    := old.started or new.started;
    new.started_at := old.started_at;
  else
    new.started_at := null;
  end if;
  if new.started and new.started_at is null then
    new.started_at := now();
  end if;
  return new;
end;
$$;
revoke execute on function private.course_progress_dates() from public;

create trigger course_progress_dates before insert or update on public.course_progress
  for each row execute function private.course_progress_dates();
create trigger course_progress_updated_at before update on public.course_progress
  for each row execute function private.set_updated_at();
create trigger course_progress_limit before insert on public.course_progress
  for each row execute function private.enforce_row_limit('50');

-- 3. Aulas concluídas ------------------------------------------------------------
create table public.lesson_completions (
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  course_id    text not null check (course_id ~ '^[a-z0-9-]{1,40}$'),
  lesson_id    text not null check (lesson_id ~ '^[a-z0-9-]{1,40}$'),
  completed_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);
comment on table public.lesson_completions is 'Aulas que cada aluno marcou como concluídas. A data é sempre a do servidor.';

create trigger lesson_completions_limit before insert on public.lesson_completions
  for each row execute function private.enforce_row_limit('500');

-- 4. Anotações das aulas -----------------------------------------------------------
create table public.lesson_notes (
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  course_id  text not null check (course_id ~ '^[a-z0-9-]{1,40}$'),
  lesson_id  text not null check (lesson_id ~ '^[a-z0-9-]{1,40}$'),
  body       text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);
comment on table public.lesson_notes is 'Anotação de cada aluno em cada aula (só o próprio aluno vê).';

create trigger lesson_notes_updated_at before update on public.lesson_notes
  for each row execute function private.set_updated_at();
create trigger lesson_notes_limit before insert on public.lesson_notes
  for each row execute function private.enforce_row_limit('200');

-- 5. Projetos ------------------------------------------------------------------------
create table public.projects (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  course_id    text check (course_id is null or course_id ~ '^[a-z0-9-]{1,40}$'),
  origin       text not null check (origin in ('curso', 'externo')),
  status       text not null default 'andamento' check (status in ('andamento', 'concluido', 'revisao')),
  tone         text not null default 'blue' check (tone in ('blue', 'magenta', 'ink', 'lime', 'paper')),
  title        text not null check (char_length(btrim(title)) between 1 and 120),
  description  text not null default '' check (char_length(description) <= 200),
  problem      text not null default '' check (char_length(problem) <= 2000),
  skills       text[] not null default '{}' check (private.text_list_ok(skills, 20, 60)),
  tools        text[] not null default '{}' check (private.text_list_ok(tools, 20, 60)),
  steps        jsonb not null default '[]' check (private.json_list_ok(steps, 30, 65536)),
  result       text not null default '' check (char_length(result) <= 3000),
  links        jsonb not null default '[]' check (private.json_list_ok(links, 10, 16384)),
  started_at   timestamptz not null default now(),
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Projeto de curso sempre tem curso; projeto externo nunca tem.
  constraint projects_origin_course check ((origin = 'curso') = (course_id is not null))
);
comment on table public.projects is 'Projetos do portfólio de cada aluno.';

create index projects_user_id on public.projects (user_id);
-- No máximo um projeto por curso para cada aluno.
create unique index projects_one_per_course on public.projects (user_id, course_id) where course_id is not null;

-- "Concluído em" é marcado pelo banco quando o status vira "concluido".
create function private.projects_dates()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.started_at := old.started_at;
  else
    new.started_at := now();
  end if;
  -- Regra do portfólio: projeto só fica "concluído" com o resultado descrito (30+ letras).
  -- Sem isso, vira "precisa de revisão" (vale também para quem gravar direto pela API).
  if new.status = 'concluido' and char_length(btrim(new.result)) < 30 then
    new.status := 'revisao';
  end if;
  if new.status <> 'concluido' then
    new.completed_at := null;
  elsif tg_op = 'UPDATE' and old.status = 'concluido' then
    new.completed_at := old.completed_at;
  else
    new.completed_at := now();
  end if;
  return new;
end;
$$;
revoke execute on function private.projects_dates() from public;

create trigger projects_dates before insert or update on public.projects
  for each row execute function private.projects_dates();
create trigger projects_updated_at before update on public.projects
  for each row execute function private.set_updated_at();
create trigger projects_limit before insert on public.projects
  for each row execute function private.enforce_row_limit('50');

-- 6. Competências ----------------------------------------------------------------------
create table public.skills (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  type       text not null check (type in ('tecnica', 'ferramenta', 'idioma', 'comportamental')),
  in_cv      boolean not null default true,
  note       text not null default '' check (char_length(note) <= 400),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.skills is 'Competências que cada aluno registrou.';

create index skills_user_id on public.skills (user_id);

create trigger skills_updated_at before update on public.skills
  for each row execute function private.set_updated_at();
create trigger skills_limit before insert on public.skills
  for each row execute function private.enforce_row_limit('200');

-- 7. Permissões (por coluna) -----------------------------------------------------------
-- O Supabase dá acesso total às tabelas novas para os papéis da API. Tiramos tudo
-- e devolvemos só o necessário. Visitante sem login (anon): nada.
revoke all on table public.course_progress, public.lesson_completions, public.lesson_notes,
                    public.projects, public.skills
  from anon, authenticated;

grant select on table public.course_progress, public.lesson_completions, public.lesson_notes,
                      public.projects, public.skills
  to authenticated;

grant insert (course_id, started, last_lesson_id, favorite) on table public.course_progress to authenticated;
grant update (started, last_lesson_id, favorite)            on table public.course_progress to authenticated;

grant insert (course_id, lesson_id) on table public.lesson_completions to authenticated;
grant delete                        on table public.lesson_completions to authenticated;

grant insert (course_id, lesson_id, body) on table public.lesson_notes to authenticated;
grant update (body)                       on table public.lesson_notes to authenticated;
grant delete                              on table public.lesson_notes to authenticated;

grant insert (id, course_id, origin, status, tone, title, description, problem, skills, tools, steps, result, links)
  on table public.projects to authenticated;
grant update (status, tone, title, description, problem, skills, tools, steps, result, links)
  on table public.projects to authenticated;
grant delete on table public.projects to authenticated;

grant insert (id, name, type, in_cv, note) on table public.skills to authenticated;
grant update (name, type, in_cv, note)     on table public.skills to authenticated;
grant delete                               on table public.skills to authenticated;

-- 8. RLS: cada aluno só mexe nas próprias linhas -----------------------------------
alter table public.course_progress    enable row level security;
alter table public.lesson_completions enable row level security;
alter table public.lesson_notes       enable row level security;
alter table public.projects           enable row level security;
alter table public.skills             enable row level security;

create policy "Aluno vê o próprio progresso"      on public.course_progress for select to authenticated using ((select auth.uid()) = user_id);
create policy "Aluno cria o próprio progresso"    on public.course_progress for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Aluno altera o próprio progresso"  on public.course_progress for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "Aluno vê as próprias aulas concluídas"   on public.lesson_completions for select to authenticated using ((select auth.uid()) = user_id);
create policy "Aluno conclui aula para si"              on public.lesson_completions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Aluno desmarca a própria aula concluída" on public.lesson_completions for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Aluno vê as próprias anotações"     on public.lesson_notes for select to authenticated using ((select auth.uid()) = user_id);
create policy "Aluno cria a própria anotação"      on public.lesson_notes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Aluno altera a própria anotação"    on public.lesson_notes for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Aluno apaga a própria anotação"     on public.lesson_notes for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Aluno vê os próprios projetos"      on public.projects for select to authenticated using ((select auth.uid()) = user_id);
create policy "Aluno cria projeto para si"         on public.projects for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Aluno altera os próprios projetos"  on public.projects for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Aluno apaga os próprios projetos"   on public.projects for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Aluno vê as próprias competências"     on public.skills for select to authenticated using ((select auth.uid()) = user_id);
create policy "Aluno cria competência para si"        on public.skills for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Aluno altera as próprias competências" on public.skills for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Aluno apaga as próprias competências"  on public.skills for delete to authenticated using ((select auth.uid()) = user_id);

commit;
