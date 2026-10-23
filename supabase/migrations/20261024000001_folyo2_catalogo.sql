-- ============================================================================
-- Folyo 2.0 · Fase 2 · Catálogo no banco (categorias, cursos, módulos, aulas e materiais)
--
-- Como usar: Supabase → SQL Editor → New query → cole este arquivo inteiro → Run.
-- Rode DEPOIS do SQL da Fase 1 (20261023000001_folyo2_area_do_aluno.sql). Rode uma vez só.
-- Tudo roda numa transação: se algo der erro, nada fica pela metade.
--
-- O que entra:
--   1. Tabelas do catálogo: categories, courses, course_modules, lessons, lesson_materials
--      e catalog_tags (as tags sugeridas no cadastro de cursos);
--   2. as 14 categorias padrão (as mesmas que o site já mostrava);
--   3. funções do painel (admin_*) para criar, editar, publicar, ordenar e excluir;
--   4. o histórico (auditoria) passa a registrar também as ações do catálogo.
--
-- Quem lê o quê (RLS, igual às outras tabelas):
--   - Aluno logado lê categorias e SÓ os cursos publicados (ou agendados cuja data já
--     passou) ou despublicados (quem já começou continua). Rascunhos, módulos arquivados e
--     aulas despublicadas NÃO saem do banco para o aluno, nem pela API direta;
--   - Equipe (editor, administrador, proprietário) lê tudo;
--   - Conta suspensa não lê nada;
--   - Ninguém grava direto nas tabelas: toda alteração passa por uma função admin_*,
--     que confere o papel de quem chamou, valida o conteúdo, grava o histórico e respeita
--     o limite de alterações por minuto.
--
-- Papéis: editor cria e edita tudo do catálogo; só administrador ou acima EXCLUI curso.
-- ============================================================================

begin;

-- 1. Tabelas ------------------------------------------------------------------

create table public.categories (
  id          text primary key check (id ~ '^[a-z0-9-]{1,40}$'),
  name        text not null check (char_length(btrim(name)) between 3 and 60),
  description text not null default '' check (char_length(description) <= 200),
  icon        text not null default 'Layers' check (icon ~ '^[A-Za-z0-9]{1,40}$'),
  position    integer not null default 0 check (position between 0 and 100000),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.categories is 'Categorias do catálogo (filtros de Explorar cursos).';
create unique index categories_name_key on public.categories (lower(btrim(name)));

create table public.courses (
  id            text primary key check (id ~ '^[a-z0-9-]{1,40}$'),
  title         text not null check (char_length(btrim(title)) between 4 and 90),
  subtitle      text not null default '' check (char_length(subtitle) <= 120),
  summary       text not null default '' check (char_length(summary) <= 220),
  description   text not null default '' check (char_length(description) <= 4000),
  category_id   text not null references public.categories (id) on delete restrict,
  instructor    text not null default '' check (char_length(instructor) <= 80),
  level         text not null default 'Iniciante' check (level in ('Iniciante', 'Intermediário', 'Avançado')),
  language      text not null default 'Português' check (char_length(language) between 1 and 30),
  tags          text[] not null default '{}' check (private.text_list_ok(tags, 12, 30)),
  hours         integer not null default 1 check (hours between 1 and 500),
  outcomes      text[] not null default '{}' check (private.text_list_ok(outcomes, 12, 160)),
  audience      text not null default '' check (char_length(audience) <= 300),
  skills        text[] not null default '{}' check (private.text_list_ok(skills, 15, 40)),
  tone          text not null default 'blue' check (tone in ('blue', 'magenta', 'ink', 'lime', 'paper')),
  glyph         text not null default '' check (char_length(glyph) <= 3),
  position      integer not null default 0 check (position between 0 and 100000),
  featured      boolean not null default false,
  recommended   boolean not null default false,
  hidden        boolean not null default false,
  prerequisites text[] not null default '{}' check (private.text_list_ok(prerequisites, 10, 40)),
  related       text[] not null default '{}' check (private.text_list_ok(related, 10, 40)),
  status        text not null default 'rascunho' check (status in ('rascunho', 'agendado', 'publicado', 'arquivado')),
  publish_at    timestamptz,
  plan          text not null default 'free' check (plan in ('free', 'pro')),
  access        text not null default 'todos' check (access in ('todos', 'assinantes')),
  project_title    text not null default '' check (char_length(project_title) <= 120),
  project_brief    text not null default '' check (char_length(project_brief) <= 600),
  project_expected text not null default '' check (char_length(project_expected) <= 600),
  project_steps    text[] not null default '{}' check (private.text_list_ok(project_steps, 8, 120)),
  cert_enabled  boolean not null default true,
  cert_hours    integer check (cert_hours is null or cert_hours between 1 and 500),
  cert_note     text not null default '' check (char_length(cert_note) <= 160),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Só o curso "agendado" tem data de publicação.
  constraint courses_schedule check ((status = 'agendado') = (publish_at is not null))
);
comment on table public.courses is 'Cursos do catálogo. Só as funções admin_* gravam aqui.';
create unique index courses_title_key on public.courses (lower(btrim(title)));
create index courses_category on public.courses (category_id);
create index courses_position on public.courses (position, title);

create table public.course_modules (
  id          text primary key check (id ~ '^[a-z0-9-]{1,40}$'),
  course_id   text not null references public.courses (id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 1 and 90),
  description text not null default '' check (char_length(description) <= 300),
  archived    boolean not null default false,
  position    integer not null check (position between 0 and 1000),
  unique (id, course_id)
);
create index course_modules_course on public.course_modules (course_id, position);

create table public.lessons (
  id          text primary key check (id ~ '^[a-z0-9-]{1,40}$'),
  module_id   text not null,
  course_id   text not null references public.courses (id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 3 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  minutes     integer not null check (minutes between 1 and 300),
  published   boolean not null default true,
  -- Vídeo por link (https). Envio de arquivos de vídeo entra com a biblioteca de mídia.
  video_url   text check (video_url is null or (char_length(video_url) <= 500 and video_url ~* '^https://[^[:space:]]+\.[^[:space:]]+$')),
  position    integer not null check (position between 0 and 1000),
  -- A aula sempre pertence a um módulo do MESMO curso.
  foreign key (module_id, course_id) references public.course_modules (id, course_id) on delete cascade
);
create index lessons_course on public.lessons (course_id);
create index lessons_module on public.lessons (module_id, position);

create table public.lesson_materials (
  id        text primary key check (id ~ '^[a-z0-9-]{1,40}$'),
  lesson_id text not null references public.lessons (id) on delete cascade,
  label     text not null check (char_length(btrim(label)) between 1 and 90),
  url       text not null check (char_length(url) <= 500 and url ~* '^https://[^[:space:]]+\.[^[:space:]]+$'),
  position  integer not null check (position between 0 and 100)
);
create index lesson_materials_lesson on public.lesson_materials (lesson_id, position);

create table public.catalog_tags (
  tag text primary key check (char_length(btrim(tag)) between 1 and 30 and tag = btrim(tag))
);
comment on table public.catalog_tags is 'Tags sugeridas no cadastro de cursos.';

-- 2. Categorias padrão ---------------------------------------------------------

insert into public.categories (id, name, icon, position) values
  ('marketing',   'Marketing e Comunicação',               'Megaphone',     0),
  ('vendas',      'Vendas e Negociação',                   'Handshake',     1),
  ('tech',        'Programação e Tecnologia',              'Code',          2),
  ('arquitetura', 'Arquitetura e Design',                  'Building2',     3),
  ('idiomas',     'Inglês e Idiomas',                      'Languages',     4),
  ('negocios',    'Negócios e Empreendedorismo',           'Rocket',        5),
  ('gestao',      'Administração e Gestão',                'ClipboardList', 6),
  ('financas',    'Finanças',                              'Wallet',        7),
  ('rh',          'Recursos Humanos',                      'Users',         8),
  ('educacao',    'Educação e Pedagogia',                  'GraduationCap', 9),
  ('atendimento', 'Atendimento e Experiência do Cliente',  'Headphones',    10),
  ('dados',       'Dados e Inteligência Artificial',       'BrainCircuit',  11),
  ('audiovisual', 'Design e Audiovisual',                  'Clapperboard',  12),
  ('carreira',    'Carreira e Processos Seletivos',        'Briefcase',     13);

-- 3. Quem pode ler -------------------------------------------------------------

-- Ninguém grava direto. O aluno só LÊ, e só as colunas listadas.
alter table public.categories       enable row level security;
alter table public.courses          enable row level security;
alter table public.course_modules   enable row level security;
alter table public.lessons          enable row level security;
alter table public.lesson_materials enable row level security;
alter table public.catalog_tags     enable row level security;

revoke all on table public.categories, public.courses, public.course_modules, public.lessons,
  public.lesson_materials, public.catalog_tags from public, anon, authenticated, service_role;

grant select (id, name, description, icon, position, active, created_at, updated_at) on public.categories to authenticated;
grant select (id, title, subtitle, summary, description, category_id, instructor, level, language, tags, hours,
  outcomes, audience, skills, tone, glyph, position, featured, recommended, hidden, prerequisites, related,
  status, publish_at, plan, access, project_title, project_brief, project_expected, project_steps,
  cert_enabled, cert_hours, cert_note, created_at, updated_at) on public.courses to authenticated;
grant select (id, course_id, title, description, archived, position) on public.course_modules to authenticated;
grant select (id, module_id, course_id, title, description, minutes, published, video_url, position) on public.lessons to authenticated;
grant select (id, lesson_id, label, url, position) on public.lesson_materials to authenticated;
grant select (tag) on public.catalog_tags to authenticated;

-- Funções que as regras (RLS) chamam. Rodam com permissão do dono, mas só respondem
-- sim/não sobre o catálogo e sobre o papel de quem está logado.

-- O curso aparece para os alunos? (publicado, despublicado, ou agendado cuja data já passou)
create function private.course_is_live(p_status text, p_publish_at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_status in ('publicado', 'arquivado') or (p_status = 'agendado' and p_publish_at <= now())
$$;

-- Quem está logado é da equipe (editor ou acima, e não suspenso)?
create function private.catalog_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.actor_rank() >= 1
$$;

-- O curso é visível para os alunos?
create function private.course_visible(p_course text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.courses c where c.id = p_course and private.course_is_live(c.status, c.publish_at))
$$;

-- O módulo é visível para os alunos? (curso visível e módulo não arquivado)
create function private.module_visible(p_module text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.course_modules m join public.courses c on c.id = m.course_id
     where m.id = p_module and not m.archived and private.course_is_live(c.status, c.publish_at))
$$;

-- A aula é visível para os alunos? (publicada, em módulo visível)
create function private.lesson_visible(p_lesson text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.lessons l
     where l.id = p_lesson and l.published and private.module_visible(l.module_id))
$$;

revoke execute on function private.course_is_live(text, timestamptz), private.catalog_staff(), private.course_visible(text),
  private.module_visible(text), private.lesson_visible(text) from public, anon, service_role;
grant execute on function private.course_is_live(text, timestamptz), private.catalog_staff(), private.course_visible(text),
  private.module_visible(text), private.lesson_visible(text) to authenticated;

create policy "Categorias: logados leem" on public.categories for select to authenticated using (true);
create policy "Cursos: alunos leem os visíveis, equipe lê todos" on public.courses for select to authenticated
  using (private.course_is_live(status, publish_at) or (select private.catalog_staff()));
create policy "Módulos: alunos leem os visíveis, equipe lê todos" on public.course_modules for select to authenticated
  using ((select private.catalog_staff()) or (not archived and private.course_visible(course_id)));
create policy "Aulas: alunos leem as visíveis, equipe lê todas" on public.lessons for select to authenticated
  using ((select private.catalog_staff()) or (published and private.module_visible(module_id)));
create policy "Materiais: alunos leem os visíveis, equipe lê todos" on public.lesson_materials for select to authenticated
  using ((select private.catalog_staff()) or private.lesson_visible(lesson_id));
create policy "Tags: só a equipe lê" on public.catalog_tags for select to authenticated
  using ((select private.catalog_staff()));

-- Conta suspensa não lê nada (soma com as regras acima).
create policy "Conta suspensa não acessa" on public.categories as restrictive for select to authenticated
  using ((select private.not_suspended()));
create policy "Conta suspensa não acessa" on public.courses as restrictive for select to authenticated
  using ((select private.not_suspended()));
create policy "Conta suspensa não acessa" on public.course_modules as restrictive for select to authenticated
  using ((select private.not_suspended()));
create policy "Conta suspensa não acessa" on public.lessons as restrictive for select to authenticated
  using ((select private.not_suspended()));
create policy "Conta suspensa não acessa" on public.lesson_materials as restrictive for select to authenticated
  using ((select private.not_suspended()));
create policy "Conta suspensa não acessa" on public.catalog_tags as restrictive for select to authenticated
  using ((select private.not_suspended()));

-- 4. Peças privadas das funções do painel ---------------------------------------

-- Histórico de ações do catálogo (o alvo é um nome, não uma conta).
create function private.audit_content(p_action text, p_label text, p_detail text)
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
    p_action,
    null,
    left(coalesce(p_label, ''), 400),
    left(coalesce(p_detail, ''), 700)
  )
$$;

-- Limite de alterações por minuto/hora (o mesmo contador das tabelas do aluno, 1 por chamada).
create function private.count_write()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  this_minute timestamptz := date_trunc('minute', now());
  this_hour timestamptz := date_trunc('hour', now());
  counter private.write_rate%rowtype;
begin
  if uid is null then
    return;
  end if;
  insert into private.write_rate as w (user_id, minute_start, minute_count, hour_start, hour_count)
  values (uid, this_minute, 1, this_hour, 1)
  on conflict (user_id) do update set
    minute_count = case when w.minute_start = this_minute then w.minute_count + 1 else 1 end,
    minute_start = this_minute,
    hour_count = case when w.hour_start = this_hour then w.hour_count + 1 else 1 end,
    hour_start = this_hour
  returning * into counter;
  if counter.minute_count > 120 or counter.hour_count > 3000 then
    raise exception 'Muitas alterações seguidas. Espere um pouco e tente de novo.' using errcode = 'FY429';
  end if;
end;
$$;

-- Leitura de campos do JSON enviado pelo site. Qualquer coisa fora do formato para a função.
create function private.j_text(doc jsonb, k text, min_len int, max_len int)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v jsonb := doc -> k;
  s text;
begin
  if v is null or jsonb_typeof(v) = 'null' then
    if min_len = 0 then return ''; end if;
    raise exception 'Preencha o campo "%".', k using errcode = 'FA400';
  end if;
  if jsonb_typeof(v) <> 'string' then
    raise exception 'O campo "%" não é um texto.', k using errcode = 'FA400';
  end if;
  s := btrim(v #>> '{}');
  if s ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]' then
    raise exception 'O campo "%" tem caracteres inválidos.', k using errcode = 'FA400';
  end if;
  if char_length(s) < min_len or char_length(s) > max_len then
    raise exception 'O campo "%" deve ter entre % e % caracteres.', k, min_len, max_len using errcode = 'FA400';
  end if;
  return s;
end;
$$;

-- Lista de textos curtos (sem vazios nem repetidos).
create function private.j_texts(doc jsonb, k text, max_items int, max_len int)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v jsonb := doc -> k;
  item jsonb;
  s text;
  out text[] := '{}';
begin
  if v is null or jsonb_typeof(v) = 'null' then return '{}'; end if;
  if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > max_items * 2 then
    raise exception 'O campo "%" não é uma lista válida.', k using errcode = 'FA400';
  end if;
  for item in select * from jsonb_array_elements(v) loop
    if jsonb_typeof(item) <> 'string' then
      raise exception 'O campo "%" tem um item inválido.', k using errcode = 'FA400';
    end if;
    s := btrim(item #>> '{}');
    if s = '' or exists (select 1 from unnest(out) o where lower(o) = lower(s)) then continue; end if;
    if char_length(s) > max_len or s ~ '[\x01-\x1f\x7f]' then
      raise exception 'Um item de "%" é longo demais ou inválido.', k using errcode = 'FA400';
    end if;
    out := out || s;
  end loop;
  if cardinality(out) > max_items then
    raise exception 'O campo "%" aceita no máximo % itens.', k, max_items using errcode = 'FA400';
  end if;
  return out;
end;
$$;

create function private.j_int(doc jsonb, k text, min_v int, max_v int, fallback int)
returns int
language plpgsql
immutable
set search_path = ''
as $$
declare
  v jsonb := doc -> k;
  n numeric;
begin
  if v is null or jsonb_typeof(v) = 'null' then
    if fallback is null then
      return null;
    end if;
    return fallback;
  end if;
  if jsonb_typeof(v) <> 'number' then
    raise exception 'O campo "%" não é um número.', k using errcode = 'FA400';
  end if;
  n := (v #>> '{}')::numeric;
  if n <> trunc(n) or n < min_v or n > max_v then
    raise exception 'O campo "%" deve ser um número inteiro entre % e %.', k, min_v, max_v using errcode = 'FA400';
  end if;
  return n::int;
end;
$$;

create function private.j_bool(doc jsonb, k text, fallback boolean)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v jsonb := doc -> k;
begin
  if v is null or jsonb_typeof(v) = 'null' then return fallback; end if;
  if jsonb_typeof(v) <> 'boolean' then
    raise exception 'O campo "%" não é verdadeiro/falso.', k using errcode = 'FA400';
  end if;
  return (v #>> '{}')::boolean;
end;
$$;

-- Endereço https (null = vazio).
create function private.j_https(doc jsonb, k text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  s text := private.j_text(doc, k, 0, 500);
begin
  if s = '' then return null; end if;
  if s !~* '^https://[^[:space:]]+\.[^[:space:]]+$' then
    raise exception 'O endereço de "%" deve começar com https://', k using errcode = 'FA400';
  end if;
  return s;
end;
$$;

-- O que falta para o curso poder ser publicado (lista vazia = pode).
-- "full" confere também título, descrições e skills; sem "full" só o conteúdo das aulas.
create function private.course_problems(p_course text, p_full boolean)
returns text[]
language plpgsql
stable
set search_path = ''
as $$
declare
  c public.courses%rowtype;
  total int;
  without_video int;
  first_title text;
  out text[] := '{}';
begin
  select * into c from public.courses where id = p_course;
  select count(*), count(*) filter (where l.video_url is null), min(l.title) filter (where l.video_url is null)
    into total, without_video, first_title
    from public.lessons l join public.course_modules m on m.id = l.module_id
   where l.course_id = p_course and l.published and not m.archived;
  if total = 0 then
    out := array_append(out, 'O curso precisa de pelo menos uma aula publicada.');
  end if;
  if without_video = 1 then
    out := array_append(out, 'A aula "' || first_title || '" ainda não tem vídeo.');
  elsif without_video > 1 then
    out := array_append(out, without_video || ' aulas publicadas ainda não têm vídeo.');
  end if;
  if p_full then
    if char_length(btrim(c.title)) < 4 then out := array_append(out, 'Dê um título ao curso.'); end if;
    if char_length(btrim(c.summary)) < 20 then out := array_append(out, 'Escreva a descrição curta.'); end if;
    if char_length(btrim(c.description)) < 40 then out := array_append(out, 'Escreva a descrição completa (pelo menos 40 caracteres).'); end if;
    if cardinality(c.skills) = 0 then out := array_append(out, 'Informe pelo menos uma skill desenvolvida.'); end if;
  end if;
  return out;
end;
$$;

revoke execute on function private.audit_content(text, text, text), private.count_write(),
  private.j_text(jsonb, text, int, int), private.j_texts(jsonb, text, int, int),
  private.j_int(jsonb, text, int, int, int), private.j_bool(jsonb, text, boolean),
  private.j_https(jsonb, text), private.course_problems(text, boolean)
  from public, anon, authenticated, service_role;

-- 5. Funções do painel (API) ----------------------------------------------------
-- Todas: security definer + search_path vazio + papel conferido logo no começo.

-- Cria ou edita uma categoria.
create function public.admin_save_category(p_category jsonb, p_is_new boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor int := private.require_rank(1);
  cid text;
  cname text;
  cdesc text;
  cicon text;
  cactive boolean;
  pos int;
begin
  if p_category is null or jsonb_typeof(p_category) <> 'object' or p_is_new is null then
    raise exception 'Pedido inválido.' using errcode = 'FA400';
  end if;
  perform private.count_write();
  cid := private.j_text(p_category, 'id', 1, 40);
  if cid !~ '^[a-z0-9-]{1,40}$' then
    raise exception 'Endereço da categoria inválido.' using errcode = 'FA400';
  end if;
  cname := private.j_text(p_category, 'name', 3, 60);
  cdesc := private.j_text(p_category, 'desc', 0, 200);
  cicon := private.j_text(p_category, 'icon', 1, 40);
  if cicon !~ '^[A-Za-z0-9]{1,40}$' then
    raise exception 'Ícone inválido.' using errcode = 'FA400';
  end if;
  cactive := private.j_bool(p_category, 'active', true);

  perform pg_advisory_xact_lock(hashtextextended('catalog:categories', 0));
  actor := private.require_rank(1);
  if exists (select 1 from public.categories c where lower(btrim(c.name)) = lower(cname) and c.id <> cid) then
    raise exception 'Já existe uma categoria com esse nome.' using errcode = 'FA400';
  end if;

  if p_is_new then
    if exists (select 1 from public.categories where id = cid) then
      raise exception 'Já existe uma categoria com este endereço.' using errcode = 'FA410';
    end if;
    if (select count(*) from public.categories) >= 60 then
      raise exception 'Limite de 60 categorias atingido.' using errcode = 'FA400';
    end if;
    select coalesce(max(position) + 1, 0) into pos from public.categories;
    insert into public.categories (id, name, description, icon, position, active)
    values (cid, cname, cdesc, cicon, least(pos, 100000), cactive);
    perform private.audit_content('categoria.criada', cname, '');
  else
    update public.categories
       set name = cname, description = cdesc, icon = cicon, active = cactive, updated_at = now()
     where id = cid;
    if not found then
      raise exception 'Categoria não encontrada.' using errcode = 'FA404';
    end if;
    perform private.audit_content('categoria.atualizada', cname, '');
  end if;
  return jsonb_build_object('id', cid);
end;
$$;

-- Exclui uma categoria que nenhum curso usa.
create function public.admin_delete_category(p_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor int := private.require_rank(1);
  cname text;
begin
  if p_id is null or p_id !~ '^[a-z0-9-]{1,40}$' then
    raise exception 'Pedido inválido.' using errcode = 'FA400';
  end if;
  perform private.count_write();
  perform pg_advisory_xact_lock(hashtextextended('catalog:categories', 0));
  actor := private.require_rank(1);
  select name into cname from public.categories where id = p_id;
  if cname is null then
    raise exception 'Categoria não encontrada.' using errcode = 'FA404';
  end if;
  if exists (select 1 from public.courses where category_id = p_id) then
    raise exception 'Há cursos nesta categoria. Mova-os para outra antes de excluir.' using errcode = 'FA400';
  end if;
  delete from public.categories where id = p_id;
  perform private.audit_content('categoria.excluida', cname, '');
  return jsonb_build_object('id', p_id);
end;
$$;

-- Define a ordem das categorias ou dos cursos (a lista vem na ordem desejada).
create function public.admin_reorder(p_kind text, p_ids text[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor int := private.require_rank(1);
  n int;
begin
  if p_kind not in ('cursos', 'categorias') or p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 500 then
    raise exception 'Pedido inválido.' using errcode = 'FA400';
  end if;
  if (select count(distinct x) from unnest(p_ids) x) <> cardinality(p_ids) then
    raise exception 'A lista tem itens repetidos.' using errcode = 'FA400';
  end if;
  perform private.count_write();
  perform pg_advisory_xact_lock(hashtextextended('catalog:order', 0));
  actor := private.require_rank(1);
  if p_kind = 'categorias' then
    select count(*) into n from public.categories where id = any (p_ids);
  else
    select count(*) into n from public.courses where id = any (p_ids);
  end if;
  if n <> cardinality(p_ids) then
    raise exception 'A lista tem itens que não existem mais. Recarregue a página.' using errcode = 'FA404';
  end if;
  if p_kind = 'categorias' then
    update public.categories c set position = o.i - 1, updated_at = now()
      from unnest(p_ids) with ordinality as o(id, i) where c.id = o.id and c.position <> o.i - 1;
    perform private.audit_content('categorias.reordenadas', 'Ordem das categorias', '');
  else
    update public.courses c set position = o.i - 1
      from unnest(p_ids) with ordinality as o(id, i) where c.id = o.id and c.position <> o.i - 1;
    perform private.audit_content('catalogo.reordenado', 'Ordem do catálogo', '');
  end if;
  return jsonb_build_object('count', n);
end;
$$;

-- Cria ou edita um curso inteiro (módulos, aulas e materiais) numa única operação.
-- p_expected = "updated_at" que a tela leu; se o curso mudou desde então, recusa (a menos que p_force).
create function public.admin_save_course(p_course jsonb, p_is_new boolean, p_expected text default null, p_force boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor int := private.require_rank(1);
  cid text;
  old public.courses%rowtype;
  had_old boolean;
  t_title text;
  t_cat text;
  t_level text;
  t_tone text;
  t_status text;
  t_plan text;
  t_access text;
  t_publish timestamptz;
  t_pos int;
  t_prereq text[];
  t_related text[];
  proj jsonb;
  cert jsonb;
  mods jsonb;
  m jsonb;
  l jsonb;
  mt jsonb;
  mid text;
  lid text;
  mtid text;
  mod_ids text[] := '{}';
  les_ids text[] := '{}';
  mat_ids text[];
  mi int := 0;
  li int;
  mti int;
  total_lessons int := 0;
  video text;
  problems text[];
  note text := '';
  result_stamp timestamptz;
begin
  if p_course is null or jsonb_typeof(p_course) <> 'object' or p_is_new is null then
    raise exception 'Pedido inválido.' using errcode = 'FA400';
  end if;
  if pg_column_size(p_course) > 600000 then
    raise exception 'O curso é grande demais.' using errcode = 'FA400';
  end if;
  perform private.count_write();

  cid := private.j_text(p_course, 'id', 1, 40);
  if cid !~ '^[a-z0-9-]{1,40}$' then
    raise exception 'Endereço do curso inválido.' using errcode = 'FA400';
  end if;

  -- Fila por curso; depois dela o papel é conferido de novo.
  perform pg_advisory_xact_lock(hashtextextended('course:' || cid, 0));
  actor := private.require_rank(1);
  select * into old from public.courses where id = cid for update;
  had_old := found;
  if p_is_new and had_old then
    raise exception 'Já existe um curso com este endereço.' using errcode = 'FA410';
  end if;
  if not p_is_new and not had_old then
    raise exception 'Curso não encontrado. Ele pode ter sido excluído.' using errcode = 'FA404';
  end if;
  if had_old and not coalesce(p_force, false) and p_expected is not null and old.updated_at <> p_expected::timestamptz then
    raise exception 'Este curso foi alterado por outra pessoa enquanto você editava.' using errcode = 'FA409';
  end if;
  if p_is_new and (select count(*) from public.courses) >= 500 then
    raise exception 'Limite de 500 cursos atingido.' using errcode = 'FA400';
  end if;

  -- Campos do curso
  t_title := private.j_text(p_course, 'title', 4, 90);
  if exists (select 1 from public.courses c where lower(btrim(c.title)) = lower(t_title) and c.id <> cid) then
    raise exception 'Já existe um curso com esse título.' using errcode = 'FA400';
  end if;
  t_cat := private.j_text(p_course, 'cat', 1, 40);
  if not exists (select 1 from public.categories where id = t_cat) then
    raise exception 'Escolha uma categoria que exista.' using errcode = 'FA400';
  end if;
  t_level := private.j_text(p_course, 'level', 1, 20);
  if t_level not in ('Iniciante', 'Intermediário', 'Avançado') then
    raise exception 'Nível inválido.' using errcode = 'FA400';
  end if;
  t_tone := private.j_text(p_course, 'tone', 1, 10);
  if t_tone not in ('blue', 'magenta', 'ink', 'lime', 'paper') then
    raise exception 'Cor da arte inválida.' using errcode = 'FA400';
  end if;
  t_plan := private.j_text(p_course, 'plan', 1, 10);
  if t_plan not in ('free', 'pro') then
    raise exception 'Plano inválido.' using errcode = 'FA400';
  end if;
  t_access := private.j_text(p_course, 'access', 1, 12);
  if t_access not in ('todos', 'assinantes') then
    raise exception 'Regra de acesso inválida.' using errcode = 'FA400';
  end if;
  t_status := private.j_text(p_course, 'status', 1, 12);
  if t_status not in ('rascunho', 'agendado', 'publicado', 'arquivado') then
    raise exception 'Status inválido.' using errcode = 'FA400';
  end if;
  if t_status = 'agendado' then
    begin
      t_publish := (private.j_text(p_course, 'publishAt', 1, 40))::timestamptz;
    exception when others then
      raise exception 'Escolha a data e a hora da publicação.' using errcode = 'FA400';
    end;
    if t_publish <= now() and not (had_old and old.status = 'agendado' and old.publish_at = t_publish) then
      raise exception 'Escolha uma data e hora no futuro.' using errcode = 'FA400';
    end if;
  end if;
  t_pos := private.j_int(p_course, 'order', 0, 100000, null);
  if t_pos is null then
    t_pos := case when had_old then old.position else (select coalesce(max(position) + 1, 0) from public.courses) end;
  end if;

  t_prereq := private.j_texts(p_course, 'prerequisites', 10, 40);
  t_related := private.j_texts(p_course, 'related', 10, 40);
  if cid = any (t_prereq) or cid = any (t_related) then
    raise exception 'Um curso não pode ser pré-requisito nem relacionado dele mesmo.' using errcode = 'FA400';
  end if;
  if (select count(*) from public.courses where id = any (t_prereq)) <> cardinality(t_prereq)
     or (select count(*) from public.courses where id = any (t_related)) <> cardinality(t_related) then
    raise exception 'Algum curso de pré-requisito ou relacionado não existe mais.' using errcode = 'FA400';
  end if;

  proj := coalesce(nullif(p_course -> 'project', 'null'::jsonb), '{}'::jsonb);
  cert := coalesce(nullif(p_course -> 'certificate', 'null'::jsonb), '{}'::jsonb);
  if jsonb_typeof(proj) <> 'object' or jsonb_typeof(cert) <> 'object' then
    raise exception 'Projeto ou certificado inválido.' using errcode = 'FA400';
  end if;

  mods := coalesce(nullif(p_course -> 'modules', 'null'::jsonb), '[]'::jsonb);
  if jsonb_typeof(mods) <> 'array' or jsonb_array_length(mods) > 60 then
    raise exception 'O curso aceita no máximo 60 módulos.' using errcode = 'FA400';
  end if;

  if had_old then
    update public.courses set
      title = t_title,
      subtitle = private.j_text(p_course, 'subtitle', 0, 120),
      summary = private.j_text(p_course, 'summary', 20, 220),
      description = private.j_text(p_course, 'description', 0, 4000),
      category_id = t_cat,
      instructor = private.j_text(p_course, 'instructor', 0, 80),
      level = t_level,
      language = private.j_text(p_course, 'language', 1, 30),
      tags = private.j_texts(p_course, 'tags', 12, 30),
      hours = private.j_int(p_course, 'hours', 1, 500, null),
      outcomes = private.j_texts(p_course, 'outcomes', 12, 160),
      audience = private.j_text(p_course, 'audience', 0, 300),
      skills = private.j_texts(p_course, 'skills', 15, 40),
      tone = t_tone,
      glyph = private.j_text(p_course, 'glyph', 0, 3),
      position = t_pos,
      featured = private.j_bool(p_course, 'featured', false),
      recommended = private.j_bool(p_course, 'recommended', false),
      hidden = private.j_bool(p_course, 'hidden', false),
      prerequisites = t_prereq,
      related = t_related,
      status = t_status,
      publish_at = case when t_status = 'agendado' then t_publish else null end,
      plan = t_plan,
      access = t_access,
      project_title = private.j_text(proj, 'title', 0, 120),
      project_brief = private.j_text(proj, 'brief', 0, 600),
      project_expected = private.j_text(proj, 'expected', 0, 600),
      project_steps = private.j_texts(proj, 'steps', 8, 120),
      cert_enabled = private.j_bool(cert, 'enabled', true),
      cert_hours = private.j_int(cert, 'hours', 1, 500, null),
      cert_note = private.j_text(cert, 'note', 0, 160),
      updated_at = now()
    where id = cid;
  else
    insert into public.courses (
      id, title, subtitle, summary, description, category_id, instructor, level, language, tags, hours, outcomes,
      audience, skills, tone, glyph, position, featured, recommended, hidden, prerequisites, related, status,
      publish_at, plan, access, project_title, project_brief, project_expected, project_steps,
      cert_enabled, cert_hours, cert_note
    ) values (
      cid, t_title,
      private.j_text(p_course, 'subtitle', 0, 120),
      private.j_text(p_course, 'summary', 20, 220),
      private.j_text(p_course, 'description', 0, 4000),
      t_cat,
      private.j_text(p_course, 'instructor', 0, 80),
      t_level,
      private.j_text(p_course, 'language', 1, 30),
      private.j_texts(p_course, 'tags', 12, 30),
      private.j_int(p_course, 'hours', 1, 500, null),
      private.j_texts(p_course, 'outcomes', 12, 160),
      private.j_text(p_course, 'audience', 0, 300),
      private.j_texts(p_course, 'skills', 15, 40),
      t_tone,
      private.j_text(p_course, 'glyph', 0, 3),
      t_pos,
      private.j_bool(p_course, 'featured', false),
      private.j_bool(p_course, 'recommended', false),
      private.j_bool(p_course, 'hidden', false),
      t_prereq, t_related, t_status,
      case when t_status = 'agendado' then t_publish else null end,
      t_plan, t_access,
      private.j_text(proj, 'title', 0, 120),
      private.j_text(proj, 'brief', 0, 600),
      private.j_text(proj, 'expected', 0, 600),
      private.j_texts(proj, 'steps', 8, 120),
      private.j_bool(cert, 'enabled', true),
      private.j_int(cert, 'hours', 1, 500, null),
      private.j_text(cert, 'note', 0, 160)
    );
  end if;

  -- Módulos, aulas e materiais
  for m in select * from jsonb_array_elements(mods) loop
    if jsonb_typeof(m) <> 'object' then
      raise exception 'Módulo inválido.' using errcode = 'FA400';
    end if;
    mid := private.j_text(m, 'id', 1, 40);
    if mid !~ '^[a-z0-9-]{1,40}$' or mid = any (mod_ids) then
      raise exception 'Identificador de módulo inválido ou repetido.' using errcode = 'FA400';
    end if;
    if exists (select 1 from public.course_modules x where x.id = mid and x.course_id <> cid) then
      raise exception 'Identificador de módulo já usado em outro curso.' using errcode = 'FA400';
    end if;
    mod_ids := mod_ids || mid;
    insert into public.course_modules (id, course_id, title, description, archived, position)
    values (mid, cid, private.j_text(m, 'title', 1, 90), private.j_text(m, 'desc', 0, 300),
            private.j_bool(m, 'archived', false), mi)
    on conflict (id) do update set
      title = excluded.title, description = excluded.description, archived = excluded.archived, position = excluded.position;
    mi := mi + 1;

    li := 0;
    if jsonb_typeof(coalesce(m -> 'lessons', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(m -> 'lessons', '[]'::jsonb)) > 200 then
      raise exception 'Cada módulo aceita no máximo 200 aulas.' using errcode = 'FA400';
    end if;
    for l in select * from jsonb_array_elements(coalesce(m -> 'lessons', '[]'::jsonb)) loop
      if jsonb_typeof(l) <> 'object' then
        raise exception 'Aula inválida.' using errcode = 'FA400';
      end if;
      total_lessons := total_lessons + 1;
      if total_lessons > 400 then
        raise exception 'O curso aceita no máximo 400 aulas.' using errcode = 'FA400';
      end if;
      lid := private.j_text(l, 'id', 1, 40);
      if lid !~ '^[a-z0-9-]{1,40}$' or lid = any (les_ids) then
        raise exception 'Identificador de aula inválido ou repetido.' using errcode = 'FA400';
      end if;
      if exists (select 1 from public.lessons x where x.id = lid and x.course_id <> cid) then
        raise exception 'Identificador de aula já usado em outro curso.' using errcode = 'FA400';
      end if;
      les_ids := les_ids || lid;
      -- Vídeo: null = sem vídeo; { "url": "https://..." } = vídeo por link.
      video := null;
      if jsonb_typeof(l -> 'video') = 'object' then
        video := private.j_https(l -> 'video', 'url');
      elsif l -> 'video' is not null and jsonb_typeof(l -> 'video') <> 'null' then
        raise exception 'Vídeo inválido.' using errcode = 'FA400';
      end if;
      insert into public.lessons (id, module_id, course_id, title, description, minutes, published, video_url, position)
      values (lid, mid, cid, private.j_text(l, 'title', 3, 120), private.j_text(l, 'desc', 0, 2000),
              private.j_int(l, 'min', 1, 300, null), private.j_bool(l, 'published', true), video, li)
      on conflict (id) do update set
        module_id = excluded.module_id, title = excluded.title, description = excluded.description,
        minutes = excluded.minutes, published = excluded.published, video_url = excluded.video_url,
        position = excluded.position;
      li := li + 1;

      mat_ids := '{}';
      mti := 0;
      if jsonb_typeof(coalesce(l -> 'materials', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(l -> 'materials', '[]'::jsonb)) > 20 then
        raise exception 'Cada aula aceita no máximo 20 materiais.' using errcode = 'FA400';
      end if;
      for mt in select * from jsonb_array_elements(coalesce(l -> 'materials', '[]'::jsonb)) loop
        if jsonb_typeof(mt) <> 'object' then
          raise exception 'Material inválido.' using errcode = 'FA400';
        end if;
        mtid := private.j_text(mt, 'id', 1, 40);
        if mtid !~ '^[a-z0-9-]{1,40}$' or mtid = any (mat_ids) then
          raise exception 'Identificador de material inválido ou repetido.' using errcode = 'FA400';
        end if;
        if exists (select 1 from public.lesson_materials x join public.lessons y on y.id = x.lesson_id
                    where x.id = mtid and y.course_id <> cid) then
          raise exception 'Identificador de material já usado em outro curso.' using errcode = 'FA400';
        end if;
        mat_ids := mat_ids || mtid;
        if private.j_https(mt, 'url') is null then
          raise exception 'Todo material precisa de um endereço https://.' using errcode = 'FA400';
        end if;
        insert into public.lesson_materials (id, lesson_id, label, url, position)
        values (mtid, lid, private.j_text(mt, 'label', 1, 90), private.j_https(mt, 'url'), mti)
        on conflict (id) do update set lesson_id = excluded.lesson_id, label = excluded.label, url = excluded.url, position = excluded.position;
        mti := mti + 1;
      end loop;
      delete from public.lesson_materials x where x.lesson_id = lid and x.id <> all (mat_ids);
    end loop;
  end loop;

  -- O que saiu do curso é apagado (o progresso dos alunos fica guardado).
  delete from public.lessons where course_id = cid and id <> all (les_ids);
  delete from public.course_modules where course_id = cid and id <> all (mod_ids);

  -- Para publicar (ou agendar) o curso precisa estar completo.
  if t_status in ('publicado', 'agendado') then
    problems := private.course_problems(cid, not had_old or old.status is distinct from t_status);
    if cardinality(problems) > 0 then
      raise exception 'O curso ainda não pode ser publicado: %', array_to_string(problems, ' ') using errcode = 'FA422';
    end if;
  end if;

  if had_old and old.status is distinct from t_status then
    note := 'Status: ' || old.status || ' → ' || t_status;
  end if;
  perform private.audit_content(case when p_is_new then 'curso.criado' else 'curso.atualizado' end, t_title, note);
  select updated_at into result_stamp from public.courses where id = cid;
  return jsonb_build_object('id', cid, 'updatedAt', result_stamp);
end;
$$;

-- Troca o status do curso (publicar, despublicar, voltar para rascunho, agendar).
create function public.admin_set_course_status(p_id text, p_status text, p_publish_at text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor int := private.require_rank(1);
  c public.courses%rowtype;
  at_time timestamptz;
  problems text[];
begin
  if p_id is null or p_id !~ '^[a-z0-9-]{1,40}$' or p_status is null or p_status not in ('rascunho', 'agendado', 'publicado', 'arquivado') then
    raise exception 'Pedido inválido.' using errcode = 'FA400';
  end if;
  perform private.count_write();
  perform pg_advisory_xact_lock(hashtextextended('course:' || p_id, 0));
  actor := private.require_rank(1);
  select * into c from public.courses where id = p_id for update;
  if not found then
    raise exception 'Curso não encontrado. Ele pode ter sido excluído.' using errcode = 'FA404';
  end if;
  if p_status = 'agendado' then
    begin
      at_time := p_publish_at::timestamptz;
    exception when others then
      raise exception 'Escolha a data e a hora da publicação.' using errcode = 'FA400';
    end;
    if at_time is null or at_time <= now() then
      raise exception 'Escolha uma data e hora no futuro.' using errcode = 'FA400';
    end if;
  end if;
  if p_status in ('publicado', 'agendado') then
    problems := private.course_problems(p_id, true);
    if cardinality(problems) > 0 then
      raise exception 'O curso ainda não pode ser publicado: %', array_to_string(problems, ' ') using errcode = 'FA422';
    end if;
  end if;
  update public.courses set status = p_status, publish_at = case when p_status = 'agendado' then at_time else null end,
         updated_at = now()
   where id = p_id;
  perform private.audit_content('curso.' || p_status, c.title, case when at_time is not null then 'Publicação em ' || to_char(at_time at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') else '' end);
  return jsonb_build_object('id', p_id, 'status', p_status);
end;
$$;

-- Liga ou desliga o destaque de um curso.
create function public.admin_set_featured(p_id text, p_featured boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor int := private.require_rank(1);
  t text;
begin
  if p_id is null or p_id !~ '^[a-z0-9-]{1,40}$' or p_featured is null then
    raise exception 'Pedido inválido.' using errcode = 'FA400';
  end if;
  perform private.count_write();
  perform pg_advisory_xact_lock(hashtextextended('course:' || p_id, 0));
  actor := private.require_rank(1);
  update public.courses set featured = p_featured, updated_at = now() where id = p_id returning title into t;
  if t is null then
    raise exception 'Curso não encontrado.' using errcode = 'FA404';
  end if;
  perform private.audit_content('curso.atualizado', t, case when p_featured then 'Marcado como destaque' else 'Removido dos destaques' end);
  return jsonb_build_object('id', p_id);
end;
$$;

-- Publica ou despublica uma aula (tela "Módulos e aulas").
create function public.admin_set_lesson_published(p_lesson text, p_published boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor int := private.require_rank(1);
  cid text;
  ltitle text;
  ctitle text;
begin
  if p_lesson is null or p_lesson !~ '^[a-z0-9-]{1,40}$' or p_published is null then
    raise exception 'Pedido inválido.' using errcode = 'FA400';
  end if;
  perform private.count_write();
  select course_id into cid from public.lessons where id = p_lesson;
  if cid is null then
    raise exception 'Aula não encontrada.' using errcode = 'FA404';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('course:' || cid, 0));
  actor := private.require_rank(1);
  update public.lessons set published = p_published where id = p_lesson returning title into ltitle;
  if ltitle is null then
    raise exception 'Aula não encontrada.' using errcode = 'FA404';
  end if;
  update public.courses set updated_at = now() where id = cid returning title into ctitle;
  perform private.audit_content('curso.atualizado', ctitle,
    'Aula "' || ltitle || '" ' || case when p_published then 'publicada' else 'despublicada' end);
  return jsonb_build_object('id', p_lesson, 'published', p_published);
end;
$$;

-- Exclui um curso (só administrador ou acima, e só se ninguém começou).
create function public.admin_delete_course(p_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor int := private.require_rank(2);
  t text;
  n_started int;
begin
  if p_id is null or p_id !~ '^[a-z0-9-]{1,40}$' then
    raise exception 'Pedido inválido.' using errcode = 'FA400';
  end if;
  perform private.count_write();
  perform pg_advisory_xact_lock(hashtextextended('course:' || p_id, 0));
  actor := private.require_rank(2);
  select title into t from public.courses where id = p_id for update;
  if t is null then
    raise exception 'Curso não encontrado.' using errcode = 'FA404';
  end if;
  select count(*) into n_started from public.course_progress cp where cp.course_id = p_id and cp.started;
  if n_started > 0 then
    raise exception 'Alunos já começaram este curso. Para não apagar o histórico deles, despublique o curso em vez de excluir.' using errcode = 'FA400';
  end if;
  update public.courses set
    prerequisites = array_remove(prerequisites, p_id),
    related = array_remove(related, p_id)
   where p_id = any (prerequisites) or p_id = any (related);
  delete from public.courses where id = p_id;
  perform private.audit_content('curso.excluido', t, 'Exclusão definitiva');
  return jsonb_build_object('id', p_id);
end;
$$;

-- Tags sugeridas (a lista inteira de uma vez).
create function public.admin_save_tags(p_tags text[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor int := private.require_rank(1);
  clean text[];
begin
  if p_tags is null or cardinality(p_tags) > 100 then
    raise exception 'Pedido inválido.' using errcode = 'FA400';
  end if;
  select coalesce(array_agg(t order by t), '{}') into clean
    from (select distinct btrim(x) as t from unnest(p_tags) x) s
   where t <> '' and char_length(t) <= 30 and t !~ '[\x01-\x1f\x7f]';
  perform private.count_write();
  perform pg_advisory_xact_lock(hashtextextended('catalog:tags', 0));
  actor := private.require_rank(1);
  delete from public.catalog_tags;
  insert into public.catalog_tags (tag) select unnest(clean);
  perform private.audit_content('catalogo.atualizado', 'Tags', cardinality(clean) || ' tags');
  return jsonb_build_object('count', cardinality(clean));
end;
$$;

-- Renomeia (ou, com p_to vazio, remove) uma tag em todos os cursos.
create function public.admin_rename_tag(p_from text, p_to text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor int := private.require_rank(1);
  src text := btrim(coalesce(p_from, ''));
  dst text := btrim(coalesce(p_to, ''));
  n int;
begin
  if src = '' or char_length(src) > 30 or char_length(dst) > 30 or dst ~ '[\x01-\x1f\x7f]' then
    raise exception 'Pedido inválido.' using errcode = 'FA400';
  end if;
  perform private.count_write();
  perform pg_advisory_xact_lock(hashtextextended('catalog:tags', 0));
  actor := private.require_rank(1);
  update public.courses c set
    tags = (
      select coalesce(array_agg(t order by o), '{}') from (
        select distinct on (lower(t)) t, o from (
          select case when x = src then dst else x end as t, o from unnest(c.tags) with ordinality as u(x, o)
        ) r where t <> '' order by lower(t), o
      ) d
    ),
    updated_at = now()
   where src = any (c.tags);
  get diagnostics n = row_count;
  delete from public.catalog_tags where tag = src;
  if dst <> '' then
    insert into public.catalog_tags (tag) values (dst) on conflict do nothing;
  end if;
  perform private.audit_content('catalogo.atualizado', 'Tags',
    case when dst = '' then 'Tag "' || src || '" removida' else 'Tag "' || src || '" → "' || dst || '"' end);
  return jsonb_build_object('courses', n);
end;
$$;

-- O histórico passa a filtrar também por ações do catálogo.
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
  if coalesce(p_kind, '') not in ('all', 'permissao', 'usuario', 'conteudo') then
    raise exception 'Filtro inválido.' using errcode = 'FA400';
  end if;
  return (
    select coalesce(jsonb_agg(x.j order by x.at desc), '[]'::jsonb) from (
      select a.at, jsonb_build_object('id', a.id, 'at', a.at, 'action', a.action, 'actor', a.actor_label, 'actorId', a.actor_id,
        'actorRole', a.actor_role, 'target', a.target_label, 'targetId', a.target_id, 'detail', a.detail) as j
      from private.admin_audit a
      where p_kind = 'all'
         or (p_kind = 'conteudo' and a.action ~ '^(curso|categoria|categorias|catalogo)\.')
         or (p_kind <> 'conteudo' and a.action like p_kind || '.%')
      order by a.at desc
      limit lim
    ) x
  );
end;
$$;

revoke execute on function public.admin_save_category(jsonb, boolean), public.admin_delete_category(text),
  public.admin_reorder(text, text[]), public.admin_save_course(jsonb, boolean, text, boolean),
  public.admin_set_course_status(text, text, text), public.admin_set_featured(text, boolean),
  public.admin_set_lesson_published(text, boolean), public.admin_delete_course(text),
  public.admin_save_tags(text[]), public.admin_rename_tag(text, text), public.admin_audit_log(text, int)
  from public, anon, service_role;
grant execute on function public.admin_save_category(jsonb, boolean), public.admin_delete_category(text),
  public.admin_reorder(text, text[]), public.admin_save_course(jsonb, boolean, text, boolean),
  public.admin_set_course_status(text, text, text), public.admin_set_featured(text, boolean),
  public.admin_set_lesson_published(text, boolean), public.admin_delete_course(text),
  public.admin_save_tags(text[]), public.admin_rename_tag(text, text), public.admin_audit_log(text, int)
  to authenticated;

commit;
