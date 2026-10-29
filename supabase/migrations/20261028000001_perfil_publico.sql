-- Folyo · Perfil público de verdade (endereço /u/<nome>)
--
-- Rode UMA vez no Supabase (SQL Editor), ANTES de publicar o código novo.
-- Não apaga nada: acrescenta duas colunas em `profiles`, funções novas e UMA regra de leitura no Storage.
--
-- O que muda:
--   1. profiles.slug / profiles.slug_changed_at: o endereço do perfil (ex.: maria-silva) e quando foi trocado.
--      Só `set_my_slug()` consegue gravar essas colunas (um gatilho recusa qualquer outro caminho).
--   2. get_public_profile(slug): o que a página /u/<nome> mostra. Chamada SEM login. Só devolve algo se a pessoa
--      ligou "Perfil público" e escolheu o endereço. Devolve só os campos da página (nunca telefone, e-mail de
--      login, anotações, progresso aula a aula, trabalhos privados). Perfil privado, endereço que não existe e
--      conta suspensa têm a MESMA resposta (null).
--   3. get_public_work_file(slug, id): para o servidor abrir o PDF de um trabalho PÚBLICO (sem login).
--   4. Storage: visitantes podem ler (por URL assinada de 60 s, gerada pelo servidor) SÓ os PDFs de trabalhos que
--      estão públicos neste momento. Desligou o perfil, o portfólio ou o "Público" do trabalho: fecha na hora.
--
-- Como desfazer: veja o fim do arquivo.

begin;

-- ---------- 1. Endereço ----------

alter table public.profiles add column slug text;
alter table public.profiles add column slug_changed_at timestamptz;

alter table public.profiles
  add constraint profiles_slug_format
  check (slug is null or (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 30));

-- Um endereço por pessoa, sem diferenciar maiúsculas (o formato já é só minúsculas).
create unique index profiles_slug_key on public.profiles (slug) where slug is not null;

-- Nomes que ninguém pode escolher: rotas do site, marca e equipe. (Mesma lista de src/lib/public-profile.ts.)
create or replace function private.reserved_slugs()
returns text[] language sql immutable set search_path = '' as $$
  select array[
    'admin', 'administrador', 'ajuda', 'api', 'app', 'aula', 'auth', 'certificados', 'competencias', 'configuracoes',
    'conta', 'contato', 'curriculo', 'curso', 'cursos', 'entrar', 'equipe', 'esqueci-senha', 'folyo', 'inicio', 'login',
    'logout', 'mfa', 'null', 'objetivos', 'oficial', 'perfil', 'primeiro-acesso', 'privacidade', 'progresso', 'projetos',
    'publico', 'redefinir-senha', 'robots', 'root', 'sair', 'seguranca', 'sitemap', 'staff', 'suporte', 'termos',
    'undefined', 'usefolyo', 'www'
  ]
$$;

-- Trava: pelo site/API, o endereço só muda por set_my_slug(). Quem não tem sessão (SQL Editor, manutenção) passa.
create or replace function private.guard_profile_slug()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null
     and (new.slug is distinct from old.slug or new.slug_changed_at is distinct from old.slug_changed_at)
     and coalesce(current_setting('folyo.slug_ok', true), '') <> 'on' then
    raise exception 'O endereço do perfil só muda pela função set_my_slug.' using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger profiles_guard_slug
  before update on public.profiles
  for each row execute function private.guard_profile_slug();

-- Escolher ou trocar o endereço da PRÓPRIA conta. Devolve um código: ok | formato | reservado | em_uso | cedo | sem_login | suspensa.
-- A primeira escolha é livre; trocar de novo só depois de 7 dias (evita pegar nome emprestado e quebrar links).
create or replace function public.set_my_slug(p_slug text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_old text;
  v_changed timestamptz;
begin
  if v_uid is null then return 'sem_login'; end if;
  if exists (select 1 from private.suspensions s where s.user_id = v_uid) then return 'suspensa'; end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_slug) not between 3 and 30 then return 'formato'; end if;
  if v_slug = any (private.reserved_slugs()) then return 'reservado'; end if;

  select pr.slug, pr.slug_changed_at into v_old, v_changed from public.profiles pr where pr.id = v_uid for update;
  if not found then return 'sem_login'; end if;
  if v_old = v_slug then return 'ok'; end if;
  if v_old is not null and v_changed is not null and v_changed > now() - interval '7 days' then return 'cedo'; end if;

  perform set_config('folyo.slug_ok', 'on', true);
  begin
    update public.profiles set slug = v_slug, slug_changed_at = now() where id = v_uid;
  exception when unique_violation then
    perform set_config('folyo.slug_ok', '', true);
    return 'em_uso';
  end;
  perform set_config('folyo.slug_ok', '', true);
  return 'ok';
end
$$;

revoke all on function public.set_my_slug(text) from public, anon, authenticated;
grant execute on function public.set_my_slug(text) to authenticated;

-- ---------- 2. O que a página pública mostra ----------

create or replace function public.get_public_profile(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_pr record;
  v_courses jsonb;
  v_works jsonb;
begin
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_slug) not between 3 and 30 then return null; end if;

  select pr.id, pr.name, pr.headline, pr.bio, pr.city, pr.goals_text, pr.objective,
         pr.contact_email, pr.show_email, pr.public_portfolio, pr.experiences
    into v_pr
    from public.profiles pr
   where pr.slug = v_slug
     and pr.public_profile
     and pr.onboarded
     and not exists (select 1 from private.suspensions s where s.user_id = pr.id);
  if not found then return null; end if;

  -- Trabalhos: só os marcados como Públicos, e só se o portfólio público estiver ligado.
  if v_pr.public_portfolio then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', t.id, 'course_id', t.course_id, 'kind', t.kind, 'title', t.title, 'description', t.description,
             'url', case when t.kind = 'link' then t.url end,
             'file_name', case when t.kind = 'pdf' then t.file_name end,
             'file_size', case when t.kind = 'pdf' then t.file_size end,
             'created_at', t.created_at) order by t.created_at desc), '[]'::jsonb)
      into v_works
      from (
        select w.id, w.course_id, w.kind, w.title, w.description, w.url, w.file_name, w.file_size, w.created_at
          from public.works w
         where w.user_id = v_pr.id and w.is_public
         order by w.created_at desc
         limit 60
      ) t;
  else
    v_works := '[]'::jsonb;
  end if;

  -- Cursos: os concluídos e os dos trabalhos públicos. Mesma regra do site: só cursos no ar, só aulas publicadas
  -- de módulos não arquivados; "concluído" = todas as aulas feitas; "certificado" = concluído, curso emite certificado
  -- e (se pede projeto) a pessoa enviou algum trabalho nele.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'title', x.title, 'hours', x.hours, 'tone', x.tone, 'glyph', x.glyph,
           'complete', x.complete, 'completed_at', case when x.complete then x.last_done end,
           'certified', x.complete and x.cert_enabled and (btrim(coalesce(x.project_title, '')) = '' or x.delivered)
         ) order by x.title), '[]'::jsonb)
    into v_courses
    from (
      select c.id, c.title, c.hours, c.tone, c.glyph, c.cert_enabled, c.project_title,
             (pc.total > 0 and pc.done = pc.total) as complete,
             pc.last_done,
             exists (select 1 from public.works w2 where w2.user_id = v_pr.id and w2.course_id = c.id) as delivered
        from public.courses c
        join (
          select ll.course_id, count(*) as total, count(lc.lesson_id) as done, max(lc.completed_at) as last_done
            from (
              select l.id as lesson_id, l.course_id
                from public.lessons l
                join public.course_modules m on m.id = l.module_id
               where l.published and not m.archived
            ) ll
            left join public.lesson_completions lc
              on lc.user_id = v_pr.id and lc.lesson_id = ll.lesson_id and lc.course_id = ll.course_id
           group by ll.course_id
        ) pc on pc.course_id = c.id
       where (c.status in ('publicado', 'arquivado')
              or (c.status = 'agendado' and c.publish_at is not null and c.publish_at <= now()))
    ) x
   where x.complete
      or exists (select 1 from jsonb_array_elements(v_works) w3 where w3->>'course_id' = x.id);

  return jsonb_build_object(
    'name', v_pr.name,
    'headline', v_pr.headline,
    'bio', v_pr.bio,
    'city', v_pr.city,
    'goal', coalesce(nullif(btrim(v_pr.goals_text), ''), nullif(btrim(v_pr.objective), ''), ''),
    'email', case when v_pr.show_email and btrim(coalesce(v_pr.contact_email, '')) <> '' then v_pr.contact_email end,
    'experiences', case when jsonb_typeof(v_pr.experiences) = 'array' then (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', e.item->>'id', 'role', e.item->>'role', 'org', e.item->>'org', 'period', e.item->>'period'
             ) order by e.pos), '[]'::jsonb)
        from jsonb_array_elements(v_pr.experiences) with ordinality as e(item, pos)
       where jsonb_typeof(e.item) = 'object' and e.pos <= 20
    ) else '[]'::jsonb end,
    'courses', v_courses,
    'works', v_works
  );
end
$$;

revoke all on function public.get_public_profile(text) from public, anon, authenticated;
grant execute on function public.get_public_profile(text) to anon, authenticated;

-- ---------- 3 e 4. PDFs de trabalhos públicos ----------

-- "Este arquivo do Storage é de um trabalho público agora?" (usada pela regra do Storage e pela função abaixo)
create or replace function public.is_public_work_file(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.works w
      join public.profiles pr on pr.id = w.user_id
     where w.file_path = p_path
       and w.kind = 'pdf'
       and w.is_public
       and pr.public_profile
       and pr.public_portfolio
       and pr.slug is not null
       and pr.onboarded
       and not exists (select 1 from private.suspensions s where s.user_id = pr.id)
  )
$$;

revoke all on function public.is_public_work_file(text) from public, anon, authenticated;
grant execute on function public.is_public_work_file(text) to anon, authenticated;

-- Dados do PDF para o servidor abrir (só se o trabalho é do perfil do endereço e está público agora).
create or replace function public.get_public_work_file(p_slug text, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_file record;
begin
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_slug) not between 3 and 30 then return null; end if;
  select w.file_path, w.file_name into v_file
    from public.works w
    join public.profiles pr on pr.id = w.user_id
   where w.id = p_id
     and pr.slug = v_slug
     and w.kind = 'pdf'
     and w.is_public
     and w.file_path is not null
     and pr.public_profile
     and pr.public_portfolio
     and pr.onboarded
     and not exists (select 1 from private.suspensions s where s.user_id = pr.id);
  if not found then return null; end if;
  return jsonb_build_object('file_path', v_file.file_path, 'file_name', v_file.file_name);
end
$$;

revoke all on function public.get_public_work_file(text, uuid) from public, anon, authenticated;
grant execute on function public.get_public_work_file(text, uuid) to anon, authenticated;

-- Visitantes (e qualquer conta) podem LER só os PDFs públicos. As regras do dono continuam como estão.
create policy "student_works_public_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'student-works' and public.is_public_work_file(name));

commit;

-- ---------- Como desfazer (rode só se precisar) ----------
-- drop policy if exists "student_works_public_read" on storage.objects;
-- drop function if exists public.get_public_work_file(text, uuid);
-- drop function if exists public.is_public_work_file(text);
-- drop function if exists public.get_public_profile(text);
-- drop function if exists public.set_my_slug(text);
-- drop trigger if exists profiles_guard_slug on public.profiles;
-- drop function if exists private.guard_profile_slug();
-- drop function if exists private.reserved_slugs();
-- drop index if exists public.profiles_slug_key;
-- alter table public.profiles drop constraint if exists profiles_slug_format;
-- alter table public.profiles drop column if exists slug_changed_at;
-- alter table public.profiles drop column if exists slug;
