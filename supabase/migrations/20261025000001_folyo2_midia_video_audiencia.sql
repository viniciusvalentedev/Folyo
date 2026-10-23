-- ============================================================================
-- Folyo 2.0 · Fase 3 · Configurações, biblioteca de mídia, vídeo e audiência
--
-- Como usar: Supabase → SQL Editor → New query → cole este arquivo inteiro → Run.
-- Rode DEPOIS do SQL da Fase 2 (20261024000001_folyo2_catalogo.sql). Rode uma vez só.
-- Tudo roda numa transação: se algo der erro, nada fica pela metade. Faça um backup antes.
--
-- O que entra:
--   1. Configurações da plataforma (app_config): nome, frase de entrada, e-mail de suporte,
--      catálogo, publicação, avisos e números técnicos da audiência;
--   2. Biblioteca de mídia (media_files) com dois buckets no Storage:
--        catalog-images  (público: capas e imagens de categorias, só PNG/JPG/WebP até 5 MB)
--        catalog-files   (privado: PDFs de material, até 20 MB, entregues só por rota do site);
--   3. Cursos ganham capa, miniatura e banner (courses.images); categorias ganham imagem;
--      materiais de aula podem ser um arquivo da biblioteca (além de link);
--   4. Aulas ganham vídeo hospedado no Bunny Stream (lessons.video_kind / bunny_video_id);
--   5. Audiência: visualizações por dia (lesson_views) e sessões ao vivo (lesson_sessions),
--      gravadas só pela função player_event, e as funções do painel que lêem tudo isso
--      (admin_live, admin_report, admin_content_stats);
--   6. admin_save_course / admin_save_category / course_problems passam a conhecer o que é novo.
--
-- Quem lê o quê (igual às outras tabelas): ninguém grava direto nas tabelas; toda alteração
-- passa por funções que conferem o papel de quem chamou. Aluno nunca lê audiência de ninguém.
-- ============================================================================

begin;

-- 1. Configurações da plataforma ------------------------------------------------

create table public.app_config (
  id         boolean primary key default true check (id),
  data       jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 8000),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
comment on table public.app_config is 'Configurações da plataforma (uma única linha). Só as funções admin_* gravam.';
alter table public.app_config enable row level security;
revoke all on table public.app_config from public, anon, authenticated, service_role;
insert into public.app_config (id, data) values (true, '{}'::jsonb);

-- Valores de fábrica. Qualquer campo que faltar na linha usa o valor daqui.
create function private.config_defaults()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'name', 'Folyo',
    'tagline', 'Cursos práticos, projetos reais e um currículo que mostra o que você sabe fazer.',
    'supportEmail', '',
    'catalog', jsonb_build_object('pageSize', 12, 'showPlanBadge', true, 'defaultSort', 'relevancia'),
    'publishing', jsonb_build_object('requireCoverToPublish', true),
    'notifications', jsonb_build_object('draftStaleDays', 14, 'alertMissingVideo', true),
    'analytics', jsonb_build_object('heartbeatSec', 15, 'liveTimeoutSec', 45, 'activeTimeoutSec', 120, 'retentionDays', 180)
  )
$$;

-- Configuração em vigor (o que está salvo por cima dos valores de fábrica).
create function private.config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select d.v || coalesce(s.data, '{}'::jsonb)
         || jsonb_build_object(
              'catalog', (d.v -> 'catalog') || coalesce(s.data -> 'catalog', '{}'::jsonb),
              'publishing', (d.v -> 'publishing') || coalesce(s.data -> 'publishing', '{}'::jsonb),
              'notifications', (d.v -> 'notifications') || coalesce(s.data -> 'notifications', '{}'::jsonb),
              'analytics', (d.v -> 'analytics') || coalesce(s.data -> 'analytics', '{}'::jsonb))
    from (select private.config_defaults() as v) d
    left join public.app_config s on s.id
$$;

-- Só o que a tela de entrada, o catálogo e o player precisam saber (liberado até para quem
-- ainda não entrou: a frase da tela de login vem daqui). Nada sigiloso mora na configuração.
create function public.public_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'name', c ->> 'name',
    'tagline', c ->> 'tagline',
    'supportEmail', c ->> 'supportEmail',
    'catalog', jsonb_build_object('showPlanBadge', c -> 'catalog' -> 'showPlanBadge', 'defaultSort', c -> 'catalog' -> 'defaultSort'),
    'requireCover', c -> 'publishing' -> 'requireCoverToPublish',
    'notifications', jsonb_build_object('draftStaleDays', c -> 'notifications' -> 'draftStaleDays', 'alertMissingVideo', c -> 'notifications' -> 'alertMissingVideo'),
    'heartbeatSec', c -> 'analytics' -> 'heartbeatSec')
  from (select private.config() as c) x
$$;

-- Configuração completa para a tela de Configurações (administrador ou acima).
create function public.admin_get_config()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor int := private.require_rank(2);
begin
  return jsonb_build_object('data', private.config(), 'updatedAt', (select s.updated_at from public.app_config s where s.id));
end;
$$;

-- Salva as configurações. p_expected = "updatedAt" que a tela leu (recusa se outra pessoa salvou antes).
create function public.admin_save_config(p_config jsonb, p_expected text default null, p_force boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor int := private.require_rank(2);
  cur public.app_config%rowtype;
  cat jsonb;
  pub jsonb;
  noti jsonb;
  ana jsonb;
  nm text;
  mail text;
  tag text;
  hb int;
  live int;
  clean jsonb;
  sort_by text;
  stamp timestamptz;
begin
  if p_config is null or jsonb_typeof(p_config) <> 'object' or pg_column_size(p_config) > 6000 then
    raise exception 'Pedido inválido.' using errcode = 'FA400';
  end if;
  perform private.count_write();
  perform pg_advisory_xact_lock(hashtextextended('config', 0));
  actor := private.require_rank(2);
  select * into cur from public.app_config where id for update;
  if not coalesce(p_force, false) and p_expected is not null and cur.updated_at <> p_expected::timestamptz then
    raise exception 'As configurações foram alteradas por outra pessoa enquanto você editava.' using errcode = 'FA409';
  end if;

  nm := btrim(private.j_text(p_config, 'name', 1, 40));
  if char_length(nm) < 1 then
    raise exception 'Informe o nome da plataforma.' using errcode = 'FA400';
  end if;
  mail := btrim(private.j_text(p_config, 'supportEmail', 0, 120));
  if mail <> '' and mail !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'E-mail de suporte inválido.' using errcode = 'FA400';
  end if;
  tag := btrim(private.j_text(p_config, 'tagline', 0, 160));

  cat := coalesce(nullif(p_config -> 'catalog', 'null'::jsonb), '{}'::jsonb);
  pub := coalesce(nullif(p_config -> 'publishing', 'null'::jsonb), '{}'::jsonb);
  noti := coalesce(nullif(p_config -> 'notifications', 'null'::jsonb), '{}'::jsonb);
  ana := coalesce(nullif(p_config -> 'analytics', 'null'::jsonb), '{}'::jsonb);
  if jsonb_typeof(cat) <> 'object' or jsonb_typeof(pub) <> 'object' or jsonb_typeof(noti) <> 'object' or jsonb_typeof(ana) <> 'object' then
    raise exception 'Pedido inválido.' using errcode = 'FA400';
  end if;

  sort_by := private.j_text(cat, 'defaultSort', 1, 20);
  if sort_by not in ('relevancia', 'catalogo', 'curtos') then
    raise exception 'Ordenação padrão inválida.' using errcode = 'FA400';
  end if;
  hb := private.j_int(ana, 'heartbeatSec', 10, 60, null);
  live := private.j_int(ana, 'liveTimeoutSec', 10, 300, null);
  if hb is null or live is null or live < hb * 2 then
    raise exception 'O tempo de "assistindo" precisa ser pelo menos o dobro do intervalo do sinal (entre 10 e 300 s).' using errcode = 'FA400';
  end if;

  clean := jsonb_build_object(
    'name', nm,
    'tagline', tag,
    'supportEmail', mail,
    'catalog', jsonb_build_object(
      'pageSize', private.j_int(cat, 'pageSize', 5, 50, null),
      'showPlanBadge', private.j_bool(cat, 'showPlanBadge', true),
      'defaultSort', sort_by),
    'publishing', jsonb_build_object('requireCoverToPublish', private.j_bool(pub, 'requireCoverToPublish', true)),
    'notifications', jsonb_build_object(
      'draftStaleDays', private.j_int(noti, 'draftStaleDays', 1, 365, null),
      'alertMissingVideo', private.j_bool(noti, 'alertMissingVideo', true)),
    'analytics', jsonb_build_object(
      'heartbeatSec', hb,
      'liveTimeoutSec', live,
      'activeTimeoutSec', private.j_int(ana, 'activeTimeoutSec', 60, 900, null),
      'retentionDays', private.j_int(ana, 'retentionDays', 30, 730, 180)));
  if (clean #>> '{catalog,pageSize}') is null or (clean #>> '{notifications,draftStaleDays}') is null
     or (clean #>> '{analytics,activeTimeoutSec}') is null then
    raise exception 'Revise os números das configurações.' using errcode = 'FA400';
  end if;

  update public.app_config set data = clean, updated_at = now(), updated_by = auth.uid() where id returning updated_at into stamp;
  perform private.audit_content('config.alterada', 'Configurações', '');
  return jsonb_build_object('updatedAt', stamp);
end;
$$;

revoke execute on function private.config_defaults(), private.config() from public, anon, authenticated, service_role;
revoke execute on function public.public_config(), public.admin_get_config(), public.admin_save_config(jsonb, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.public_config() to anon, authenticated;
grant execute on function public.admin_get_config(), public.admin_save_config(jsonb, text, boolean) to authenticated;

-- 2. Biblioteca de mídia ------------------------------------------------------------

create table public.media_files (
  id         uuid primary key,
  kind       text not null check (kind in ('image', 'file')),
  name       text not null check (char_length(btrim(name)) between 1 and 120),
  alt        text not null default '' check (char_length(alt) <= 160),
  -- "<id do arquivo>/<versão>.<extensão>" dentro do bucket (a versão muda quando o arquivo é substituído).
  path       text not null unique check (path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp|pdf)$'),
  mime       text not null check (mime in ('image/png', 'image/jpeg', 'image/webp', 'application/pdf')),
  size       bigint not null check (size between 1 and 20971520),
  width      integer check (width is null or width between 1 and 20000),
  height     integer check (height is null or height between 1 and 20000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'image') = (mime like 'image/%'))
);
comment on table public.media_files is 'Biblioteca de mídia: imagens (bucket catalog-images) e PDFs (bucket catalog-files).';
create index media_files_created on public.media_files (created_at desc);

-- Capas, miniatura e banner do curso: { cover|thumb|banner: { media, x, y, alt } }.
alter table public.courses add column images jsonb not null default '{}'::jsonb
  check (jsonb_typeof(images) = 'object' and pg_column_size(images) < 2000);
alter table public.categories add column media_id uuid references public.media_files (id) on delete restrict;
-- Material de aula: link (url) OU arquivo da biblioteca (media_id).
alter table public.lesson_materials alter column url drop not null;
alter table public.lesson_materials add column media_id uuid references public.media_files (id) on delete restrict;
alter table public.lesson_materials add constraint lesson_materials_one_source check ((url is null) <> (media_id is null));
create index lesson_materials_media on public.lesson_materials (media_id) where media_id is not null;
create index categories_media on public.categories (media_id) where media_id is not null;

-- Vídeo da aula: nenhum, link (https) ou Bunny Stream.
alter table public.lessons add column video_kind text check (video_kind in ('link', 'bunny'));
alter table public.lessons add column bunny_video_id text check (bunny_video_id is null or bunny_video_id ~ '^[0-9a-f-]{36}$');
update public.lessons set video_kind = 'link' where video_url is not null;
alter table public.lessons add constraint lessons_video_source check (
  (video_kind is null and video_url is null and bunny_video_id is null)
  or (video_kind = 'link' and video_url is not null and bunny_video_id is null)
  or (video_kind = 'bunny' and video_url is null and bunny_video_id is not null));

alter table public.media_files enable row level security;
revoke all on table public.media_files from public, anon, authenticated, service_role;
grant select (id, kind, name, alt, path, mime, size, width, height, created_at, updated_at) on public.media_files to authenticated;
grant select (images) on public.courses to authenticated;
grant select (media_id) on public.categories to authenticated;
grant select (media_id) on public.lesson_materials to authenticated;
grant select (video_kind, bunny_video_id) on public.lessons to authenticated;

-- Imagens são públicas (capas de curso); arquivos só aparecem para a equipe e para quem
-- enxerga a aula do material (a regra de lesson_materials vale aqui dentro também).
create policy "Mídia: imagens para todos, arquivos para quem pode ver" on public.media_files for select to authenticated
  using (kind = 'image' or (select private.catalog_staff()) or exists (select 1 from public.lesson_materials m where m.media_id = media_files.id));
create policy "Conta suspensa não acessa" on public.media_files as restrictive for select to authenticated
  using ((select private.not_suspended()));

-- Storage ------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('catalog-images', 'catalog-images', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('catalog-files', 'catalog-files', false, 20971520, array['application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = 20971520, allowed_mime_types = array['application/pdf'];

-- Equipe (editor ou acima) envia, lê e apaga; o nome do arquivo tem formato fixo (sem pastas soltas).
create policy "Equipe envia mídia do catálogo" on storage.objects for insert to authenticated
  with check (
    (select private.catalog_staff())
    and ((bucket_id = 'catalog-images' and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$')
      or (bucket_id = 'catalog-files' and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$')));
create policy "Equipe lê mídia do catálogo" on storage.objects for select to authenticated
  using (bucket_id in ('catalog-images', 'catalog-files') and (select private.catalog_staff()));
create policy "Equipe apaga mídia do catálogo" on storage.objects for delete to authenticated
  using (bucket_id in ('catalog-images', 'catalog-files') and (select private.catalog_staff()));
-- Aluno lê um PDF só se ele aparece como material de uma aula que ele enxerga (usado para gerar o link de download).
create policy "Aluno lê PDF de material visível" on storage.objects for select to authenticated
  using (bucket_id = 'catalog-files' and exists (
    select 1 from public.media_files f join public.lesson_materials m on m.media_id = f.id where f.path = storage.objects.name));
create policy "Conta suspensa não acessa a mídia" on storage.objects as restrictive for all to authenticated
  using (bucket_id not in ('catalog-images', 'catalog-files') or (select private.not_suspended()))
  with check (bucket_id not in ('catalog-images', 'catalog-files') or (select private.not_suspended()));

-- Quantos lugares usam o arquivo (0 = pode excluir).
create function private.media_uses(p_id uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*) from public.courses c where jsonb_path_exists(c.images, '$.*.media ? (@ == $m)', jsonb_build_object('m', p_id::text)))::int
       + (select count(*) from public.categories x where x.media_id = p_id)::int
       + (select count(*) from public.lesson_materials m where m.media_id = p_id)::int
$$;
revoke execute on function private.media_uses(uuid) from public, anon, authenticated, service_role;

-- Dados do objeto que o Storage guarda (tamanho e tipo reais, não os que a tela disse).
create function private.stored_object(p_bucket text, p_path text)
returns table (size bigint, mime text)
language sql
stable
security definer
set search_path = ''
as $$
  select (o.metadata ->> 'size')::bigint, o.metadata ->> 'mimetype'
    from storage.objects o where o.bucket_id = p_bucket and o.name = p_path
$$;
revoke execute on function private.stored_object(text, text) from public, anon, authenticated, service_role;

-- Funções do painel ------------------------------------------------------------------

-- Registra um arquivo que já foi enviado ao Storage (depois do site conferir o conteúdo dele).
create function public.admin_register_media(p_id uuid, p_path text, p_name text, p_width int default null, p_height int default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor int := private.require_rank(1);
  ext text;
  k text;
  bucket text;
  expected_mime text;
  st record;
  n_name text := btrim(coalesce(p_name, ''));
  row_out public.media_files%rowtype;
begin
  if p_id is null or p_path is null or p_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp|pdf)$'
     or split_part(p_path, '/', 1) <> p_id::text
     or char_length(n_name) not between 1 and 120 or n_name ~ '[\x01-\x1f\x7f]' then
    raise exception 'Pedido inválido.' using errcode = 'FA400';
  end if;
  if (p_width is not null and p_width not between 1 and 20000) or (p_height is not null and p_height not between 1 and 20000) then
    raise exception 'Dimensões inválidas.' using errcode = 'FA400';
  end if;
  perform private.count_write();
  perform pg_advisory_xact_lock(hashtextextended('media', 0));
  actor := private.require_rank(1);
  ext := substring(p_path from '\.([a-z]+)$');
  k := case when ext = 'pdf' then 'file' else 'image' end;
  bucket := case when k = 'file' then 'catalog-files' else 'catalog-images' end;
  expected_mime := case ext when 'png' then 'image/png' when 'jpg' then 'image/jpeg' when 'webp' then 'image/webp' else 'application/pdf' end;
  select * into st from private.stored_object(bucket, p_path);
  if st.size is null then
    raise exception 'Não encontramos o arquivo enviado. Tente enviar de novo.' using errcode = 'FA404';
  end if;
  if st.mime is distinct from expected_mime then
    raise exception 'O tipo do arquivo enviado não confere.' using errcode = 'FA400';
  end if;
  if exists (select 1 from public.media_files where id = p_id or path = p_path) then
    raise exception 'Este arquivo já foi registrado.' using errcode = 'FA410';
  end if;
  if (select count(*) from public.media_files) >= 2000 then
    raise exception 'A biblioteca chegou ao limite de 2.000 arquivos.' using errcode = 'FA400';
  end if;
  if (select coalesce(sum(size), 0) from public.media_files) + st.size > 5368709120 then
    raise exception 'A biblioteca chegou ao limite de 5 GB.' using errcode = 'FA400';
  end if;
  insert into public.media_files (id, kind, name, path, mime, size, width, height, created_by)
  values (p_id, k, n_name, p_path, expected_mime, st.size, p_width, p_height, auth.uid())
  returning * into row_out;
  perform private.audit_content('midia.enviada', n_name, case k when 'file' then 'PDF' else 'Imagem' end);
  return jsonb_build_object('id', row_out.id, 'size', row_out.size);
end;
$$;

-- Troca o arquivo de uma mídia mantendo o mesmo cadastro (vale em todos os lugares em que ela é usada).
create function public.admin_replace_media(p_id uuid, p_path text, p_width int default null, p_height int default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor int := private.require_rank(1);
  m public.media_files%rowtype;
  ext text;
  bucket text;
  expected_mime text;
  st record;
  old_path text;
begin
  if p_id is null or p_path is null or p_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp|pdf)$'
     or split_part(p_path, '/', 1) <> p_id::text then
    raise exception 'Pedido inválido.' using errcode = 'FA400';
  end if;
  if (p_width is not null and p_width not between 1 and 20000) or (p_height is not null and p_height not between 1 and 20000) then
    raise exception 'Dimensões inválidas.' using errcode = 'FA400';
  end if;
  perform private.count_write();
  perform pg_advisory_xact_lock(hashtextextended('media', 0));
  actor := private.require_rank(1);
  select * into m from public.media_files where id = p_id for update;
  if not found then
    raise exception 'Arquivo não encontrado.' using errcode = 'FA404';
  end if;
  ext := substring(p_path from '\.([a-z]+)$');
  if (m.kind = 'file') <> (ext = 'pdf') then
    raise exception 'O novo arquivo precisa ser do mesmo tipo do anterior.' using errcode = 'FA400';
  end if;
  bucket := case when m.kind = 'file' then 'catalog-files' else 'catalog-images' end;
  expected_mime := case ext when 'png' then 'image/png' when 'jpg' then 'image/jpeg' when 'webp' then 'image/webp' else 'application/pdf' end;
  select * into st from private.stored_object(bucket, p_path);
  if st.size is null then
    raise exception 'Não encontramos o arquivo enviado. Tente enviar de novo.' using errcode = 'FA404';
  end if;
  if st.mime is distinct from expected_mime then
    raise exception 'O tipo do arquivo enviado não confere.' using errcode = 'FA400';
  end if;
  if p_path = m.path then
    raise exception 'Pedido inválido.' using errcode = 'FA400';
  end if;
  old_path := m.path;
  update public.media_files
     set path = p_path, mime = expected_mime, size = st.size, width = p_width, height = p_height, updated_at = now()
   where id = p_id;
  perform private.audit_content('midia.substituida', m.name, '');
  return jsonb_build_object('oldPath', old_path, 'size', st.size);
end;
$$;

-- Muda o nome e o texto alternativo.
create function public.admin_update_media(p_id uuid, p_name text, p_alt text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor int := private.require_rank(1);
  n_name text := btrim(coalesce(p_name, ''));
  n_alt text := btrim(coalesce(p_alt, ''));
begin
  if p_id is null or char_length(n_name) not between 1 and 120 or char_length(n_alt) > 160
     or n_name || n_alt ~ '[\x01-\x1f\x7f]' then
    raise exception 'Pedido inválido.' using errcode = 'FA400';
  end if;
  perform private.count_write();
  actor := private.require_rank(1);
  update public.media_files set name = n_name, alt = n_alt, updated_at = now() where id = p_id;
  if not found then
    raise exception 'Arquivo não encontrado.' using errcode = 'FA404';
  end if;
  perform private.audit_content('midia.atualizada', n_name, '');
  return jsonb_build_object('id', p_id);
end;
$$;

-- Exclui uma mídia que ninguém usa. Devolve o caminho para o site apagar o arquivo do Storage.
create function public.admin_delete_media(p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor int := private.require_rank(1);
  m public.media_files%rowtype;
begin
  if p_id is null then
    raise exception 'Pedido inválido.' using errcode = 'FA400';
  end if;
  perform private.count_write();
  perform pg_advisory_xact_lock(hashtextextended('media', 0));
  actor := private.require_rank(1);
  select * into m from public.media_files where id = p_id for update;
  if not found then
    raise exception 'Arquivo não encontrado.' using errcode = 'FA404';
  end if;
  if private.media_uses(p_id) > 0 then
    raise exception 'Este arquivo está em uso. Tire-o dos cursos e categorias antes de excluir, ou use "Substituir arquivo".' using errcode = 'FA400';
  end if;
  delete from public.media_files where id = p_id;
  perform private.audit_content('midia.excluida', m.name, '');
  return jsonb_build_object('path', m.path, 'kind', m.kind);
end;
$$;

revoke execute on function public.admin_register_media(uuid, text, text, int, int), public.admin_replace_media(uuid, text, int, int),
  public.admin_update_media(uuid, text, text), public.admin_delete_media(uuid) from public, anon, service_role;
grant execute on function public.admin_register_media(uuid, text, text, int, int), public.admin_replace_media(uuid, text, int, int),
  public.admin_update_media(uuid, text, text), public.admin_delete_media(uuid) to authenticated;

-- 3. Funções do catálogo passam a conhecer imagens, vídeo do Bunny e materiais em arquivo ----

create or replace function private.course_problems(p_course text, p_full boolean)
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
  select count(*), count(*) filter (where l.video_kind is null), min(l.title) filter (where l.video_kind is null)
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
    if coalesce((private.config() -> 'publishing' ->> 'requireCoverToPublish')::boolean, true) and not (c.images ? 'cover') then
      out := array_append(out, 'Escolha uma capa para o curso.');
    end if;
    if char_length(btrim(c.title)) < 4 then out := array_append(out, 'Dê um título ao curso.'); end if;
    if char_length(btrim(c.summary)) < 20 then out := array_append(out, 'Escreva a descrição curta.'); end if;
    if char_length(btrim(c.description)) < 40 then out := array_append(out, 'Escreva a descrição completa (pelo menos 40 caracteres).'); end if;
    if cardinality(c.skills) = 0 then out := array_append(out, 'Informe pelo menos uma skill desenvolvida.'); end if;
  end if;
  return out;
end;
$$;

create or replace function public.admin_save_category(p_category jsonb, p_is_new boolean)
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
  cmedia uuid;
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
  if jsonb_typeof(p_category -> 'media') = 'string' then
    begin
      cmedia := (p_category ->> 'media')::uuid;
    exception when others then
      raise exception 'Imagem da categoria inválida.' using errcode = 'FA400';
    end;
  elsif p_category -> 'media' is not null and jsonb_typeof(p_category -> 'media') <> 'null' then
    raise exception 'Imagem da categoria inválida.' using errcode = 'FA400';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('catalog:categories', 0));
  actor := private.require_rank(1);
  if cmedia is not null and not exists (select 1 from public.media_files f where f.id = cmedia and f.kind = 'image' for share) then
    raise exception 'A imagem escolhida não existe mais na biblioteca.' using errcode = 'FA400';
  end if;
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
    insert into public.categories (id, name, description, icon, position, active, media_id)
    values (cid, cname, cdesc, cicon, least(pos, 100000), cactive, cmedia);
    perform private.audit_content('categoria.criada', cname, '');
  else
    update public.categories
       set name = cname, description = cdesc, icon = cicon, active = cactive, media_id = cmedia, updated_at = now()
     where id = cid;
    if not found then
      raise exception 'Categoria não encontrada.' using errcode = 'FA404';
    end if;
    perform private.audit_content('categoria.atualizada', cname, '');
  end if;
  return jsonb_build_object('id', cid);
end;
$$;

create or replace function public.admin_save_course(p_course jsonb, p_is_new boolean, p_expected text default null, p_force boolean default false)
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
  v_kind text;
  v_bunny text;
  imgs jsonb;
  img jsonb;
  slot text;
  clean_imgs jsonb := '{}'::jsonb;
  mat_url text;
  mat_media uuid;
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

  -- Imagens: { cover | thumb | banner: { media, x, y, alt } } (ou nada).
  imgs := coalesce(nullif(p_course -> 'images', 'null'::jsonb), '{}'::jsonb);
  if jsonb_typeof(imgs) <> 'object' then
    raise exception 'Imagens inválidas.' using errcode = 'FA400';
  end if;
  foreach slot in array array['cover', 'thumb', 'banner'] loop
    img := imgs -> slot;
    if img is null or jsonb_typeof(img) = 'null' then
      continue;
    end if;
    if jsonb_typeof(img) <> 'object' or jsonb_typeof(img -> 'media') <> 'string' then
      raise exception 'Imagem inválida.' using errcode = 'FA400';
    end if;
    begin
      mat_media := (img ->> 'media')::uuid;
    exception when others then
      raise exception 'Imagem inválida.' using errcode = 'FA400';
    end;
    if not exists (select 1 from public.media_files f where f.id = mat_media and f.kind = 'image' for share) then
      raise exception 'Uma das imagens escolhidas não existe mais na biblioteca.' using errcode = 'FA400';
    end if;
    clean_imgs := clean_imgs || jsonb_build_object(slot, jsonb_build_object(
      'media', mat_media::text,
      'x', private.j_int(img, 'x', 0, 100, 50),
      'y', private.j_int(img, 'y', 0, 100, 50),
      'alt', private.j_text(img, 'alt', 0, 160)));
  end loop;
  mat_media := null;

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
      images = clean_imgs,
      updated_at = now()
    where id = cid;
  else
    insert into public.courses (
      id, title, subtitle, summary, description, category_id, instructor, level, language, tags, hours, outcomes,
      audience, skills, tone, glyph, position, featured, recommended, hidden, prerequisites, related, status,
      publish_at, plan, access, project_title, project_brief, project_expected, project_steps,
      cert_enabled, cert_hours, cert_note, images
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
      private.j_text(cert, 'note', 0, 160),
      clean_imgs
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
      -- Vídeo: null = sem vídeo; { "kind": "link", "url": "https://..." } = link;
      -- { "kind": "bunny", "id": "<guid>" } = vídeo hospedado no Bunny Stream.
      video := null;
      v_kind := null;
      v_bunny := null;
      if jsonb_typeof(l -> 'video') = 'object' then
        v_kind := coalesce(nullif(l -> 'video' ->> 'kind', ''), 'link');
        if v_kind = 'link' then
          video := private.j_https(l -> 'video', 'url');
          if video is null then
            v_kind := null;
          end if;
        elsif v_kind = 'bunny' then
          v_bunny := private.j_text(l -> 'video', 'id', 1, 36);
          if v_bunny !~ '^[0-9a-f-]{36}$' then
            raise exception 'Identificador de vídeo inválido.' using errcode = 'FA400';
          end if;
        else
          raise exception 'Vídeo inválido.' using errcode = 'FA400';
        end if;
      elsif l -> 'video' is not null and jsonb_typeof(l -> 'video') <> 'null' then
        raise exception 'Vídeo inválido.' using errcode = 'FA400';
      end if;
      insert into public.lessons (id, module_id, course_id, title, description, minutes, published, video_kind, video_url, bunny_video_id, position)
      values (lid, mid, cid, private.j_text(l, 'title', 3, 120), private.j_text(l, 'desc', 0, 2000),
              private.j_int(l, 'min', 1, 300, null), private.j_bool(l, 'published', true), v_kind, video, v_bunny, li)
      on conflict (id) do update set
        module_id = excluded.module_id, title = excluded.title, description = excluded.description,
        minutes = excluded.minutes, published = excluded.published, video_kind = excluded.video_kind,
        video_url = excluded.video_url, bunny_video_id = excluded.bunny_video_id, position = excluded.position;
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
        -- Material: link (https) OU arquivo (PDF) da biblioteca.
        mat_url := null;
        mat_media := null;
        if jsonb_typeof(mt -> 'media') = 'string' then
          begin
            mat_media := (mt ->> 'media')::uuid;
          exception when others then
            raise exception 'Arquivo de material inválido.' using errcode = 'FA400';
          end;
          if not exists (select 1 from public.media_files f where f.id = mat_media and f.kind = 'file' for share) then
            raise exception 'Um dos arquivos de material não existe mais na biblioteca.' using errcode = 'FA400';
          end if;
        else
          mat_url := private.j_https(mt, 'url');
          if mat_url is null then
            raise exception 'Todo material precisa de um endereço https:// ou de um arquivo.' using errcode = 'FA400';
          end if;
        end if;
        insert into public.lesson_materials (id, lesson_id, label, url, media_id, position)
        values (mtid, lid, private.j_text(mt, 'label', 1, 90), mat_url, mat_media, mti)
        on conflict (id) do update set lesson_id = excluded.lesson_id, label = excluded.label, url = excluded.url,
          media_id = excluded.media_id, position = excluded.position;
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

-- O histórico do painel passa a mostrar também configurações e mídia.
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
         or (p_kind = 'conteudo' and a.action ~ '^(curso|categoria|categorias|catalogo|midia|config|relatorio)\.')
         or (p_kind <> 'conteudo' and a.action like p_kind || '.%')
      order by a.at desc
      limit lim
    ) x
  );
end;
$$;

-- 4. Audiência: visualizações e sessões ao vivo ---------------------------------------
-- Ninguém lê nem grava estas tabelas direto (nem o próprio aluno): a gravação é feita pela
-- função player_event e a leitura, pelas funções admin_* (só administrador ou acima).

create table public.lesson_views (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  lesson_id  text not null references public.lessons (id) on delete cascade,
  view_date  date not null,
  course_id  text not null,
  started_at timestamptz not null default now(),
  last_at    timestamptz not null default now(),
  completed  boolean not null default false,
  watched_sec integer not null default 0 check (watched_sec between 0 and 86400),
  max_pos    integer not null default 0 check (max_pos between 0 and 86400),
  duration   integer not null default 0 check (duration between 0 and 86400),
  primary key (user_id, lesson_id, view_date)
);
comment on table public.lesson_views is 'Uma linha por aluno, aula e dia: a primeira reprodução do dia conta uma visualização.';
create index lesson_views_date on public.lesson_views (view_date, course_id);
create index lesson_views_lesson on public.lesson_views (lesson_id, view_date);

create table public.lesson_sessions (
  id         uuid primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  course_id  text not null,
  lesson_id  text not null references public.lessons (id) on delete cascade,
  state      text not null check (state in ('playing', 'paused')),
  position   integer not null default 0 check (position between 0 and 86400),
  duration   integer not null default 0 check (duration between 0 and 86400),
  device     text not null default 'computador' check (device in ('computador', 'celular', 'tablet')),
  started_at timestamptz not null default now(),
  last_beat  timestamptz not null default now()
);
comment on table public.lesson_sessions is 'Sessões de reprodução abertas agora (somem sozinhas quando o sinal para de chegar).';
create index lesson_sessions_beat on public.lesson_sessions (last_beat);
create index lesson_sessions_user on public.lesson_sessions (user_id);

alter table public.lesson_views enable row level security;
alter table public.lesson_sessions enable row level security;
revoke all on table public.lesson_views, public.lesson_sessions from public, anon, authenticated, service_role;

-- Eventos do player: play, beat (sinal periódico), pause, end (terminou) e leave (saiu da aula).
-- Segurança: só a própria conta grava; a aula precisa existir, estar visível e ser do curso;
-- o tempo assistido que cada sinal soma nunca passa do tempo REAL desde o sinal anterior
-- (ninguém "inventa" horas assistidas chamando a API); sinais mais rápidos que 5 s são ignorados.
create function public.player_event(
  p_session uuid, p_course text, p_lesson text, p_event text,
  p_position int default 0, p_duration int default 0, p_device text default 'computador'
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  tz constant text := 'America/Sao_Paulo';
  today date := (now() at time zone tz)::date;
  pos int := least(greatest(coalesce(p_position, 0), 0), 86400);
  dur int := least(greatest(coalesce(p_duration, 0), 0), 86400);
  dev text := case when p_device in ('celular', 'tablet') then p_device else 'computador' end;
  s public.lesson_sessions%rowtype;
  had boolean;
  credit int := 0;
  done boolean;
  retention int;
begin
  if uid is null or not (select private.not_suspended()) then
    raise exception 'Faça login para continuar.' using errcode = 'FA403';
  end if;
  if p_session is null or p_event not in ('play', 'beat', 'pause', 'end', 'leave')
     or p_course is null or p_lesson is null or p_course !~ '^[a-z0-9-]{1,40}$' or p_lesson !~ '^[a-z0-9-]{1,40}$' then
    raise exception 'Pedido inválido.' using errcode = 'FA400';
  end if;
  if not exists (select 1 from public.lessons l where l.id = p_lesson and l.course_id = p_course) or not private.lesson_visible(p_lesson) then
    raise exception 'Aula não encontrada.' using errcode = 'FA404';
  end if;

  select * into s from public.lesson_sessions where id = p_session and user_id = uid for update;
  had := found;
  if had and (s.lesson_id <> p_lesson) then
    raise exception 'Pedido inválido.' using errcode = 'FA400';
  end if;
  -- Sinal rápido demais: ignora (o limite de 5 s protege o banco).
  if had and p_event = 'beat' and now() - s.last_beat < interval '5 seconds' then
    return;
  end if;

  -- Tempo a creditar: só se a sessão estava tocando, limitado ao tempo real e a 90 s por sinal.
  if had and s.state = 'playing' and p_event <> 'play' then
    credit := least(greatest(floor(extract(epoch from (now() - s.last_beat)))::int, 0), 90);
  end if;

  if p_event = 'leave' or p_event = 'end' then
    if had then
      delete from public.lesson_sessions where id = p_session;
    end if;
  else
    if had then
      update public.lesson_sessions
         set state = case when p_event = 'pause' then 'paused' else 'playing' end,
             position = pos, duration = case when dur > 0 then dur else duration end, device = dev, last_beat = now()
       where id = p_session;
    else
      -- No máximo 10 sessões abertas por conta (as mais antigas saem).
      delete from public.lesson_sessions where id in (
        select id from public.lesson_sessions where user_id = uid order by last_beat desc offset 9);
      insert into public.lesson_sessions (id, user_id, course_id, lesson_id, state, position, duration, device)
      values (p_session, uid, p_course, p_lesson, case when p_event = 'pause' then 'paused' else 'playing' end, pos, dur, dev);
    end if;
  end if;

  -- Visualização do dia: a primeira reprodução do dia cria a linha; sinais só somam tempo.
  done := p_event = 'end' or (dur > 0 and pos >= dur * 0.9);
  if p_event = 'play' then
    insert into public.lesson_views (user_id, lesson_id, view_date, course_id, max_pos, duration, completed)
    values (uid, p_lesson, today, p_course, least(pos, case when dur > 0 then dur else 86400 end), dur, done)
    on conflict (user_id, lesson_id, view_date) do update
      set max_pos = greatest(public.lesson_views.max_pos, excluded.max_pos),
          duration = greatest(public.lesson_views.duration, excluded.duration),
          completed = public.lesson_views.completed or excluded.completed,
          last_at = now();
  elsif credit > 0 or done or p_event = 'pause' then
    update public.lesson_views v
       set watched_sec = least(v.watched_sec + credit, 86400),
           max_pos = greatest(v.max_pos, least(pos, case when dur > 0 then dur else 86400 end)),
           duration = greatest(v.duration, dur),
           completed = v.completed or done,
           last_at = now()
     where v.user_id = uid and v.lesson_id = p_lesson and v.view_date = today;
  end if;

  -- Limpeza ocasional (1% dos eventos): sessões de mais de 1 dia e histórico além da retenção configurada.
  if random() < 0.01 then
    delete from public.lesson_sessions where last_beat < now() - interval '1 day';
    retention := coalesce((private.config() -> 'analytics' ->> 'retentionDays')::int, 180);
    delete from public.lesson_views where view_date < today - retention;
  end if;
end;
$$;

-- Números dos cursos e aulas para as listas do painel (editor ou acima).
create function public.admin_content_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor int := private.require_rank(1);
  live_s int := coalesce((private.config() -> 'analytics' ->> 'liveTimeoutSec')::int, 45);
begin
  return jsonb_build_object(
    'courses', (
      select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'enrolled', coalesce(e.n, 0), 'views', coalesce(v.n, 0), 'live', coalesce(l.n, 0))), '[]'::jsonb)
        from public.courses c
        left join (select course_id, count(*) n from public.course_progress where started group by course_id) e on e.course_id = c.id
        left join (select course_id, count(*) n from public.lesson_views group by course_id) v on v.course_id = c.id
        left join (select course_id, count(*) n from public.lesson_sessions
                    where state = 'playing' and last_beat >= now() - make_interval(secs => live_s) group by course_id) l on l.course_id = c.id),
    'lessons', (
      select coalesce(jsonb_agg(jsonb_build_object('id', lesson_id, 'views', n)), '[]'::jsonb)
        from (select lesson_id, count(*) n from public.lesson_views group by lesson_id) x));
end;
$$;

-- Quem está assistindo agora (administrador ou acima).
create function public.admin_live()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor int := private.require_rank(2);
  cfg jsonb := private.config() -> 'analytics';
  active_s int := coalesce((cfg ->> 'activeTimeoutSec')::int, 120);
begin
  return jsonb_build_object(
    'analytics', cfg,
    'now', now(),
    'views24h', (select count(*) from public.lesson_views v where v.started_at >= now() - interval '24 hours'),
    'sessions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'userId', s.user_id, 'name', coalesce(nullif(btrim(p.name), ''), ''), 'courseId', s.course_id,
        'lessonId', s.lesson_id, 'state', s.state, 'position', s.position, 'duration', s.duration,
        'device', s.device, 'startedAt', s.started_at, 'lastBeat', s.last_beat) order by s.last_beat desc), '[]'::jsonb)
        from (select * from public.lesson_sessions where last_beat >= now() - make_interval(secs => active_s) order by last_beat desc limit 500) s
        left join public.profiles p on p.id = s.user_id));
end;
$$;

-- Relatórios do período (administrador ou acima). Datas no fuso de São Paulo, no máximo 366 dias.
create function public.admin_report(p_from date, p_to date)
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
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 365 then
    raise exception 'Escolha um período de até 366 dias.' using errcode = 'FA400';
  end if;
  with
  pub as (
    select l.course_id, l.id as lesson_id
      from public.lessons l join public.course_modules m on m.id = l.module_id
     where l.published and not m.archived),
  pubn as (select course_id, count(*) as n from pub group by course_id),
  comp as (
    select c.user_id, c.course_id, count(*) as done, max(c.completed_at) as last_at
      from public.lesson_completions c join pub on pub.lesson_id = c.lesson_id
     group by c.user_id, c.course_id),
  fin as (
    select comp.user_id, comp.course_id, (comp.last_at at time zone tz)::date as d
      from comp join pubn on pubn.course_id = comp.course_id where pubn.n > 0 and comp.done >= pubn.n),
  ev as (
    select user_id, (completed_at at time zone tz)::date as d from public.lesson_completions
    union all select user_id, (started_at at time zone tz)::date from public.course_progress where started_at is not null
    union all select user_id, (created_at at time zone tz)::date from public.works
    union all select user_id, view_date from public.lesson_views
    union all select id, (last_sign_in_at at time zone tz)::date from auth.users where last_sign_in_at is not null),
  days as (select g.d::date as d from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') as g(d)),
  vw as (select * from public.lesson_views where view_date between p_from and p_to)
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'usersBefore', (select count(*) from public.profiles where (created_at at time zone tz)::date < p_from),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object(
        'd', days.d,
        'newUsers', (select count(*) from public.profiles x where (x.created_at at time zone tz)::date = days.d),
        'active', (select count(distinct e.user_id) from ev e where e.d = days.d),
        'enrollments', (select count(*) from public.course_progress x where x.started_at is not null and (x.started_at at time zone tz)::date = days.d),
        'completions', (select count(*) from fin where fin.d = days.d)) order by days.d), '[]'::jsonb) from days),
    'courses', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id,
        'enrolled', (select count(*) from public.course_progress x where x.course_id = c.id and x.started and (x.started_at at time zone tz)::date <= p_to),
        'views', (select count(*) from vw where vw.course_id = c.id),
        'watched', (select coalesce(sum(watched_sec), 0) from vw where vw.course_id = c.id),
        'avgProgress', (select round(avg(least(comp.done::numeric / pubn.n, 1)) * 100, 1)
                          from comp join pubn on pubn.course_id = comp.course_id where comp.course_id = c.id and pubn.n > 0),
        'completed', (select count(*) from fin where fin.course_id = c.id and fin.d <= p_to))), '[]'::jsonb) from public.courses c),
    'lessons', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', x.lesson_id, 'courseId', x.course_id, 'views', x.views, 'viewers', x.viewers, 'completed', x.completed,
        'watched', x.watched, 'reach', x.reach)), '[]'::jsonb)
        from (select lesson_id, course_id, count(*) as views, count(distinct user_id) as viewers,
                     count(*) filter (where completed) as completed, sum(watched_sec) as watched,
                     round(avg(least(max_pos::numeric / nullif(duration, 0), 1)) * 100, 1) as reach
                from vw group by lesson_id, course_id order by views desc limit 1500) x),
    'activity', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', y.id, 'name', y.name, 'email', y.email, 'days', y.days, 'views', y.views, 'watched', y.watched,
        'last', y.last_at, 'suspended', y.suspended)), '[]'::jsonb)
        from (select p.id, coalesce(nullif(btrim(p.name), ''), '') as name, coalesce(u.email, '') as email,
                     (select count(distinct e.d) from ev e where e.user_id = p.id and e.d between p_from and p_to) as days,
                     (select count(*) from vw where vw.user_id = p.id) as views,
                     (select coalesce(sum(watched_sec), 0) from vw where vw.user_id = p.id) as watched,
                     greatest(u.last_sign_in_at, (select max(last_at) from public.lesson_views z where z.user_id = p.id)) as last_at,
                     exists (select 1 from private.suspensions s where s.user_id = p.id) as suspended
                from public.profiles p left join auth.users u on u.id = p.id
               order by 4 desc, p.created_at desc limit 2000) y)
  ) into result;
  return result;
end;
$$;

-- Registra no histórico que alguém exportou um relatório (a exportação em si acontece no navegador).
create function public.admin_log_export(p_report text, p_rows int, p_from date, p_to date)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor int := private.require_rank(2);
begin
  if p_report is null or p_report not in ('crescimento', 'matriculas', 'cursos', 'aulas', 'atividade')
     or p_rows is null or p_rows not between 0 and 100000 or p_from is null or p_to is null then
    raise exception 'Pedido inválido.' using errcode = 'FA400';
  end if;
  perform private.count_write();
  perform private.audit_content('relatorio.exportado', p_report,
    p_rows || ' linhas · ' || to_char(p_from, 'DD/MM/YYYY') || ' a ' || to_char(p_to, 'DD/MM/YYYY'));
end;
$$;

revoke execute on function public.player_event(uuid, text, text, text, int, int, text), public.admin_content_stats(),
  public.admin_live(), public.admin_report(date, date), public.admin_log_export(text, int, date, date) from public, anon, service_role;
grant execute on function public.player_event(uuid, text, text, text, int, int, text), public.admin_content_stats(),
  public.admin_live(), public.admin_report(date, date), public.admin_log_export(text, int, date, date) to authenticated;

commit;
